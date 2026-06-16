---

description: "Task list for Champion Pool Recommender"
---

# Tasks: Champion Pool Recommender

**Input**: Design documents from `/specs/001-champion-pool-recommender/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. The constitution (Principle VI, NON-NEGOTIABLE-adjacent "MUST") and `contracts/recommendation-engine.md` explicitly require fixture-based unit tests for the recommendation engine *before* implementation; `contracts/stats-provider.md` and `contracts/lcu-adapter.md` explicitly define contract-test doubles; `plan.md`'s Project Structure explicitly enumerates `tests/unit/recommendation/`, `tests/contract/`, and `tests/integration/db/`.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P2/P3) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec.md user stories — US1 (Pool Management), US2 (Recommendation), US3 (Cached/Stale)
- File paths follow `plan.md`'s Project Structure exactly

## Path Conventions

Single Electron desktop app (per `plan.md` Structure Decision):
- `src/shared/`, `src/recommendation/`, `src/main/`, `src/preload/`, `src/renderer/src/`
- `tests/unit/`, `tests/contract/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the Electron + Vite + Vue 3 + TypeScript project per `plan.md` Project Structure and `quickstart.md`.

- [X] T001 Scaffold the project with `electron-vite` (TS + Vue 3 template), producing `src/main/`, `src/preload/`, `src/renderer/src/`; additionally create empty top-level `src/shared/` and `src/recommendation/` directories per [plan.md](./plan.md) Project Structure
- [X] T002 Install remaining dependencies (`vue-router`, `vuetify`, `vite-plugin-vuetify`, `better-sqlite3`, `vitest`) and add `dev`, `build`, `test`, `test:watch` npm scripts to `package.json` per [quickstart.md](./quickstart.md)
- [X] T003 [P] Configure TypeScript project references/`tsconfig*.json` covering `src/main`, `src/preload`, `src/renderer/src`, `src/shared`, and `src/recommendation` with strict mode enabled
- [X] T004 [P] Configure `vitest.config.ts` with test roots `tests/unit/`, `tests/contract/`, `tests/integration/` and path aliases matching `tsconfig`

**Checkpoint**: `npm run dev` launches an empty Electron+Vite window; `npm run test` runs (zero tests, exits clean).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, database schema, seed data, Electron shell, and IPC/router scaffolding shared by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Define canonical `Role` type and shared interfaces (`ChampionSummary`, `PoolEntryView`, `AppSettings`, `ChampSelectSession`, `Recommendation`, `RecommendationEntry`) in `src/shared/types.ts` per [data-model.md](./data-model.md) and [contracts/ipc-api.md](./contracts/ipc-api.md)
- [X] T006 [P] Define IPC channel name constants (`pool:list`, `pool:add`, `pool:remove`, `pool:removeAllRoles`, `champions:list`, `recommendation:get`, `recommendation:updated`, `champSelect:getStatus`, `champSelect:sessionUpdated`, `settings:get`, `settings:setManualRole`, `settings:setStatsFreshnessHours`) in `src/shared/ipcChannels.ts` per [contracts/ipc-api.md](./contracts/ipc-api.md)
- [X] T007 [P] Implement SQLite connection + migration runner in `src/main/db/index.ts` (opens DB in app userData dir via `better-sqlite3`, applies pending numbered migrations from `src/main/db/migrations/` on startup)
- [X] T008 [P] Write `src/main/db/migrations/001_initial.sql` creating `champions`, `pool_entries`, `champion_stats`, `app_settings`, `champ_select_snapshot` tables with all constraints, CHECKs, and indexes (`pool_entries(role)`, `champion_stats(champion_id, role, patch)` + partial unique index on overall rows, `champion_stats(opponent_champion_id)`) per [data-model.md](./data-model.md)
- [X] T009 [P] Implement `src/main/dataDragon/championRepository.ts` with a `seedChampions(db)` function that loads a bundled Data Dragon `champion.json` snapshot (`src/main/dataDragon/seedData/champions.json`, fetched from `https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json`) and upserts `champions` rows (`champion_id`, `key`, `name`, `icon_path`, `data_version`, `is_active = 1`) when the table is empty or `data_version` differs
- [X] T010 [P] Implement `src/main/stats/seedData/` baseline `champion_stats` snapshot (`championStats.json`) and a `seedChampionStats(db)` function that populates `champion_stats` (overall rows, `opponent_champion_id IS NULL`) on first run when the table is empty, satisfying SC-006
- [X] T011 Bootstrap `src/main/index.ts`: Electron app lifecycle, `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP `default-src 'self'`; on `ready`, run the migration runner (T007/T008) then `seedChampions` (T009) and `seedChampionStats` (T010)
- [X] T012 Implement `src/preload/index.ts` contextBridge skeleton: `contextBridge.exposeInMainWorld('api', {...})` with empty `pool`, `champions`, `recommendation`, `champSelect`, `settings` namespaces (methods throw "not implemented" placeholders), whitelisting only channels from `src/shared/ipcChannels.ts`
- [X] T013 Set up `src/renderer/src/router/index.ts` (3 routes: `/` → Pool Management, `/champ-select` → Champ Select, `/settings` → Settings) and `src/renderer/src/App.vue` shell with navigation; create placeholder `src/renderer/src/pages/PoolManagementView.vue`, `ChampSelectView.vue`, `SettingsView.vue` (each rendering a heading only)
- [X] T014 [P] Register the Vuetify plugin (`vite-plugin-vuetify`, `createVuetify()`) in `src/renderer/src/main.ts`

**Checkpoint**: App launches to a navigable 3-page shell; SQLite DB is created/migrated/seeded with champions + baseline stats on first run.

---

## Phase 3: User Story 1 - Manage My Champion Pool by Role (Priority: P1) 🎯 MVP

**Goal**: Build and persist a personal, role-tagged champion pool (FR-001–FR-005).

**Independent Test**: Open the pool management screen, add several champions with one or more role tags each, remove a champion/role combination, and confirm — including after closing and reopening the app — that the pool contains exactly the expected champion/role entries.

### Tests for User Story 1

- [X] T015 [P] [US1] Integration test in `tests/integration/db/poolRepository.test.ts` against a temp SQLite file: add entry, duplicate add is no-op (FR-005), add second role for same champion, remove single role (other roles survive), removeAllRoles, list reflects all changes, and a fresh connection to the same file still shows persisted rows (FR-004)
- [X] T016 [P] [US1] Contract test in `tests/contract/ipc-handlers.test.ts` covering `pool:list`, `pool:add`, `pool:remove`, `pool:removeAllRoles`, `champions:list` against fixture data — asserts idempotent `add`/`remove` per [contracts/ipc-api.md](./contracts/ipc-api.md) Error Handling

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement `src/main/db/repositories/poolRepository.ts`: `list(): PoolEntryView[]` (join `pool_entries` ⋈ `champions`, include `isFlagged = !is_active`), `add(championId, role)` (idempotent insert, FR-005), `remove(championId, role)`, `removeAllRoles(championId)` — all no-ops on missing rows
- [X] T018 [P] [US1] Implement `src/main/db/repositories/championsRepository.ts`: `list(): ChampionSummary[]` reading all rows from `champions`
- [X] T019 [US1] Register `pool:list`, `pool:add`, `pool:remove`, `pool:removeAllRoles`, `champions:list` handlers via `ipcMain.handle` in `src/main/ipc/handlers.ts`, using channel constants from `src/shared/ipcChannels.ts` and repositories from T017/T018 (depends on T017, T018, T016)
- [X] T020 [US1] Implement the `pool.*` and `champions.*` methods in `src/preload/index.ts`, replacing the T012 placeholders with `ipcRenderer.invoke` calls (depends on T019)
- [X] T021 [P] [US1] Implement `src/renderer/src/composables/usePool.ts`: reactive `pool` state populated via `window.api.pool.list()` and `window.api.champions.list()`, with `addToPool`/`removeFromPool`/`removeAllRoles` methods that call the API and refresh state
- [X] T022 [US1] Implement `src/renderer/src/pages/PoolManagementView.vue`: champion picker (from `usePool`'s champion list), 5 role-toggle chips (Top/Jungle/Middle/Bottom/Support), grouped-by-role pool list with remove actions (depends on T021)
- [X] T023 [US1] Replace the placeholder in `src/renderer/src/pages/PoolManagementView.vue` route entry of `src/renderer/src/router/index.ts` with the real view as the default (`/`) route (depends on T013, T022)

**Checkpoint**: Pool management is fully functional and persisted across restarts — independently testable per US1's Independent Test.

---

## Phase 4: User Story 2 - See Best Pick Recommendation During Champion Select (Priority: P2)

**Goal**: During champion select, detect the assigned role and rank role-eligible pool champions by win rate against revealed enemies (FR-006–FR-012, FR-016, FR-017).

**Independent Test**: Configure a pool with champions tagged for a given role, enter champion select assigned to that role, reveal one or more enemy champions, and confirm the displayed top recommendation is always a pool champion tagged for the assigned role, ordered by win rate (for that role) against the revealed enemies.

### Tests for User Story 2

- [X] T024 [P] [US2] Unit test `tests/unit/recommendation/engine.test.ts` covering all 6 Required Fixtures from [contracts/recommendation-engine.md](./contracts/recommendation-engine.md): (1) empty role-filtered pool → `entries: []`; (2) pool champion with zero `statRows` → still appears, lowest score, no throw; (3) tied scores → deterministic order (higher `gamesPlayed`, then ascending `championId`); (4) every candidate's matchup `winRate < 50` → highest of those still shown first; (5) freshness derivation matrix (`success`/within-threshold→`live`, `error`/within-threshold→`cached`, older-than-threshold→`stale` regardless of status); (6) `isActive: false` entry → `isFlagged: true`, included not excluded
- [X] T025 [P] [US2] Contract test `tests/contract/stats-provider.test.ts`: `FixtureStatsProvider implements StatsProvider` returning (a) normal mixed overall+matchup rows, (b) empty array, (c) a pool champion with no matchup-specific row for a revealed enemy — asserting the repository/engine falls back to the overall row (FR-017)
- [X] T026 [P] [US2] Contract test `tests/contract/lcu-adapter.test.ts`: `FixtureLcuAdapter` driven by recorded LCU JSON fixtures covering no client (`connect()` → `null`), champ select with 0 enemies revealed, champ select with 1–5 enemies revealed, `assignedPosition === "utility"` → `SUPPORT` mapping, and a disconnect-mid-session sequence (`onDisconnect` fires, last session retained)

### Implementation for User Story 2 — Recommendation Engine (Principle IV: zero electron/vue/vuetify imports)

- [X] T027 [P] [US2] Implement `src/recommendation/types.ts`: role-normalization tables mapping LCU `assignedPosition` values (`top|jungle|middle|bottom|utility`, `utility`→`SUPPORT`, unrecognized→`null`) and u.gg role slugs (`top|jungle|mid|adc|support`→`MIDDLE`/`BOTTOM`/`SUPPORT` etc.) to the canonical `Role` enum from `src/shared/types.ts`
- [X] T028 [P] [US2] Implement `src/recommendation/tieBreak.ts`: comparator implementing FR-016 — on equal `score`, order by higher `gamesPlayed` (on the deciding stat row), then ascending `championId`
- [X] T029 [P] [US2] Implement `src/recommendation/freshness.ts`: pure function `deriveFreshness({ lastFetchAt, lastFetchStatus, thresholdHours, now }) → 'live' | 'cached' | 'stale'` per [research.md](./research.md) §5 (stale takes precedence over cached)
- [X] T030 [US2] Implement `src/recommendation/engine.ts`: `computeRecommendation(input: RecommendationInput): Recommendation` — (1) if `role === null` return `entries: []`; (2) filter `poolEntries` to `role` (Principle I, FR-008) — if empty return `entries: []` (FR-013); (3) for each candidate, score via matchup `statRows` for revealed `enemyChampionIds` when present (aggregate/average across enemies), falling back to the overall row when no matchup row exists (FR-017), or the overall row directly when `enemyChampionIds` is empty (FR-011); (4) rank descending by score using `tieBreak.ts` (T028); (5) set `isFlagged = !isActive`; (6) set `freshness` via `freshness.ts` (T029) — depends on T024, T027, T028, T029; must pass all T024 fixtures

### Implementation for User Story 2 — Stats Provider & Repository

- [X] T031 [P] [US2] Define the `StatsProvider` interface and `NormalizedChampionStat` type in `src/main/stats/statsProvider.ts` per [contracts/stats-provider.md](./contracts/stats-provider.md)
- [X] T032 [P] [US2] Implement `src/main/db/repositories/statsRepository.ts`: `upsertStats(rows: NormalizedChampionStat[])` resolves `championKey`/`opponentChampionKey` → `champion_id` via the `champions` table (skip-and-log unresolvable keys), upserts `champion_stats` keyed by `(champion_id, role, opponent_champion_id, patch)`, and on success sets `app_settings.last_stats_fetch_at = now()` / `last_stats_fetch_status = 'success'`; a `markFetchError()` method sets `last_stats_fetch_status = 'error'` leaving `champion_stats` untouched (depends on T031)
- [X] T033 [P] [US2] Implement `src/main/stats/uggStatsProvider.ts`: `UggStatsProvider implements StatsProvider` — anonymous `GET` with descriptive `User-Agent`, validates/normalizes the response into `NormalizedChampionStat[]` (u.gg role-slug mapping per [contracts/stats-provider.md](./contracts/stats-provider.md)), throws on network error/non-200/malformed shape/empty result rather than returning partial bad data (depends on T031)

### Implementation for User Story 2 — LCU Adapter

- [X] T034 [P] [US2] Implement `src/main/lcu/connection.ts`: lockfile discovery (`%LOCALAPPDATA%\Riot Games\League of Legends\lockfile`, colon-delimited `processName:pid:port:password:protocol`), HTTPS client trusting Riot's `riotgames.pem`, HTTP Basic auth (`riot`/password), returns `null` if lockfile absent
- [X] T035 [P] [US2] Implement `src/main/lcu/champSelectAdapter.ts`: `LcuAdapter`/`LcuClient` per [contracts/lcu-adapter.md](./contracts/lcu-adapter.md) — `getChampSelectSession()` (GET `/lol-champ-select/v1/session`, `null` on 404, normalized per the field table using T027's mappings), `isRankedChampSelect()` (gameflow-phase + lobby queue check), `onChampSelectUpdate` (WebSocket subscribe to `OnJsonApiEvent_lol-champ-select_v1_session`, 1s polling fallback if WS fails), `onDisconnect` (depends on T034, T026, T027)

### Implementation for User Story 2 — Settings, IPC, UI

- [X] T036 [P] [US2] Implement `src/main/db/repositories/settingsRepository.ts`: `get(): AppSettings` (reads the single `app_settings` row) and `setManualRole(role: Role | null)`
- [X] T037 [US2] Extend `tests/contract/ipc-handlers.test.ts` (from T016) with cases for `recommendation:get`, `champSelect:getStatus`, `settings:get`, `settings:setManualRole` against fixture repositories/adapters (depends on T016)
- [X] T038 [US2] Register `recommendation:get`, `champSelect:getStatus`, `settings:get`, `settings:setManualRole` handlers in `src/main/ipc/handlers.ts`, plus `recommendation:updated`/`champSelect:sessionUpdated` push events fired when `champSelectAdapter`'s `onChampSelectUpdate` fires (resolve role via precedence: `manual_role` → live `assignedRole` → `null`, then call `computeRecommendation`) (depends on T030, T032, T033, T035, T036, T037)
- [X] T039 [US2] Implement the `recommendation.*`, `champSelect.*`, `settings.get`/`setManualRole` methods (including `onUpdate`/`onSessionUpdate` event subscriptions returning unsubscribe functions) in `src/preload/index.ts` (depends on T038)
- [X] T040 [P] [US2] Implement `src/renderer/src/composables/useRecommendation.ts` and `src/renderer/src/composables/useChampSelect.ts`: reactive state populated via `window.api.recommendation.get()`/`champSelect.getStatus()` and kept in sync via `onUpdate`/`onSessionUpdate` (depends on T039)
- [X] T041 [US2] Implement `src/renderer/src/pages/ChampSelectView.vue`: ranked recommendation list (champion icon, name, score, `scoreBasis`, `isFlagged` badge), manual role selector (FR-007), empty-state message when `entries: []` (FR-013) (depends on T040)

**Checkpoint**: Live recommendation flow works end-to-end — role-constrained, re-ranks on enemy reveal, never recommends outside the pool/role.

---

## Phase 5: User Story 3 - See a Cached Recommendation When Data Is Stale or the Client Is Disconnected (Priority: P3)

**Goal**: Gracefully degrade to the last-known recommendation with a clear cached/stale indicator when the stats source or LCU is unreachable (FR-014, FR-015, FR-018, US3).

**Independent Test**: Populate the cache once (a successful fetch), then simulate loss of connection to the statistics source and/or the game client, and confirm the last-known recommendation is still shown with a visible "cached"/"last updated" indicator.

### Tests for User Story 3

- [X] T042 [P] [US3] Integration test `tests/integration/db/snapshotRepository.test.ts` against a temp SQLite file: `get()` returns defaults on empty table, `update(...)` persists `assigned_role`/`enemy_champion_ids`/`session_active`/`updated_at`, and a fresh connection reflects the persisted snapshot (covers the "app opened before champ select" / "LCU disconnected" edge cases)

### Implementation for User Story 3

- [X] T043 [P] [US3] Implement `src/main/db/repositories/snapshotRepository.ts`: `get(): ChampSelectSnapshot` and `update(partial)` for the single-row `champ_select_snapshot` table; implement the role-resolution precedence helper (`manual_role` → live LCU `assignedRole` → `champ_select_snapshot.assigned_role` → `null`) per [data-model.md](./data-model.md) (depends on T042)
- [X] T044 [US3] In `src/main/index.ts` and `src/main/lcu/champSelectAdapter.ts`, wire snapshot persistence: on every `onChampSelectUpdate`/`onDisconnect` event, call `snapshotRepository.update(...)`; on app startup, hydrate the initial `ChampSelectSession`/role from `snapshotRepository.get()` when no live LCU session is available (depends on T035, T043, T011)
- [X] T045 [P] [US3] Implement `src/main/stats/index.ts`: refresh scheduler that calls `UggStatsProvider.fetchChampionStats()` → `statsRepository.upsertStats()` once on app start if the cached patch/`last_stats_fetch_at` is older than `stats_freshness_hours`, then on a 24h interval; on thrown error, calls `statsRepository.markFetchError()` without touching existing `champion_stats` rows (depends on T032, T033)
- [X] T046 [US3] Extend `tests/contract/ipc-handlers.test.ts` (from T037) with a case for `settings:setStatsFreshnessHours` (depends on T037)
- [X] T047 [US3] Register the `settings:setStatsFreshnessHours` handler in `src/main/ipc/handlers.ts` (updates `app_settings.stats_freshness_hours`) and add the corresponding method to `src/preload/index.ts` (depends on T036, T046)
- [X] T048 [P] [US3] Implement `src/renderer/src/components/FreshnessIndicator.vue`: visually distinct badges for `live`/`cached`/`stale` (FR-015) plus a human-readable "last updated" timestamp (FR-014)
- [X] T049 [US3] Integrate `FreshnessIndicator` into `src/renderer/src/pages/ChampSelectView.vue`, bound to `Recommendation.freshness`/`lastUpdatedAt` from `useRecommendation` (depends on T041, T048)
- [X] T050 [P] [US3] Implement `src/renderer/src/pages/SettingsView.vue`: manual role override control (calls `settings.setManualRole`) and a stats-freshness-threshold number input (calls `settings.setStatsFreshnessHours`), both reflecting `settings.get()` on load (depends on T047)

**Checkpoint**: App shows cached/stale recommendations gracefully when offline or disconnected, with configurable freshness threshold and manual role override.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Packaging, full-suite verification, and manual sign-off.

- [X] T051 [P] Configure `electron-builder` (Windows target) in `package.json`/`electron-builder.yml` per [plan.md](./plan.md) Target Platform
- [X] T052 Run `npm run test` (full Vitest suite: unit + contract + integration) and fix any failures across all phases
- [ ] T053 Execute the [quickstart.md](./quickstart.md) manual verification steps for US1, US2, US3, and the LCU Integration Manual Checklist (connect, champion-select start, pick/ban update, disconnect/reconnect); record results per the constitution's Development Workflow gate

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only (independently testable per its own Independent Test, though `src/main/ipc/handlers.ts` and `src/preload/index.ts` are files first created in US1 — T038/T039 extend rather than recreate them)
- **User Story 3 (Phase 5)**: Depends on Foundational; T044/T046/T047/T049 extend files/adapters created in US2 (T035, T037, T041)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — pure pool CRUD + UI
- **US2 (P2)**: No data dependency on US1, but `src/main/ipc/handlers.ts` (T019) and `src/preload/index.ts` (T020) created in US1 are extended by T038/T039
- **US3 (P3)**: Extends US2's `champSelectAdapter` (T035), `ipc-handlers.test.ts` (T037), `handlers.ts`/`preload` (via T047), and `ChampSelectView.vue` (T041)

### Within Each User Story

- Tests before implementation (write fixtures/contract tests first, confirm they fail)
- Pure `src/recommendation/` modules before `src/main` integration (US2)
- Repositories before IPC handler registration before preload exposure before renderer composables/views

### Parallel Opportunities

- All Setup `[P]` tasks (T003, T004) run in parallel after T001/T002
- All Foundational `[P]` tasks (T005, T006, T007, T008, T009, T010, T014) run in parallel — T011/T012/T013 follow
- Once Foundational completes, **US1, US2, and US3 implementation work can be staffed in parallel** by different developers, though US3 and parts of US2 share files with US1's first-created `handlers.ts`/`preload/index.ts` (sequential edits to those two files across T019→T038→T047)
- Within US2, all of T024–T029, T031, T034 run in parallel; T032/T033/T035/T036 run in parallel once T031/T034 land

---

## Parallel Example: User Story 1

```bash
# Tests + repositories together (all different files):
Task: "Integration test poolRepository in tests/integration/db/poolRepository.test.ts"      # T015
Task: "Contract test pool/champions IPC handlers in tests/contract/ipc-handlers.test.ts"     # T016
Task: "Implement poolRepository in src/main/db/repositories/poolRepository.ts"               # T017
Task: "Implement championsRepository in src/main/db/repositories/championsRepository.ts"     # T018
```

## Parallel Example: User Story 2

```bash
# Tests (all different files):
Task: "Unit test computeRecommendation fixtures in tests/unit/recommendation/engine.test.ts" # T024
Task: "Contract test FixtureStatsProvider in tests/contract/stats-provider.test.ts"          # T025
Task: "Contract test FixtureLcuAdapter in tests/contract/lcu-adapter.test.ts"                 # T026

# Pure recommendation modules (all different files):
Task: "Role-normalization tables in src/recommendation/types.ts"     # T027
Task: "Tie-break comparator in src/recommendation/tieBreak.ts"       # T028
Task: "Freshness derivation in src/recommendation/freshness.ts"      # T029

# Provider/adapter scaffolding (all different files):
Task: "StatsProvider interface in src/main/stats/statsProvider.ts"   # T031
Task: "LCU connection in src/main/lcu/connection.ts"                 # T034
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the US1 Independent Test (add/remove/restart)
5. Demo: a persistent, role-tagged champion pool

### Incremental Delivery

1. Setup + Foundational → app shell + seeded DB
2. Add US1 → validate pool persistence (MVP)
3. Add US2 → validate live, role-constrained, re-ranking recommendations (requires a running League Client or recorded LCU fixtures per [quickstart.md](./quickstart.md))
4. Add US3 → validate cached/stale degradation and settings
5. Phase 6 → package, full test run, manual sign-off

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (pool CRUD + Pool Management UI)
   - Developer B: User Story 2 — recommendation engine (`src/recommendation/`, T024–T030) and stats/LCU adapters (T031–T036), which have no dependency on US1's files
   - Developer C: joins for US3 once T035/T037/T041 (US2) land
3. T019/T020 (US1) and T038/T039 (US2) both touch `handlers.ts`/`preload/index.ts` — coordinate ordering (US1 lands first, recommended, but either order is mechanically fine since they add distinct handler registrations)

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks
- `[Story]` label maps task to specific user story for traceability
- Required fixture coverage for `src/recommendation/engine.ts` (T030) is enumerated exhaustively in T024 per [contracts/recommendation-engine.md](./contracts/recommendation-engine.md) — do not consider US2 complete until all 6 pass
- Verify tests fail before implementing the corresponding source file
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- LCU-touching tasks (T034, T035, T044) require the manual test checklist (T053) per the constitution's Development Workflow gate
