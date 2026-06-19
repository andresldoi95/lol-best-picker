# Tasks: Role-Based Ban Recommendations

**Input**: Design documents from `/specs/007-role-based-bans/`

**Specifications**: 
- [spec.md](spec.md) — 3 user stories (P1, P1, P2) with independent acceptance criteria
- [plan.md](plan.md) — Tech stack (TypeScript, Electron, Vue 3, SQLite), architecture, and Phase 0–1 design

**Tests**: Unit tests for pure `banRanker` module are REQUIRED per Constitution VI. Integration tests recommended for IPC contracts.

**Organization**: Tasks grouped by user story for independent implementation and testing. Each story can be completed and validated in isolation before moving to the next.

---

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: Parallelizable (different files, no dependencies between tasks)
- **[Story]**: User story label (US1, US2, US3) — Setup/Foundational phases have no story label
- **File paths**: Exact locations for implementation

---

## Phase 1: Setup (Shared Infrastructure & Schema)

**Purpose**: Database schema, type definitions, and IPC channel setup

- [X] T001 Create SQLite migration `005_add_ban_stats.sql` in `src/main/db/migrations/` with `ban_stats` table + `app_settings` columns (last_ban_stats_fetch_at/_status, current_elo_tier); registered in `migrations/index.ts` (migrations are `.sql`, not `.ts`)
- [X] T002 [P] Add `EloTier`/`ELO_TIERS`/`DEFAULT_ELO_TIER`, `BanRecommendation`, `BanRecommendationSet` types to `src/shared/types.ts`; extend `AppSettings`; surface new columns in `SettingsRepository` (+`setCurrentEloTier`)
- [X] T003 [P] Add IPC channel constants (`'ban:fetch-recommendations'`, `'ban:stats-updated'`) to `src/shared/ipcChannels.ts` (+ INVOKE/EVENT whitelists)

**Checkpoint**: Schema and type definitions ready for implementation

---

## Phase 2: Foundational (Core Ban Logic & Data Access Layer)

**Purpose**: Pure ranking engine, data persistence, and stats fetching — BLOCKS all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Implement pure `banRanker` module in `src/recommendation/banRanker.ts` — `rankBansByWinRate({ stats, currentElo, perRole? }) → BanRecommendation[]` with no Electron/Vue imports
- [X] T005 [P] Unit tests for `banRanker` in `tests/unit/recommendation/banRanker.test.ts` (tests live in `tests/`, not `src/`): empty list, no-elo-match, equal WR tie-break, fewer than 3 per role, full 5-role dataset, perRole override, elo filtering — 8 tests passing
- [X] T006 [P] Implement `BanStatsRepository` in `src/main/db/repositories/banStatsRepository.ts`: `upsertBanStats()`, `markFetchError()`, `hasBanStatsForElo()`, `getBanStatsByElo()` (JOINs champions for name/icon)
- [X] T007 [P] Add `fetchBanStatsForElo(elo, opts)` in `src/main/stats/banStatsProvider.ts` — reuses `LolalyticsStatsProvider` tier-list scrape (no new scraper; FR-006 / Constitution VII)
- [X] T008 Implement ban orchestration in `src/main/stats/banStatsProvider.ts` — `refreshBanStats()` (staleness/missing-elo check, fetch, upsert, freshness, fallback)
- [X] T009 Add IPC handler for `'ban:fetch-recommendations'` in `src/main/ipc/handlerMap.ts` + `BanRecommendationService` (`src/main/banRecommendationService.ts`); accepts elo (null → current), returns freshness + recommendations
- [X] T010 `startBanStatsRefresh()` poller in `src/main/stats/banStatsProvider.ts` (returns `{stop, refresh}`; refresh re-triggered on LCU tier change) — wired in `src/main/index.ts`
- [X] T011 Extend `src/preload/index.ts` (+ `index.d.ts`) to expose `window.api.ban.fetchRecommendations(elo?)` + `onUpdate` — typed, whitelisted

**Checkpoint**: Foundation complete — ban ranking, data access, and IPC contracts all working. Ready for user story UI implementation.

---

## Phase 3: User Story 1 - View Ban Recommendations Before Champion Select (Priority: P1) 🎯 MVP

**Goal**: Display role-segmented ban recommendations (3+ per role) ranked by win rate at user's current Elo before champion select begins.

**Independent Test**: Launch app, open champ-select view (or pre-select screen), verify "Recommended Bans" section displays exactly 3 champions per role (top, jungle, mid, adc, support) in descending win-rate order. All 5 roles visible regardless of user's assigned role.

### Tests for User Story 1

- [~] T012 [P] [US1] **SKIPPED** — Vue component unit test. No jsdom/@vue/test-utils harness exists (vitest runs `environment: 'node'`); adding one is a new dep (Constitution VII). Constitution VI only mandates pure-logic tests (covered by T005). Component data flow is exercised via the IPC contract test (T013).
- [X] T013 [P] [US1] Ban recommendation IPC round-trip test in `tests/contract/ban-handlers.test.ts` (repo keeps IPC handler tests in `tests/contract/`) — current-elo ranking, freshness, FR-009 fallback, empty set — 4 tests passing

### Implementation for User Story 1

- [X] T014 [P] [US1] Create `BanRecommendations.vue` in `src/renderer/src/components/` — 5-role grid with loading/empty states, elo chip, freshness indicator
- [X] T015 [P] [US1] Create `BanRecommendationCard.vue` in `src/renderer/src/components/` — champion icon, name, win rate, rank badge
- [X] T016 [P] [US1] Create `useBanRecommendations` composable in `src/renderer/src/composables/useBanRecommendations.ts` — fetches + subscribes to live updates, reactive state
- [X] T017 [US1] Integrate `<BanRecommendations />` via a dedicated, always-accessible `BanRecommendationsView.vue` page + `/bans` route + nav item (the "pre-select view" — available before/regardless of champ select, satisfies US1 + SC-001/SC-002)
- [X] T018 [US1] `startBanStatsRefresh()` called at startup in `src/main/index.ts` (`wireServices`)
- [X] T019 [US1] Seed ban stats via `seedBanStats()` in `src/main/stats/seedData/index.ts` (reuses bundled `championStats.json` at the default Elo) — usable on first run offline

**Checkpoint**: User Story 1 complete and independently testable. Users can see role-based ban recommendations with live/cached data.

---

## Phase 4: User Story 2 - Distinguish Recommended Bans from Pick Recommendations (Priority: P1)

**Goal**: Ensure ban recommendations are visually distinct from existing pick recommendations so users never confuse which list is which.

**Independent Test**: Open app, verify "Recommended Bans" section is labeled, styled, and positioned distinctly from "Recommended Picks" section. A user with no context should immediately identify which is bans vs. picks (e.g., via color, icon, heading, or spatial separation).

### Implementation for User Story 2

- [X] T020 [P] [US2] Ban card styling distinct from pick cards (`color="error"` tonal, rank badge) in `BanRecommendationCard.vue`
- [X] T021 [US2] Error-themed container styling for `BanRecommendations.vue` (red header/title/chips vs. primary/blue picks)
- [X] T022 [US2] Bans live on their own `/bans` tab with a red skull-marked "Recommended Bans" header — spatially + chromatically separated from the primary-colored picks on the Champ Select tab
- [X] T023 [US2] Skull icon in the header + `mdi-cancel` ban-symbol overlay on each portrait + rank badge for instant recognition

**Checkpoint**: User Story 2 complete. Bans and picks are visually distinct and cannot be confused.

---

## Phase 5: User Story 3 - See Freshness Indicator for Ban Data (Priority: P2)

**Goal**: Display live/cached/stale freshness indicator for ban recommendations so users know data confidence level, following the same pattern as pick recommendations.

**Independent Test**: Verify ban recommendations display one of three freshness indicators: "Live" (fetch < 24h old), "Cached" (fetch < 7d old), "Stale" (> 7d old or offline). Stale indicator is visually distinct (muted color, warning icon, explanatory tooltip).

### Implementation for User Story 3

- [X] T024 [P] [US3] **Reused** the existing `src/renderer/src/components/FreshnessIndicator.vue` (live/cached/stale states + relative-time) — no new component needed
- [X] T025 [P] [US3] `freshness` is computed in main via the shared `deriveFreshness()` and carried on `BanRecommendationSet`; `useBanRecommendations` exposes it on `banSet.freshness` (same pattern as picks)
- [X] T026 [US3] `<FreshnessIndicator />` integrated into the `BanRecommendations.vue` header next to the title
- [X] T027 [US3] `app_settings.last_ban_stats_fetch_at` / `last_ban_stats_fetch_status` added in migration 005 (T001); surfaced in `SettingsRepository`/`AppSettings`
- [X] T028 [US3] `BanStatsRepository.upsertBanStats()` stamps success timestamp+status; `markFetchError()` flips status without touching cached rows (deriveFreshness consumes both)

**Checkpoint**: User Story 3 complete. Ban data freshness is transparent and user can gauge confidence in recommendations.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Code cleanup, documentation, and final validation

- [X] T029 [P] `npm test` — all 133 tests pass (incl. 8 banRanker unit + 4 ban IPC contract); required `npm rebuild better-sqlite3` (Node ABI)
- [X] T030 [P] `npm run typecheck` — clean (tsc node + vue-tsc web); also verified full `npm run build` bundles
- [X] T031 Updated `CLAUDE.md` — added the ban-recommendations architecture paragraph + Bans view in the tree
- [X] T032 Created `docs/ban-recommendations-dev-guide.md` (data flow, file map, common changes, freshness/offline, testing)
- [~] T033 N/A — `specs/007-role-based-bans/quickstart.md` was never generated (plan referenced it but Phase 1 docs weren't created); the dev guide (T032) covers the developer workflow instead
- [X] T034 [P] Code cleanup — no `console.log`/dead code in new files; `console.warn` for fetch/LCU failures matches existing pattern, no secrets logged (Constitution II)
- [ ] T035 Commit — left to the optional `after_implement` git hook (`/speckit-git-commit`); not auto-committed

**Checkpoint**: Feature complete, tested, and documented. Ready for code review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion
  - Stories can proceed in priority order (P1 → P1 → P2) or in parallel if staffed
  - US1 and US2 are both P1 and can run in parallel after Foundational; US3 (P2) can overlap or follow
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### Within Phases

**Setup (Phase 1)**:
- T001 (migration) must complete before T006 (CRUD operations use schema)
- T002, T003 can start immediately and run in parallel

**Foundational (Phase 2)**:
- T004 (banRanker) independent, can start immediately
- T005 (tests) depends on T004 logic being defined
- T006 (repository) independent
- T007 (lolalytics fetch) independent
- T008 (provider) depends on T006 + T007
- T009 (IPC handler) depends on T004
- T010 (poller) depends on T008
- T011 (preload) depends on T009

Recommended order: T004 → T005, then T006, T007 in parallel, then T008 → T009 → T010, T011

**User Story 1 (Phase 3)**:
- T012, T013 (tests) can be written before implementation
- T014, T015, T016 (components) can run in parallel
- T017 (integration into champSelect) depends on T014
- T018 (startup init) independent
- T019 (seed data) independent

**User Story 2 (Phase 4)**:
- All tasks T020–T023 can run in parallel (same component, styling only)
- Depends on US1 components existing

**User Story 3 (Phase 5)**:
- T024 (FreshnessIndicator) independent
- T025 (composable update) depends on existing composable from US1
- T026 (integration) depends on T024 + T025
- T027, T028 (timestamps, provider update) can run in parallel

---

## Parallel Opportunities

### Within Foundational Phase

```
After Setup completes:

Parallel group 1:  T004 (banRanker), T006 (repository), T007 (lolalytics fetch)
Then:              T005 (tests for T004), T008 (provider)
Then:              T009 (IPC handler), T010 (poller init)
Finally:           T011 (preload bridge)
```

### Within User Story 1

```
Parallel group 1:  T012 (component test), T013 (integration test), T014 (BanRecommendations.vue), 
                   T015 (BanRecommendationCard.vue), T016 (composable)
Then:              T017 (integrate into champSelect), T018 (startup), T019 (seed data)
```

### Within User Story 2

```
All in parallel:   T020, T021, T022, T023 (all styling/layout for same components)
```

### Within User Story 3

```
Parallel group 1:  T024 (FreshnessIndicator), T027 (SQLite update), T028 (provider update)
Then:              T025 (composable), T026 (integration)
```

### Across User Stories (after Foundational)

US1, US2, and early parts of US3 can run in parallel by different team members:
- Developer A: US1 (T014–T019)
- Developer B: US2 (T020–T023) — depends on A's T014
- Developer C: US3 setup (T024, T027, T028) — can start immediately
- B and C integrate once A is done

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. ✅ Complete Phase 1: Setup (T001–T003)
2. ✅ Complete Phase 2: Foundational (T004–T011) — BLOCKS all stories
3. ✅ Complete Phase 3: User Story 1 (T012–T019)
4. **STOP and VALIDATE**: 
   - Run `npm run dev`
   - Open champion select
   - Verify ban recommendations appear with 3 per role
   - All 5 roles visible
   - Data loads correctly
5. Deploy/demo if ready

### Incremental Delivery (Full Feature)

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (improved UX)
4. Add User Story 3 → Test independently → Deploy/Demo (complete feature)
5. Add Polish → Final release

Each increment delivers tangible user value without breaking previous functionality.

### Parallel Team Strategy (3 developers)

1. **Day 1**: All together complete Setup + Foundational (T001–T011)
2. **Day 2+**: 
   - Developer A: User Story 1 (T012–T019) — feature foundation
   - Developer B: User Story 2 (T020–T023) — UX polish, depends on A
   - Developer C: User Story 3 start (T024, T027, T028) — data transparency

This enables ~3 stories in parallel with only 1 critical dependency (US2 needs US1 components to exist).

---

## Task Checklist Rules

✅ **All tasks follow strict format**:
- `[checkbox]` `[ID]` `[P?]` `[Story?]` Description with file path
- Every task is specific and immediately actionable
- File paths are absolute or repo-relative
- No vague/ambiguous tasks

✅ **Independent testing per story**:
- After T019: Run `npm run dev` and manually verify US1 works
- After T023: Verify visual distinction between bans and picks
- After T028: Verify freshness indicator displays correctly

✅ **Each phase is a logical checkpoint**:
- Phase 1 = schema ready
- Phase 2 = all core logic ready
- Phase 3 = basic ban recommendations working
- Phase 4 = polished UX
- Phase 5 = complete with freshness transparency
- Phase 6 = production-ready

---

## Notes

- Tests for pure `banRanker` (T005) are REQUIRED per Constitution VI
- Each user story is independently deployable and testable
- No story depends on another story being complete (only on Foundational)
- Commit after each logical group (e.g., after T011, after T019, after T023)
- Use `/npm test` after T011 to validate foundational logic before UI work
- Consult `specs/007-role-based-bans/quickstart.md` during implementation for testing workflow
