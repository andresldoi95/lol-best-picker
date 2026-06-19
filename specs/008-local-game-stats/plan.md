# Implementation Plan: Local Game Statistics & Personal Counters

**Branch**: `008-local-game-stats` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-local-game-stats/spec.md`

## Summary

Enable users to build personal, local statistics by recording game outcomes (allies, enemies, result) and surface champions that most frequently counter them. This complements the existing recommendation engine by tracking *personalized* threat data independent of official champion statistics and without requiring the player to pre-select their current pick.

**Approach**: Capture end-of-game state from LCU; persist to SQLite alongside a pure threat-scoring engine (similar to the existing recommendation module); expose via a dedicated "/Personal Counters" UI view with role filtering and confidence tiers.

## Technical Context

**Language/Version**: TypeScript 5.x (latest)

**Primary Dependencies**: better-sqlite3 (already in use), Node.js runtime (via Electron)

**Storage**: SQLite (existing) — add `game_records` and related tables via migration

**Testing**: Vitest (existing test framework)

**Target Platform**: Windows (primary); cross-platform support (macOS, Linux) in scope but not blockers for v1

**Project Type**: Desktop app (Electron + Vue 3)

**Performance Goals**: 
- Threat score calculation: <10ms for a role with 100+ recorded games
- Personal counters view load: <500ms (including LCU tier fetch if needed)
- Game capture: non-blocking; no UI stall when recording end-of-game state

**Constraints**: 
- All data stored locally (SQLite) — zero cloud dependencies
- Offline-capable: personal counters work with cached data; no API calls required
- Read-only LCU access (per Constitution II)
- Non-destructive DB migrations (per Constitution III)

**Scale/Scope**: 
- Per-player: ~500–5000 games over player lifetime (typical)
- Per-role: 4–5 roles × ~100–1000 games/role
- Threat ranking: top 3–20 counter champions per role

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Pool-Constrained Recommendations** | ✅ PASS | Game recording and counter analysis are **independent** of pool; counter identification does not filter by pool membership. Personal counters reflect threats the player faces, not recommendations. |
| **II. Riot API & LCU Compliance** | ✅ PASS | Game outcome capture relies on **read-only** LCU endpoint (`/lol-match-history/v1/products/lol/current-summoner/matches`) or post-game state; no game automation or memory access. |
| **III. Local-First Data Architecture** | ✅ PASS | All game records and derived counters stored in SQLite; feature works fully offline using cached data. No third-party telemetry. |
| **IV. Business Logic Isolation** | ✅ PASS | Threat scoring algorithm (`src/recommendation/counterAnalyzer.ts`) implemented as pure functions, testable in isolation. |
| **V. Real-Time Champion Select** | N/A | This feature does not affect champion-select performance; threat scores computed offline and cached. |
| **VI. Test-First for Recommendation Logic** | ✅ PASS | Threat scoring (similar to pick ranking logic) requires unit tests covering: empty history, tied scores, single game vs. 100 games, role filtering. |
| **VII. Minimal Dependencies** | ✅ PASS | No new dependencies; reuses existing SQLite, Node stdlib, Vitest. |

**Gate Result**: ✅ **PASS** — No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/008-local-game-stats/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── db/
│   │   ├── repositories/
│   │   │   ├── gameRecordsRepository.ts     [NEW] Game record CRUD + queries
│   │   │   └── [existing repositories]
│   │   ├── migrations/
│   │   │   └── 006_add_game_records.sql     [NEW] Create game_records table + indices
│   │   └── index.ts
│   ├── gameRecorder.ts                      [NEW] LCU game outcome capture service
│   ├── gameAnalyticsService.ts              [NEW] Aggregates game records → counters
│   ├── ipc/
│   │   └── handlers.ts                      [MODIFIED] Add counter-fetch handler
│   └── [existing: stats, lcu, recommendation services]
│
├── recommendation/
│   ├── counterAnalyzer.ts                   [NEW] Pure threat-score calculation
│   ├── counterAnalyzer.test.ts              [NEW] Unit tests (empty/tied/role filter)
│   ├── engine.ts                            [existing]
│   └── [existing: synergy, tieBreak, etc.]
│
├── renderer/
│   └── src/
│       ├── views/
│       │   ├── PersonalCounters.vue         [NEW] Counter list view
│       │   └── [existing views]
│       ├── composables/
│       │   ├── usePersonalCounters.ts       [NEW] IPC wrapper + state
│       │   └── [existing: usePool, etc.]
│       ├── router/
│       │   └── index.ts                     [MODIFIED] Add /counters route
│       └── [existing: components, i18n, main.ts]
│
└── [existing: shared, preload, index.ts]

tests/
└── recommendation/
    └── counterAnalyzer.test.ts              [NEW] Threat scoring unit tests
```

**Structure Decision**: Extends existing patterns (repositories, services, composables, pure recommendation logic). No new directories required. Game recording and analytics are layered as:
1. LCU capture → SQLite (`gameRecorder`, `gameRecordsRepository`)
2. Aggregation → derived counters (`gameAnalyticsService`)
3. Pure ranking → threat scores (`src/recommendation/counterAnalyzer` — follows Constitution IV)
4. UI → personal counters view

## Complexity Tracking

> **No Constitution violations to justify**

This feature aligns with all core principles. The only design choice worth noting is the use of SQLite for both game history and derived counters (rather than computing counters on-demand from raw game records each query). This is justified for performance: pre-aggregating counters per role allows the UI to load the top threats in <500ms without rescanning thousands of game records.

---

## Phases

### Phase 0: Research & Unknowns
- None identified. Technical stack, storage, and LCU compliance are clear.
- See `research.md` (generated next).

### Phase 1: Design & Contracts
- Define `GameRecord` entity and SQL schema
- Design `PersonalCounter` derived entity for UI consumption
- Define IPC contract for counter fetching (`game:fetch-counters` with role filter)
- Document quickstart: how to record a game and view counters

### Phase 2: Implementation (via `/speckit-tasks`)
- Database: migrations, repositories
- Main process: game recorder, analytics service, IPC handlers
- Recommendation: pure threat-scoring functions + tests
- Renderer: views, composables, routing

See `tasks.md` (generated by `/speckit-tasks` after planning)
