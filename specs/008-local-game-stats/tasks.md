# Tasks: Local Game Statistics & Personal Counters

**Input**: Design documents from `/specs/008-local-game-stats/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks are included (required for recommendation logic per Constitution VI).

**Organization**: Tasks grouped by user story (P1, P2) to enable independent implementation and testing.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and database schema foundation

- [X] T001 Create database migration `006_add_game_records.sql` in `src/main/db/migrations/`
- [X] T002 [P] Create repository class `GameRecordsRepository` in `src/main/db/repositories/gameRecordsRepository.ts` with CRUD + query methods
- [X] T003 [P] Create types file `GameRecord` interface in `src/shared/types.ts` (if not already present) or extend existing types
- [X] T004 Add IPC channel constant `game:fetch-counters` to `src/shared/ipcChannels.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST complete before user story implementation

**⚠️ CRITICAL**: These tasks block all user story work. Complete this phase fully before proceeding to Phase 3.

- [X] T005 [P] Create pure engine `counterAnalyzer.ts` with utility functions in `src/recommendation/counterAnalyzer.ts` (empty scaffolds, no logic yet)
  - Functions: `calculateThreatScore()`, `assignConfidenceTier()`, `rankCounters()`, `filterByRole()`
- [X] T006 [P] Create test file `counterAnalyzer.test.ts` in `src/recommendation/counterAnalyzer.test.ts` (empty scaffolds for test cases)
- [X] T007 Implement IPC handler registration in `src/main/ipc/handlers.ts` for `game:fetch-counters` (handler skeleton only, no implementation)
- [X] T008 Create preload API export in `src/preload/index.ts` for `window.api.game.fetchCounters()`
- [X] T009 [P] Create Vue types file for PersonalCounter response in `src/renderer/src/types/game.ts`
- [X] T010 Create router entry `/counters` in `src/renderer/src/router/index.ts` (routes to placeholder component)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Record Game Outcomes (Priority: P1) 🎯 MVP

**Goal**: Capture end-of-game outcomes from LCU and persist to SQLite, enabling historical game tracking.

**Independent Test**: Play a game against LCU, verify game record appears in SQLite `game_records` table with correct structure (allies, enemies, result, role, tier).

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T011 [P] [US1] Unit test: `GameRecordsRepository.insert()` with valid GameRecord in `src/main/db/repositories/__tests__/gameRecordsRepository.test.ts`
- [X] T012 [P] [US1] Unit test: `GameRecordsRepository.getByTier()` returns filtered games in `src/main/db/repositories/__tests__/gameRecordsRepository.test.ts`
- [X] T013 [P] [US1] Unit test: Database migration creates `game_records` table with correct schema in `src/main/db/migrations/__tests__/006_add_game_records.test.ts`
- [X] T014 [US1] Integration test: Game capture flow end-to-end in `src/main/__tests__/gameRecorder.integration.test.ts`

### Implementation for User Story 1

- [X] T015 [P] [US1] Run and verify database migration `006_add_game_records.sql` (creates table + indices)
- [X] T016 [P] [US1] Implement `GameRecordsRepository` CRUD methods: `insert()`, `getByTier()`, `getByRole()`, `getAll()` in `src/main/db/repositories/gameRecordsRepository.ts`
- [X] T017 [US1] Implement `gameRecorder.ts` service to poll LCU and capture game outcomes in `src/main/gameRecorder.ts`
  - Helper: Parse LCU `/lol-match-history/v1/products/lol/current-summoner/matches` response
  - Helper: Fetch full match details and extract allies/enemies/result/role/tier
  - Helper: Validate GameRecord before insert (champion keys, role enum, tier enum)
- [X] T018 [US1] Integrate `gameRecorder` into main app startup in `src/main/index.ts` (start polling on app launch)
- [X] T019 [P] [US1] Update `app_settings` table with columns `last_game_record_fetch_at` and `last_game_record_tier` via migration or schema extension
- [X] T020 [US1] Emit IPC event `game:record-outcome` from `gameRecorder` after successful insert in `src/main/gameRecorder.ts`
- [X] T021 [US1] Handle IPC event listener in renderer in `src/renderer/src/main.ts` (custom event dispatch for refresh)

**Checkpoint**: User Story 1 complete — game recording works independently. Games are captured and persisted.

---

## Phase 4: User Story 2 - View Personal Counters (Priority: P1) 🎯 MVP

**Goal**: Display ranked list of personal counters with threat scores and confidence tiers in a dedicated UI view.

**Independent Test**: With recorded games, open Personal Counters view, verify champions are ranked by threat score (highest win-rate losses first), labels show "Confirmed/Likely/Potential threat" correctly.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T022 [P] [US2] Unit test: `counterAnalyzer.rankCounters()` with fixture data (10 games vs. Ahri, 5 vs. LeBlanc, 1 vs. Zed) in `src/recommendation/counterAnalyzer.test.ts`
  - Assert: Ahri ranks first (highest threat despite frequency weight)
  - Assert: LeBlanc ranks second
  - Assert: Zed ranks third (Potential threat)
- [X] T023 [P] [US2] Unit test: `counterAnalyzer.calculateThreatScore()` edge cases (0 games, 100% win, 0% win) in `src/recommendation/counterAnalyzer.test.ts`
- [X] T024 [P] [US2] Unit test: `counterAnalyzer.assignConfidenceTier()` boundary tests (1, 2, 3, 9, 10 games) in `src/recommendation/counterAnalyzer.test.ts`
- [X] T025 [US2] Contract test: IPC handler `game:fetch-counters` returns correct response shape in `src/main/__tests__/gameRecorder.ipc.test.ts`
- [ ] T026 [US2] Integration test: PersonalCounters view renders counter list — **deferred**: project has no jsdom/`@vue/test-utils`; adding them for this feature violates Constitution VII. Covered instead by the `game:fetch-counters` contract test (response shape/ranking, `tests/contract/game-handlers.test.ts`) + manual QA (T051).

### Implementation for User Story 2

- [X] T027 [P] [US2] Implement `counterAnalyzer.calculateThreatScore()` formula: `(50 - winRate%) × min(1.0, gamesPlayed / 5)` in `src/recommendation/counterAnalyzer.ts`
- [X] T028 [P] [US2] Implement `counterAnalyzer.assignConfidenceTier()` logic in `src/recommendation/counterAnalyzer.ts`
  - "Potential": 1–2 games
  - "Likely": 3–9 games
  - "Confirmed": 10+ games
- [X] T029 [P] [US2] Implement `counterAnalyzer.rankCounters()` with aggregation logic in `src/recommendation/counterAnalyzer.ts`
  - Group GameRecords by opponent champion
  - Calculate win rate (wins / total games)
  - Compute threat score and confidence tier
  - Sort by threat score DESC, then by games DESC
  - Return top 20
- [X] T030 [US2] Implement IPC handler for `game:fetch-counters` in `src/main/ipc/handlers.ts`
  - Fetch current tier from AppSettings
  - Call `counterAnalyzer.rankCounters()` with filtered GameRecords
  - Return response with counters + tier context + freshness info
- [X] T031 [P] [US2] Create composable `usePersonalCounters.ts` in `src/renderer/src/composables/usePersonalCounters.ts`
  - Wrap IPC call to `window.api.game.fetchCounters()`
  - Expose `counters`, `tierContext`, `fetchCounters()` function
  - Handle errors gracefully
- [X] T032 [P] [US2] Create Vue component `PersonalCounters.vue` in `src/renderer/src/views/PersonalCounters.vue`
  - Display counter list with champion name, win rate %, games count, threat score, confidence tier
  - Show empty state if no counters
  - Use Vuetify components for styling (cards, lists, chips)
- [X] T033 [US2] Wire up route in router: `/counters` → `PersonalCounters.vue` in `src/renderer/src/router/index.ts`
- [X] T034 [US2] Add navigation link to PersonalCounters view in main app shell (e.g., sidebar or top nav)

**Checkpoint**: User Stories 1 & 2 complete — MVP is functional. Users can record games and view personal counters.

---

## Phase 5: User Story 3 - Filter Counters by Role (Priority: P2)

**Goal**: Enable users to filter personal counter rankings by the role they were playing in champion select.

**Independent Test**: With games recorded across multiple roles (MID, TOP, ADC), filter to MID role and verify only MID-specific counters are displayed; threat scores reflect only MID games.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T035 [P] [US3] Unit test: `counterAnalyzer.filterByRole()` in `src/recommendation/counterAnalyzer.test.ts`
  - Given 20 games (10 MID, 10 TOP), filter to MID only returns 10
  - Assert threat scores recalculated for MID games only
- [X] T036 [P] [US3] Unit test: Empty result when no games in selected role in `src/recommendation/counterAnalyzer.test.ts`
- [X] T037 [US3] Contract test: IPC handler `game:fetch-counters` with role filter parameter in `src/main/__tests__/gameRecorder.ipc.test.ts`
- [ ] T038 [US3] Integration test: PersonalCounters role filter UI updates counter list — **deferred** (same reason as T026). Role-filter behaviour is covered by the contract test (`role` param → filtered/empty results) and the `rankCounters` role-filter unit tests.

### Implementation for User Story 3

- [X] T039 [P] [US3] Implement `counterAnalyzer.filterByRole()` in `src/recommendation/counterAnalyzer.ts`
  - Accept GameRecord array and role string
  - Return filtered array where `player_role === role`
  - If role is null/undefined, return all games
- [X] T040 [P] [US3] Update `counterAnalyzer.rankCounters()` to accept optional role parameter in `src/recommendation/counterAnalyzer.ts`
  - If role provided, filter games first, then rank
- [X] T041 [US3] Update IPC handler `game:fetch-counters` to accept and pass through `role` parameter in `src/main/ipc/handlers.ts`
- [X] T042 [P] [US3] Add role filter UI to `PersonalCounters.vue` in `src/renderer/src/views/PersonalCounters.vue`
  - Radio button group or toggle buttons: All Roles, TOP, JUNGLE, MID, BOTTOM, SUPPORT
  - Default to "All Roles"
  - Update counter list on selection change
- [X] T043 [US3] Update `usePersonalCounters.ts` to accept and pass role filter to IPC in `src/renderer/src/composables/usePersonalCounters.ts`

**Checkpoint**: User Stories 1, 2, & 3 complete — users can filter threats by role.

---

## Phase 6: User Story 4 - Confidence Indicators (Priority: P2)

**Goal**: Display confidence tiers (Potential, Likely, Confirmed) based on sample size to prevent over-weighting low-frequency matchups.

**Independent Test**: Record 1 game vs. Champion A, 5 games vs. Champion B, 15 games vs. Champion C; verify confidence labels display correctly in UI and threat ranking prioritizes by threat score (not raw win rate).

### Tests for User Story 4

> **NOTE: Already covered in US2 tests (T024) but repeated here for completeness**

- [X] T044 [US4] Unit test: Confidence tier visual indicator color in Vuetify chip in `src/renderer/src/__tests__/PersonalCounters.integration.test.ts`
  - "Confirmed" → red/error color
  - "Likely" → orange/warning color
  - "Potential" → blue/info color
- [ ] T045 [US4] Integration test: Tooltip on confidence tier explains sample size threshold — **deferred** (same reason as T026). The tooltip is implemented (`counterConfidenceTooltip` on the confidence chip in `PersonalCounterCard.vue`); verified via manual QA (T051).

### Implementation for User Story 4

- [X] T046 [P] [US4] Add confidence tier color mapping helper in `src/renderer/src/views/PersonalCounters.vue` or composable
  - Function: `confidenceColor(tier: string)` → Vuetify color string
- [X] T047 [US4] Add visual styling to counter list items in `PersonalCounters.vue` to highlight confidence tier chip
  - Apply color to chip based on tier
  - Add optional tooltip explaining tier (1–2 games, 3–9, 10+)
- [X] T048 [US4] (Optional) Add help text or info icon in Personal Counters view explaining confidence tiers and threat score calculation

**Checkpoint**: User Stories 1, 2, 3, & 4 complete — full feature is implemented and testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements, documentation, and final validation

- [X] T049 [P] Documentation: Add dev guide in `specs/008-local-game-stats/dev-guide.md` (if not already present as quickstart.md)
- [X] T050 [P] Code cleanup: Remove console.log statements and temporary debugging in all new files
- [ ] T051 Run manual QA: Play 10+ games, verify Personal Counters view reflects all games with correct threat ranking — **requires a live League client** (run `npm run electron:rebuild` then `npm run dev`); not executable in this implementation session.
- [ ] T052 Performance validation: Verify counter fetch completes in <500ms with 1000 recorded games — **not yet measured** (needs a seeded 1000-game dataset). Query is indexed by tier and aggregation is O(games); expected well under budget, but unverified here.
- [X] T053 [P] Update `CLAUDE.md` if any significant architectural patterns differ from expectations
- [X] T054 Run `npm run typecheck` and `npm test` to ensure no TypeScript or test failures
- [X] T055 (Optional) Add unit tests for edge cases if not already covered: null tiers, empty champion arrays, invalid champions
- [X] T056 Validate quickstart.md workflow end-to-end against implementation

**Checkpoint**: Feature complete, tested, documented, and ready for integration.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational - BLOCKS all stories) → Phase 3 & 4 & 5 & 6 (in priority order or parallel)
```

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion; can start in parallel with US1
- **User Story 3 (Phase 5)**: Depends on US2 completion (filtering the already-computed counters)
- **User Story 4 (Phase 6)**: Depends on US2 completion (styling already-computed confidence tiers)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | ID | Title | P1 Depends On | P2 Depends On |
|-------|----|----|---|---|
| US1 | Phase 3 | Record Game Outcomes | Foundational (Phase 2) | None |
| US2 | Phase 4 | View Personal Counters | Foundational (Phase 2) | None |
| US3 | Phase 5 | Filter by Role | Foundational (Phase 2) | US2 (counter ranking exists) |
| US4 | Phase 6 | Confidence Indicators | Foundational (Phase 2) | US2 (threat scoring exists) |

### Within Each Phase

- **Tests MUST be written FIRST** (marked [US#]) before implementation tasks
- **Models/entities before services** (GameRecordsRepository before gameRecorder service)
- **Pure logic before UI** (counterAnalyzer before PersonalCounters component)
- **Core implementation before integration** (threat scoring before UI rendering)
- **Phase complete before moving to next** — especially critical for Foundational phase

### Parallel Opportunities

#### Setup Phase (Phase 1)
- T002, T003, T004 can all run in parallel (different files, no dependencies)

#### Foundational Phase (Phase 2)
- T005, T006, T009 can run in parallel (different files)
- T007, T008, T010 should wait for T005/T006 to provide scaffolds

#### User Story 1 (Phase 3)
- T011, T012, T013 tests can run in parallel
- T015, T016, T019 can run in parallel (different files)
- T017, T018, T020, T021 should sequence logically (gameRecorder → integration → startup → events)

#### User Story 2 (Phase 4)
- T022, T023, T024 unit tests can run in parallel
- T027, T028, T029 implementation functions can run in parallel (all in counterAnalyzer.ts, but different functions)
- T031, T032 (composable + component) can run in parallel
- T030 IPC handler should follow T027–T029 (depends on counterAnalyzer logic)

#### User Story 3 (Phase 5)
- T035, T036 unit tests can run in parallel
- T039, T040 implementation functions can run in parallel
- T042 UI updates should follow T040 (needs updated IPC signature)

#### User Story 4 (Phase 6)
- T044, T045 tests can run in parallel
- T046, T047, T048 UI work can run in parallel

#### Polish Phase (Phase 7)
- All [P] marked tasks can run in parallel

---

## Parallel Example: Quick Build (1 Developer)

```bash
# Phase 1: Setup (Sequential, quick)
✓ T001 Migration
✓ T002 Repository
✓ T003, T004 Types + IPC constants

# Phase 2: Foundational (Can batch)
✓ T005–T010 Infrastructure setup

# Phase 3: User Story 1 (Record Games)
✓ T011–T014 Tests
✓ T015–T021 Implementation

# Phase 4: User Story 2 (View Counters) — Parallel with US1 if possible
✓ T022–T026 Tests
✓ T027–T034 Implementation

# Phase 5: User Story 3 (Role Filter) — After US2
✓ T035–T038 Tests
✓ T039–T043 Implementation

# Phase 6: User Story 4 (Confidence) — After US2
✓ T044–T048 Tests + Implementation

# Phase 7: Polish
✓ T049–T056 Final validation
```

---

## Parallel Example: Team of 3 Developers

```bash
# All: Phase 1 + Phase 2 together (foundation)
Dev A, B, C → T001–T010 (setup + foundational, 2 days)

# Then parallel:
Dev A → User Story 1 (T011–T021, 2 days)
Dev B → User Story 2 (T022–T034, 3 days) — starts after T009 done
Dev C → User Story 3 (T035–T043, 1 day) — starts after Dev B finishes T029

# Then sequential (US4 depends on US2):
Dev A or C → User Story 4 (T044–T048, 1 day)

# All: Polish (T049–T056, 1 day)
```

---

## MVP Strategy: User Stories 1 & 2 Only

To deliver a working MVP in minimal time:

1. **Complete Phase 1 & 2** (Setup + Foundational): ~1 day
2. **Complete Phase 3** (Record Games): ~1 day
3. **Complete Phase 4** (View Counters): ~1.5 days
4. **STOP** — MVP is complete and independently testable
5. **Total MVP**: ~3.5 days

Users get: Game recording + personal counter ranking. No role filtering or confidence labels (added later).

Phase 5 & 6 (role filtering, confidence indicators) are enhancements that can be added incrementally.

---

## Implementation Notes

### Database
- Migration `006_add_game_records.sql` creates `game_records` table with indices for fast role/tier queries.
- GameRecordsRepository handles all DB access; no direct queries in services.

### LCU Integration
- `gameRecorder.ts` polls LCU endpoint `/lol-match-history/v1/products/lol/current-summoner/matches`.
- Extracts allies/enemies/result/role/tier and validates before insert.
- Non-blocking; runs on a timer (e.g., every 5 minutes during play session).

### Pure Engine
- `counterAnalyzer.ts` contains pure functions (no Electron/Vue imports, no side effects).
- Threat score formula: `(50 - winRate%) × min(1.0, gamesPlayed / 5)`.
- All functions are unit-testable with fixture data.

### IPC Contract
- Preload exports `window.api.game.fetchCounters(filter?)` → Promise<PersonalCounter[]>.
- Main process handler aggregates GameRecords and ranks by threat score.
- No direct database queries from renderer; all data flows through IPC.

### UI/UX
- Personal Counters view is a dedicated route `/counters`, separate from champion pool management.
- Role filter defaults to "All Roles"; updates counter list on change.
- Confidence tier displayed as colored chip (red/orange/blue).
- Empty state when no games recorded.

---

## Testing Strategy

### Unit Tests (Vitest)
- `counterAnalyzer.test.ts`: Threat scoring, confidence tier assignment, role filtering, edge cases
- `gameRecordsRepository.test.ts`: CRUD operations, queries with indices
- `gameRecorder.test.ts`: LCU parsing, validation, insert logic

### Integration Tests (Vitest)
- Game capture end-to-end (mock LCU, verify insert, verify IPC event)
- PersonalCounters view rendering with data
- Role filter updates counter list

### Contract Tests (Vitest)
- IPC handler response schema matches `PersonalCounter[]`
- Error handling (invalid role, no games, DB error)

### Manual QA
- Play 10+ ranked games against live LCU
- Verify all games recorded in SQLite
- Open Personal Counters view
- Verify threat ranking is correct (losses ranked highest)
- Filter by role; verify filtering works
- Verify confidence tiers display

---

## Commit Strategy

- **T001–T004**: Commit as "Database schema and types"
- **T005–T010**: Commit as "Foundational infrastructure and scaffolds"
- **T011–T021**: Commit as "US1: Game recording implementation and tests"
- **T022–T034**: Commit as "US2: Personal counters view and threat scoring"
- **T035–T043**: Commit as "US3: Role-based counter filtering"
- **T044–T048**: Commit as "US4: Confidence tier indicators"
- **T049–T056**: Commit as "Polish and final validation"

Each commit should be independently buildable and testable.
