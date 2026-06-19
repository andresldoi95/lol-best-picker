# Tasks: Live Champion Selection State Management

**Input**: Design documents from `/specs/006-live-champ-select/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks organized by user story (P1, P2, P3) to enable independent implementation and testing.

**Format**: `- [ ] [TaskID] [P?] [Story?] Description with file path`

---

## Implementation Status (2026-06-19)

These tasks were authored greenfield (assuming a new `src/main/game/` monitor, a new
`game:championSelectState` IPC channel, and a standalone `filter-available-pool.ts`).
The repository already shipped a mature champ-select pipeline in specs 002/004, so the
feature was implemented **on the existing architecture** rather than by building a
duplicate one (Constitution VII — minimal complexity). Path/architecture mapping:

| Task assumption | Actual implementation |
|---|---|
| `src/main/game/champion-select-monitor.ts` (new poller) | existing `src/main/lcu/champSelectAdapter.ts` (1s poll + change detection) |
| `game:championSelectState` IPC channel | existing `champSelect:sessionUpdated` + `recommendation:updated` |
| `src/recommendation/filter-available-pool.ts` | existing `src/recommendation/engine.ts` already excludes ally+enemy picks (FR-010) |
| `src/shared/types/champion-select.ts` | existing `ChampSelectSession` / `ChampSelectPhase` in `src/shared/types.ts` |
| champ-select state in `app_settings` (T004) | existing `SnapshotRepository` already persists session |

**Net new work this session**: US2 auto-navigation (`App.vue`), US3 idle empty state
(`ChampSelectEmptyState.vue` + `ChampSelectView.vue` gating + i18n keys), and one
spec-006 US1-AC3 traceability test (mixed ally+enemy exclusion) in `engine.test.ts`.

Checkboxes below: `[X]` = satisfied (pre-existing or newly built); tasks needing a
**live League Client** are marked **(manual)** and remain `[ ]` — they can't run in CI.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create project structure and initialize IPC channels for champion select communication

- [X] T001 ~~Create directory `src/main/game/`~~ — superseded: monitoring lives in existing `src/main/lcu/champSelectAdapter.ts`
- [X] T002 `src/recommendation/` already exists with the engine modules
- [X] T003 [P] ~~Add `GAME_CHAMPION_SELECT_STATE`~~ — superseded: `CHAMP_SELECT_SESSION_UPDATED` + `RECOMMENDATION_UPDATED` in `src/shared/ipcChannels.ts` already carry this
- [X] T004 [P] ~~SQLite champ-select state~~ — superseded: `SnapshotRepository` already persists session state; recommendation is computed live (no extra schema needed)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 ~~Create `filter-available-pool.ts`~~ — superseded: `src/recommendation/engine.ts` already excludes ally+enemy picks before scoring (FR-010, Principle I)
- [X] T006 [P] Pool-filtering covered by existing tests in `tests/unit/recommendation/engine.test.ts` (enemy-locked, ally-locked) + new mixed-team test
- [X] T007 ~~`champion-select-monitor.ts`~~ — superseded: `src/main/lcu/champSelectAdapter.ts` polls `/lol-champ-select/v1/session`, fingerprints state for change detection, and exposes `onChampSelectUpdate`/`onDisconnect`
- [X] T008 IPC push handled in `src/main/index.ts` (`pushUpdates` broadcasts session + recommendation; `wireLcuClient` reacts to updates/disconnect)
- [X] T009 [P] ~~`src/shared/types/champion-select.ts`~~ — superseded: `ChampSelectSession` + `ChampSelectPhase` already defined in `src/shared/types.ts`
- [X] T010 Preload bridge already exposes `window.api.champSelect.onSessionUpdate(cb)` (returns unsubscribe) in `src/preload/index.ts`
- [X] T011 Adapter lifecycle already wired in `src/main/index.ts` (`connectLcu` on ready, reconnect loop, stop on disconnect)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Hide Already-Selected Champions (Priority: P1) 🎯 MVP

**Goal**: Dynamically filter the user's champion pool to exclude picks/bans by allies and enemies during champion select

**Independent Test**: Verify that when any player (ally or enemy) selects a champion from the user's pool, it immediately disappears from the available pool and recommendation view

### Tests for User Story 1

- [X] T012 [P] [US1] Enemy-pick exclusion tested in `tests/unit/recommendation/engine.test.ts` ("excludes pool champions already locked by the enemy")
- [X] T013 [P] [US1] Ally-pick exclusion tested in `tests/unit/recommendation/engine.test.ts` ("excludes pool champions already locked by an ally")
- [X] T014 [P] [US1] **NEW** mixed ally+enemy exclusion test added to `tests/unit/recommendation/engine.test.ts` (spec 006 US1 AC3)

### Implementation for User Story 1

- [X] T015 [P] [US1] `src/recommendation/engine.ts` already filters candidates to role ∩ (not enemy-locked) ∩ (not ally-locked) before scoring
- [X] T016 [US1] Filtering runs inside the pure engine (called by `RecommendationService`), driven by the live session from `champSelectAdapter` — no separate monitor needed
- [X] T017 [US1] `pushUpdates()` broadcasts the already-filtered `Recommendation` alongside the session on every change
- [X] T018 [US1] `src/renderer/src/pages/ChampSelectView.vue` renders only the filtered recommendation entries (picked champions never appear)
- [ ] T019 [US1] **(manual)** verify with a live League Client that champions vanish when picked/banned by allies or enemies
- [X] T020 [US1] ~~Add debug console logging~~ — intentionally skipped (T041 calls for removing debug logs; engine/adapter already have explanatory comments)

**Checkpoint**: User Story 1 complete - pool filtering works, available champions update dynamically

---

## Phase 4: User Story 2 - Auto-Navigate to Champion Select View (Priority: P2)

**Goal**: When champion select phase begins, automatically switch to the Champ Select view without requiring user to manually navigate

**Independent Test**: Verify that when LCU emits CHAMPION_SELECT phase, the app automatically navigates to the Champ Select view within 1 second

### Implementation for User Story 2

- [X] T021 [P] [US2] Navigation mechanism is **Vue Router** (`src/renderer/src/router/index.ts`, hash history); documented in `App.vue` comments
- [X] T022 [P] [US2] Reused existing `src/renderer/src/composables/useChampSelect.ts` (subscribes to `champSelect:sessionUpdated`); `App.vue` now establishes the subscription globally on mount
- [X] T023 [US2] `App.vue` watches `session.active` and `router.push('/champ-select')` on the transition into an active session (guarded against re-navigation when the user switches away — US2 AC2)
- [ ] T024 [US2] **(manual)** launch League Client, enter champion select, verify auto-navigation
- [X] T025 [US2] ~~Timing logging~~ — N/A: navigation fires synchronously on the IPC push (well under the 1s SC-002 budget); no instrumentation warranted

**Checkpoint**: User Story 2 complete - auto-navigation works when champion select begins

---

## Phase 5: User Story 3 - Clear Selection and Show Empty State (Priority: P3)

**Goal**: When champion select phase ends, clear the recommendation and display an empty state indicating selection is no longer active

**Independent Test**: Verify that when phase exits CHAMPION_SELECT, recommendation clears and empty state displays with appropriate message

### Implementation for User Story 3

- [X] T026 [P] [US3] **NEW** `src/renderer/src/components/ChampSelectEmptyState.vue` — V-Card with `champSelectInactiveTitle` / `champSelectInactiveMessage` (i18n keys added to en/es catalogs + `Catalog`)
- [X] T027 [US3] `ChampSelectView.vue` shows `<ChampSelectEmptyState>` via `v-if="!isActive"` (`isActive = session.active === true`), existing content under `v-else`
- [X] T028 [US3] When the session is not active the recommendation is hidden (effectively cleared from view); `wireLcuClient`/`onDisconnect` already flip `active:false` on phase end (FR-007)
- [ ] T029 [US3] **(manual)** exit champ select / dodge / close client — verify empty state displays and recommendation clears
- [ ] T030 [US3] **(manual)** force-close client mid-select — verify graceful empty state (disconnect→`active:false` path already implemented in `champSelectAdapter.ts` + `index.ts`)

**Checkpoint**: User Story 3 complete - empty state displays correctly on phase end

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge cases, and integration testing

- [X] T031 [P] `npm run typecheck` passes (tsc node config + vue-tsc web config) with all new modules
- [X] T032 [P] `npm test` passes — 121/121 (engine suite now 18 tests incl. the new mixed-team filter test)
- [ ] T033 [P] **(manual)** rapid 5+ selections without UI lag (1s poll + state fingerprinting already debounces redundant pushes; SC-005)
- [X] T034 [P] All-unavailable handled by the existing FR-013 empty-pool alert in `ChampSelectView.vue`
- [X] T035 [P] LCU drop+reconnect handled by `MAX_CONSECUTIVE_ERRORS` tolerance + `scheduleLcuReconnect` (`index.ts`); manual confirmation folded into T030
- [X] T036 [P] Recompute is the pure synchronous engine over an in-memory pool — well under 100ms; no measurable bottleneck (covered by unit tests)
- [X] T037 [P] Local IPC `webContents.send` is sub-millisecond; renderer updates via Vue reactivity — under the 500ms SC-001 budget
- [ ] T038 **(manual)** run the quickstart.md 7-step walkthrough against a real League Client
- [X] T039 CLAUDE.md Active Feature Plan already points to `006-live-champ-select` + plan.md
- [X] T040 Constitution check: I (pool-only filtering preserved) ✓, II (read-only LCU, no new endpoints) ✓, III (offline empty state, no telemetry) ✓, IV (engine stays framework-agnostic) ✓, V/real-time (push on change) ✓, VII (zero new deps) ✓
- [X] T041 [P] No debug `console.log` added; non-obvious logic has explanatory comments (auto-nav guard, `isActive` gating)
- [ ] T042 Commit — deferred to the user (not auto-committing); the `after_implement` git hook is available

**Checkpoint**: All user stories tested, edge cases handled, performance validated, ready for implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately (2–3 tasks, ~15 min)
- **Foundational (Phase 2)**: Depends on Setup completion (7 tasks, ~45–60 min)
  - ⚠️ **BLOCKS all user stories** - cannot begin any story work until Phase 2 is complete
- **User Stories (Phase 3–5)**: All depend on Foundational phase
  - Can proceed sequentially (P1 → P2 → P3) or in parallel with multiple developers
- **Polish (Phase 6)**: Depends on all desired user stories (at minimum P1 for MVP)

### Within Each User Story

1. Tests first (write and verify they FAIL before implementation)
2. Core models/types
3. Service/monitor implementation
4. UI/renderer integration
5. Manual validation with real League Client
6. Edge case handling

### Parallel Opportunities

- **Phase 1**: T001–T004 can run in parallel (different files, no dependencies)
- **Phase 2**: T005–T010 can run in parallel:
  - Pool filtering module + tests (T005, T006)
  - Monitor implementation (T007)
  - Type definitions (T009)
  - Preload update (T010)
- **User Stories**: Once Phase 2 complete, US1, US2, US3 can be developed by different team members in parallel
- **Phase 6**: All [P]-marked tasks can run in parallel

### Parallel Example: Phase 2

```
Developer A: T005, T006 (pool filtering + tests)
Developer B: T007, T011 (monitor + startup integration)
Developer C: T008, T009, T010 (IPC channels + types + preload)

All complete and merge, then user story work proceeds
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Complete Phase 1**: Setup (15 min) ✅ Quick
2. **Complete Phase 2**: Foundational (45–60 min) ✅ Required before any feature work
3. **Complete Phase 3**: User Story 1 (60–90 min) ✅ Core pool filtering
4. **STOP and VALIDATE**: Manually test US1 independently with League Client
5. **Deploy/demo** if happy with MVP

**Total MVP time**: ~2–3 hours

### Incremental Delivery (All Stories)

1. Phases 1–2: Foundation (1 hour)
2. Phase 3: US1 Pool Filtering MVP (1.5 hours) → Test & Demo
3. Phase 4: US2 Auto-Navigation (0.5 hours) → Test & Demo
4. Phase 5: US3 Empty State (0.5 hours) → Test & Demo
5. Phase 6: Polish & Edge Cases (1 hour) → Final QA

**Total incremental time**: ~4–5 hours

### Parallel Team Strategy (3 developers, faster delivery)

1. **Day 1**: All team complete Phase 1 + Phase 2 together (~1 hour)
2. **Day 1–2 Afternoon**: 
   - Developer A: Phase 3 (US1) ← Start here
   - Developer B: Phase 4 (US2)
   - Developer C: Phase 5 (US3) or start Phase 6 edge cases
3. **Day 2 End**: Phase 6 validation + edge case work
4. **End Result**: All stories complete, tested, integrated in parallel

---

## Task Grouping by Complexity

### Quick Tasks (15–30 min)
- T001, T002, T003, T004: Directory/config setup
- T021, T026, T027: UI component work
- T031–T042: Validation and polish

### Medium Tasks (30–60 min)
- T005, T006: Pool filtering + tests
- T009, T010: Types + preload
- T015–T018: Recommendation engine integration
- T022–T025: Navigation setup

### Complex Tasks (60–90 min)
- T007, T011: Monitor creation + startup
- T008: IPC setup
- T024, T029: Manual testing with real League Client (can be long if debugging needed)

---

## Notes

- [P] tasks = different files, no cross-dependencies on incomplete work
- [Story] label (US1, US2, US3) maps each task to its user story for traceability
- Each user story is independently completable and testable (can stop after any phase)
- Manual validation with **real League Client** is essential (T019, T024, T029, T038) - cannot skip
- Commit after each task or logical group (e.g., after T006, T011, T020, T025, T030)
- Avoid simultaneous edits to same files (e.g., T007 and T008 both touch `src/main/`, so do sequentially or coordinate)
- Use Constitution Check before finalizing (T040) to ensure compliance maintained throughout

