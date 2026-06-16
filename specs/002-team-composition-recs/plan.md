# Implementation Plan: Composition-Aware Recommendations

**Branch**: `002-team-composition-recs` | **Date**: 2026-06-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-team-composition-recs/spec.md`

## Summary

Extend the existing champion pool recommender so that, during champion select,
rankings reflect **both** how well each pool champion counters the revealed enemies
**and** how well they synergize with the allies already locked in — combined at a
50/50 weight (FR-013, user-confirmed).

Technical approach: the pure `src/recommendation/` engine gains a new
`scoreWithAllies()` helper and a combined-scoring path in `computeRecommendation()`;
the LCU normalizer is extended to expose `allyChampionIds` from the existing
`myTeam[]` field (already in the parsed response, zero new LCU calls); a new
`champion_synergy` SQLite table (migration 002) stores per-pool ally win-rate data
fetched by a new `LolalyticsMatchupProvider` on the existing daily refresh cycle;
and `RecommendationEntry` gains a `scoreBreakdown` field for the score-breakdown UI
panel (US3). No new IPC channels are needed — only the types carried over existing
channels change.

## Technical Context

**Language/Version**: TypeScript 5.x; Node.js runtime per pinned Electron version (unchanged from spec 001)

**Primary Dependencies**: Electron, Vue 3, Vuetify 3, better-sqlite3, electron-vite, electron-builder (all unchanged — no new runtime dependencies)

**Storage**: SQLite via better-sqlite3 — adds `champion_synergy` table and `ally_champion_ids` column to `champ_select_snapshot` via migration `002_add_synergy.sql`

**Testing**: Vitest — unit tests for `src/recommendation/` (no Electron runtime required, Principle VI); contract test for `SynergyProvider`; manual LCU checklist per constitution for any change to `src/main/lcu/`

**Target Platform**: Desktop, Windows 10/11 primary (unchanged)

**Project Type**: Desktop application (Electron, single window) — unchanged

**Performance Goals**: Combined-score computation remains under 100ms (pure in-memory arithmetic over cached SQLite rows, Principle V); ally lock-in triggers recommendation refresh within 1 second (SC-001, Principle V)

**Constraints**: Pool-constraint invariant preserved (Principle I); LCU ally pick reads are read-only (Principle II); synergy data cached locally in SQLite (Principle III); all new scoring logic in pure `src/recommendation/` module (Principle IV)

**Scale/Scope**: Pool-scoped synergy fetches — one HTTPS request per (champion, role) pair in the pool, not all ~170 champions. A typical pool of ≤ 30 pairs → at most 30 synergy fetch requests per refresh cycle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pool-Constrained Recommendations (NON-NEGOTIABLE) | **PASS** | Ally synergy is an ordering signal only, applied after the pool + role filter. FR-010 (exclude pool champions locked by an ally) further restricts — never relaxes — the candidate set. |
| II. Riot API & LCU Compliance (NON-NEGOTIABLE) | **PASS** | `allyChampionIds` extracted from the same read-only `/lol-champ-select/v1/session` already consumed. No new LCU endpoints, no writes. `LolalyticsMatchupProvider` sends anonymous GETs — no user data, no Riot credentials. |
| III. Local-First Data Architecture | **PASS** | `champion_synergy` is local SQLite. Fallback to overall WR when synergy is unavailable (research.md §3) preserves offline functionality. Same Principle III amendment note from spec 001 research.md §6 applies; no new exposure beyond what spec 001 resolved. |
| IV. Business Logic Isolation | **PASS** | `scoreWithAllies()` and combined-score path go into `src/recommendation/synergy.ts` and `src/recommendation/engine.ts` — pure TypeScript, zero Electron/Vue/Vuetify imports, callable and testable with plain objects. |
| V. Real-Time Champion Select Responsiveness | **PASS** | `sessionKey()` in `champSelectAdapter.ts` extended to fingerprint `allyChampionIds`; ally lock-ins trigger `onChampSelectUpdate` → IPC push → recommendation refresh ≤ 1 second (ipc-api.md). |
| VI. Test-First for Recommendation Logic | **PASS** | Six new unit fixtures required (quickstart.md §2): no-allies path, no-synergy fallback, single ally, multi-ally average, ally exclusion (FR-010), conflicting signals. All written and reviewed before `engine.ts` is touched. |
| VII. Minimal, Justified Dependencies | **PASS** | No new runtime dependencies. `LolalyticsMatchupProvider` reuses the existing Qwik JSON parse pattern from `LolalyticsStatsProvider`. `SynergyRepository` uses the same `better-sqlite3` instance. |

**Overall**: PASS. No NON-NEGOTIABLE (Principle I/II) violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-team-composition-recs/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/
│   ├── ipc-api.md             # Updated IPC surface (ally IDs + score breakdown)
│   └── synergy-provider.md    # SynergyProvider interface + LolalyticsMatchupProvider contract
└── tasks.md                   # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts               MODIFIED — ChampSelectSession + allyChampionIds;
│                                          RecommendationEntry + scoreBreakdown;
│                                          Recommendation + allyChampionIds;
│                                          ScoreBasis extended to 'combined';
│                                          ScoreBreakdown + ActiveSignal (new types)
│
├── recommendation/
│   ├── engine.ts              MODIFIED — integrate scoreWithAllies(); combined 50/50 path;
│   │                                      ally exclusion filter (FR-010);
│   │                                      RecommendationInput extended
│   └── synergy.ts             NEW      — scoreWithAllies() pure function
│
├── main/
│   ├── recommendationService.ts   MODIFIED — pass allyChampionIds + synergyRows to engine;
│   │                                          inject SynergyRepository
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 002_add_synergy.sql    NEW — champion_synergy table;
│   │   │                                     ALTER champ_select_snapshot ADD ally_champion_ids
│   │   └── repositories/
│   │       ├── synergyRepository.ts   NEW  — upsertSynergy, getSynergyRowsForChampions
│   │       └── snapshotRepository.ts  MODIFIED — persist/restore allyChampionIds
│   ├── lcu/
│   │   ├── normalize.ts         MODIFIED — extract allyChampionIds from myTeam[]
│   │   └── champSelectAdapter.ts MODIFIED — include allyChampionIds in sessionKey()
│   └── stats/
│       ├── synergyProvider.ts   NEW     — SynergyProvider interface + NormalizedSynergyRow
│       ├── lolalyticsMatchupProvider.ts  NEW — fetches per-champion build pages
│       └── index.ts             MODIFIED — add synergy refresh to startStatsRefresh()
│
└── renderer/
    └── src/
        ├── composables/
        │   └── useRecommendation.ts  MODIFIED — expose scoreBreakdown to template
        └── pages/
            └── ChampSelectView.vue   MODIFIED — score breakdown panel (US3 / FR-009)

tests/
├── unit/
│   └── recommendation/
│       ├── engine.test.ts       MODIFIED — 6 new synergy/combined fixtures (Principle VI)
│       └── synergy.test.ts      NEW      — scoreWithAllies() isolated unit tests
└── contract/
    └── synergy-provider.test.ts  NEW     — FixtureSynergyProvider contract tests
```

**Structure Decision**: All changes fit within the existing electron-vite single-app
structure. The new `src/recommendation/synergy.ts` stays alongside `engine.ts` at the
Principle IV boundary. The new `src/main/stats/lolalyticsMatchupProvider.ts` follows
the exact pattern of `lolalyticsStatsProvider.ts`, implementing a separate
`SynergyProvider` interface (analogous to `StatsProvider`). No new top-level packages
or project roots are required.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*
