# Implementation Plan: Champion Pool Recommender

**Branch**: `001-champion-pool-recommender` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-champion-pool-recommender/spec.md`

## Summary

A ranked League of Legends player needs, during champion select, a single best-pick
recommendation drawn **only** from their personal, role-tagged champion pool,
ranked by win rate against the enemies already revealed — with graceful
degradation to a clearly-marked cached/stale recommendation when live data is
unavailable.

Technical approach: an Electron desktop app (Vue 3 + Vuetify renderer, SQLite via
`better-sqlite3` as the single source of truth) with three integration points: the
local **LCU API** (read-only, for live champ-select state — role assignment and
revealed enemy picks), **u.gg-derived statistics** (champion/matchup win rates, per
explicit direction for this plan — research.md §1), and **Riot Data Dragon**
(champion identity/icon metadata, no API key required). All pool-filtering,
win-rate scoring, ranking, and tie-breaking is implemented as an isolated, pure
`src/recommendation/` module (Constitution Principle IV) consumed by the Electron
main process and exposed to the renderer via a typed IPC contract.

## Technical Context

**Language/Version**: TypeScript 5.x; Node.js runtime as bundled by the pinned Electron version (Electron 30+ → Node 20 LTS)

**Primary Dependencies**: Electron, Vue 3 (Composition API), Vuetify 3 (`vite-plugin-vuetify`), `vue-router`, `better-sqlite3`, `electron-vite` (build), `electron-builder` (packaging)

**Storage**: SQLite via `better-sqlite3` — single local database holding `champions`, `pool_entries`, `champion_stats`, `app_settings`, `champ_select_snapshot` (see [data-model.md](./data-model.md))

**Testing**: Vitest for unit tests (`src/recommendation/`, no Electron runtime required, Principle VI) and contract tests (`StatsProvider`, `LcuAdapter`, IPC handlers using fixtures); manual LCU test checklist per constitution Development Workflow for any `src/main/lcu/` change

**Target Platform**: Desktop, Windows 10/11 primary (matches dev environment and the most common LoL client platform); architecture is cross-platform (Electron + LCU lockfile path is the only OS-specific piece)

**Project Type**: Desktop application (Electron, single window, multiple in-app views via `vue-router`)

**Performance Goals**: Recommendation computation over cached SQLite data < 100ms (Principle V); champ-select UI refresh within 1s of a detected LCU pick/ban change (Principle V, SC-003); first ranked recommendation within 2s of champion select beginning (SC-001)

**Constraints**: Fully functional offline using cached pool + cached stats with a visible "last updated"/freshness indicator (Principle III); all Riot/LCU interactions read-only (Principle II); recommendations strictly limited to pool champions tagged for the active role (Principle I, FR-008); renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and (additional hardening) `sandbox: true`, with a strict CSP (`default-src 'self'`) since the renderer loads only locally-built assets

**Scale/Scope**: Single local player profile; champion pool of up to a few dozen `(champion, role)` entries; statistics cache covers ~170 champions × 5 roles (+ per-opponent matchup rows for pool champions); 3 primary UI views (Pool Management, Champion Select/Recommendation, Settings)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pool-Constrained Recommendations (NON-NEGOTIABLE) | **PASS** | `computeRecommendation` (contracts/recommendation-engine.md) filters `pool_entries` by assigned role *before* any scoring; u.gg-derived win rates only reorder that filtered set; FR-012 guarantees a pool entry is always shown even when all matchups are unfavorable. |
| II. Riot API & LCU Compliance (NON-NEGOTIABLE) | **PASS** | All LCU access is read-only `GET` + WebSocket-subscribe (contracts/lcu-adapter.md); no automation of picks/bans; no game-file/memory access. The Riot Developer API is not used by this feature (research.md §3), so its key-storage/rate-limit clauses are inert but unviolated. |
| III. Local-First Data Architecture | **PASS (amendment recommended)** | SQLite is the sole source of truth; app remains functional offline via cached `champion_stats` + bundled seed data and `champ_select_snapshot`. The constitution's "External data: Riot Games Developer API for champion/matchup statistics" line and the literal scope of "no user data transmitted to any service other than Riot's official APIs" need updating to reflect u.gg (research.md §6) — `UggStatsProvider` sends only anonymous GETs for public aggregate data, no user/pool data leaves the device to non-Riot services. Recommend a follow-up `/speckit-constitution` amendment; not a blocking violation of the protective intent. |
| IV. Business Logic Isolation | **PASS** | `src/recommendation/` (pool filter, scoring, ranking, tie-break, freshness derivation) is plain TypeScript with zero `electron`/`vue`/`vuetify` imports; unit-testable with plain objects (contracts/recommendation-engine.md). |
| V. Real-Time Champion Select Responsiveness | **PASS** | LCU WebSocket subscription + IPC push run entirely in `src/main`; renderer never blocks on network/LCU I/O; recommendation recompute over ≤ a few dozen pool rows via indexed SQLite lookups is well under 100ms. |
| VI. Test-First for Recommendation Logic | **PASS** | contracts/recommendation-engine.md enumerates required fixtures: empty pool, missing matchup data (FR-017 fallback), tied scores (FR-016), all-unfavorable matchups (FR-012), flagged/inactive champion (FR-018), and all three freshness states. |
| VII. Minimal, Justified Dependencies | **PASS** | No Pinia (Vue composables suffice at this scope), no HTTP client lib (native `fetch`), single SQLite driver (`better-sqlite3`), Vuetify only for UI components, `vue-router` as the only additional Vue-ecosystem package (research.md §4). |

**Overall**: PASS. No NON-NEGOTIABLE (I/II) violations; Complexity Tracking is not
required. One non-blocking documentation gap is flagged for Principle III (see
research.md §6) with a recommended follow-up constitution amendment.

## Project Structure

### Documentation (this feature)

```text
specs/001-champion-pool-recommender/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
│   ├── ipc-api.md
│   ├── stats-provider.md
│   ├── lcu-adapter.md
│   └── recommendation-engine.md
└── tasks.md               # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/                       # Types & IPC channel-name constants ONLY — no executable
│   ├── types.ts                  # Role, Recommendation, RecommendationEntry, ChampSelectSession, etc.
│   └── ipcChannels.ts            # channel name constants, imported by preload + main + renderer
│
├── recommendation/                # Principle IV: zero electron/vue/vuetify imports
│   ├── engine.ts                  # computeRecommendation() — filter, score, rank
│   ├── tieBreak.ts                # FR-016 deterministic tie-break
│   ├── freshness.ts               # research.md §5 live/cached/stale derivation
│   └── types.ts                   # role-name normalization tables (LCU "utility", u.gg slugs)
│
├── main/                           # Electron main process
│   ├── index.ts                    # app lifecycle, BrowserWindow (contextIsolation, sandbox, CSP)
│   ├── db/
│   │   ├── index.ts                 # better-sqlite3 connection + migration runner
│   │   ├── migrations/
│   │   │   └── 001_initial.sql      # champions, pool_entries, champion_stats, app_settings, champ_select_snapshot
│   │   └── repositories/
│   │       ├── poolRepository.ts
│   │       ├── statsRepository.ts
│   │       ├── championsRepository.ts
│   │       └── settingsRepository.ts
│   ├── lcu/
│   │   ├── connection.ts            # lockfile discovery, riotgames.pem, basic auth
│   │   └── champSelectAdapter.ts    # contracts/lcu-adapter.md implementation + normalization
│   ├── stats/
│   │   ├── statsProvider.ts         # StatsProvider interface (contracts/stats-provider.md)
│   │   ├── uggStatsProvider.ts      # u.gg-backed implementation
│   │   └── seedData/                 # bundled baseline stats snapshot (offline-first, SC-006)
│   ├── dataDragon/
│   │   └── championRepository.ts     # champion metadata refresh (research.md §3)
│   └── ipc/
│       └── handlers.ts               # ipcMain.handle registrations (contracts/ipc-api.md)
│
├── preload/
│   └── index.ts                      # contextBridge, whitelisted channels from shared/ipcChannels
│
└── renderer/
    └── src/
        ├── App.vue
        ├── router/index.ts            # 3 views below
        ├── pages/
        │   ├── PoolManagementView.vue   # US1
        │   ├── ChampSelectView.vue      # US2 + US3 (recommendation panel, freshness indicator)
        │   └── SettingsView.vue         # manual role override, freshness threshold
        ├── components/
        └── composables/                 # reactive state singletons (no Pinia, research.md §4)

tests/
├── unit/
│   └── recommendation/                  # Vitest, no Electron runtime — Principle VI fixtures
├── contract/
│   ├── ipc-handlers.test.ts
│   ├── stats-provider.test.ts            # FixtureStatsProvider
│   └── lcu-adapter.test.ts               # FixtureLcuAdapter + recorded LCU JSON
└── integration/
    └── db/                                # repository tests against a temp SQLite file
```

**Structure Decision**: Single Electron desktop application project (not a
frontend/backend split — Electron's main/preload/renderer model already provides
that separation within one codebase). The one addition beyond the standard
`electron-vite` scaffold (`src/main`, `src/preload`, `src/renderer/src`) is the
top-level `src/recommendation/` package, which exists specifically to satisfy
Constitution Principle IV's requirement that recommendation logic be importable
and testable with zero Electron/Vue/Vuetify dependencies — placing it under
`src/main/` would make that boundary easy to violate by accident. `src/shared/`
holds only types and IPC channel-name constants (no logic), per standard secure-IPC
practice, and is imported by `preload`, `main`, `recommendation`, and the renderer
for type-checking.

## Complexity Tracking

*No entries — Constitution Check reported no NON-NEGOTIABLE (Principle I/II)
violations requiring justification. The single non-blocking note (Principle III
wording vs. u.gg as a data source) is tracked in research.md §6 with a recommended
constitution amendment, not a complexity/violation entry.*
