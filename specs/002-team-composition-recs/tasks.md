# Tasks: Composition-Aware Recommendations

**Input**: Design documents from `/specs/002-team-composition-recs/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Included — Principle VI of the project constitution requires unit tests written and failing before engine.ts is modified.

**Organization**: Tasks grouped by user story to enable independent implementation and testing of each increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the DB migration and extend the shared types — both required by every subsequent phase.

- [X] T001 [P] Create src/main/db/migrations/002_add_synergy.sql — champion_synergy table (champion_id, role, ally_champion_id, win_rate, games_played, patch, fetched_at, UNIQUE constraint on (champion_id, role, ally_champion_id, patch), two indexes: idx_champion_synergy_lookup and idx_champion_synergy_ally) plus ALTER TABLE champ_select_snapshot ADD COLUMN ally_champion_ids TEXT NOT NULL DEFAULT '[]' per data-model.md §1–2
- [X] T002 [P] Extend src/shared/types.ts — add ActiveSignal union type, ScoreBreakdown interface, extend ScoreBasis to include 'combined', add scoreBreakdown field to RecommendationEntry, add allyChampionIds: number[] to ChampSelectSession and Recommendation, add SynergyRowInput interface, extend RecommendationInput with synergyRows and allyChampionIds per data-model.md §3–4

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data-layer interfaces and the snapshot extension that all user story phases depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Create src/main/stats/synergyProvider.ts — export SynergyProvider interface with fetchSynergyStats(targets), NormalizedSynergyRow interface, and SynergyProviderTarget interface per contracts/synergy-provider.md §Interface
- [X] T004 [P] Create src/main/db/repositories/synergyRepository.ts — export SynergyRow interface and SynergyRepository class with upsertSynergy(rows) using REPLACE semantics and getSynergyRowsForChampions(championIds) returning latest-patch rows per data-model.md §5
- [X] T005 Modify src/main/db/repositories/snapshotRepository.ts — add allyChampionIds: number[] to ChampSelectSnapshot type; persist ally_champion_ids via JSON.stringify in update(); restore via JSON.parse in read() using same pattern as enemy_champion_ids per data-model.md §2

**Checkpoint**: Foundation complete — all three user story phases can now begin.

---

## Phase 3: User Story 1 — Combined Ally + Enemy Score Recommendations (Priority: P1) 🎯 MVP

**Goal**: Compute and surface a 50/50 combined score incorporating both enemy matchup WR and ally synergy WR for each role-eligible pool champion.

**Independent Test**: Run `npm run test:unit` — all 6 new fixtures in engine.test.ts and all synergy.test.ts tests must pass. Then start the dev server, populate `allyChampionIds = [21, 412]` in FixtureLcuAdapter, call `recommendation.get()` via DevTools, and confirm `entries[0].scoreBreakdown.activeSignals` includes `'ally-synergy'` and `entries[0].score === entries[0].scoreBreakdown.combinedScore`.

### Tests for User Story 1 (Principle VI — write FIRST, verify FAIL before implementation)

- [X] T006 [P] [US1] Create tests/unit/recommendation/synergy.test.ts — unit tests for scoreWithAllies() covering: (a) returns overallWinRate signal 'overall' when allyChampionIds is empty; (b) returns synergy WR when a matching row exists; (c) falls back to overallWinRate for an ally with no matching synergy row; (d) averages WR across multiple allies mixing synergy rows and fallbacks
- [X] T007 [P] [US1] Add 6 new synergy/combined-score fixtures to tests/unit/recommendation/engine.test.ts — (1) no allies → enemy-only score equals spec-001 behavior; (2) no synergy data for any pair → ally component uses overallWinRate; (3) single ally with synergy data present → combined = 0.5*enemy + 0.5*ally; (4) multiple allies → pairwise average synergy, 50/50 combined; (5) pool champion already in allyChampionIds → excluded from entries (FR-010); (6) conflicting signals (high enemy score + low ally score) → ranking order reflects combined score
- [X] T008 [P] [US1] Create tests/contract/fixtures/fixtureSynergyProvider.ts — FixtureSynergyProvider class implementing SynergyProvider; constructor accepts NormalizedSynergyRow[]; fetchSynergyStats filters by championKey:role target set per contracts/synergy-provider.md §FixtureSynergyProvider

### Contract Test for User Story 1

- [X] T009 [US1] Create tests/contract/synergy-provider.test.ts — verify FixtureSynergyProvider returns correct subset for matching targets; returns empty array when no rows match; returns partial results when only some targets match (depends on T008)

### Implementation for User Story 1

- [X] T010 [US1] Create src/recommendation/synergy.ts — pure scoreWithAllies() function with AllyCandidateScore return type (score, gamesPlayed, signal); no I/O or framework imports; per-ally fallback to overallWinRate when no synergy row; average across all allies per data-model.md §6 and research.md §3 (write after T006 test is written and failing)
- [X] T011 [US1] Modify src/recommendation/engine.ts — rename internal score to enemyScore in scoreCandidate(); call scoreWithAllies() to get allyScore; apply combined weighting from research.md §3 weighting table (both/enemy-only/ally-only/neither); add FR-010 filter excluding allyChampionIds from candidate set before scoring; populate scoreBreakdown on each RecommendationEntry; pass allyChampionIds through to Recommendation output (write after T007 test is written and failing; depends on T010)
- [X] T012 [P] [US1] Create src/main/stats/lolalyticsMatchupProvider.ts — LolalyticsMatchupProvider class implementing SynergyProvider; constructor accepts LolalyticsMatchupProviderOptions; fetch per-champion build pages at {baseUrl}/lol/{slug}/build/?lane={lane}&tier={tier}; locate qwik/json script; decode objs array; locate synergy map with champion-ID keys; emit NormalizedSynergyRow[] filtered by minGames; per-target error catch+warn+skip per contracts/synergy-provider.md §LolalyticsMatchupProvider and research.md §2 (can run parallel with T010/T011)
- [X] T013 [US1] Modify src/main/recommendationService.ts — inject SynergyRepository; call getSynergyRowsForChampions() with current pool champion IDs; pass synergyRows and allyChampionIds from the current ChampSelectSession into RecommendationInput; include allyChampionIds in the Recommendation output (depends on T004, T011)
- [X] T014 [US1] Modify src/main/stats/index.ts — add LolalyticsMatchupProvider instantiation in startStatsRefresh(); build SynergyProviderTarget[] from current pool entries; call fetchSynergyStats() and pass results to synergyRepository.upsertSynergy() in the same refresh cycle as overall stats per research.md §5 (depends on T012, T013)

**Checkpoint**: User Story 1 complete — combined scoring, synergy data fetch, ally exclusion, and score breakdown all functional.

---

## Phase 4: User Story 2 — Real-time Ally Lock-in Updates (Priority: P2)

**Goal**: Detect each ally lock-in event and trigger a recommendation refresh within 1 second (SC-001, Principle V).

**Independent Test**: Before and after simulating an ally lock-in via `mockSession.allyChampionIds = [21]` in FixtureLcuAdapter, observe the recommendation list and confirm it updates within 1 second with the new ally included in the synergy score.

### Implementation for User Story 2

- [X] T015 [US2] Modify src/main/lcu/normalize.ts — in normalizeChampSelectSession(), extract allyChampionIds by filtering raw.myTeam[] to entries where championId > 0 and cellId !== localPlayerCellId; assign to ChampSelectSession.allyChampionIds per research.md §1 and ipc-api.md §ChampSelectSession
- [X] T016 [US2] Modify src/main/lcu/champSelectAdapter.ts — update sessionKey() to include sorted allyChampionIds in the change-fingerprint string: `${phase}:${role}:${enemyIds.sort().join(',')}:${allyIds.sort().join(',')}` per ipc-api.md §champSelect change detection (depends on T015)

**Checkpoint**: User Story 2 complete — ally lock-in events now trigger recommendation:updated push within 1 second.

---

## Phase 5: User Story 3 — Score Breakdown Panel (Priority: P3)

**Goal**: Show the enemy-matchup and ally-synergy contributions separately in the recommendation UI (FR-009, SC-002).

**Independent Test**: In a champion select state with both ally and enemy picks present, select a recommended champion and verify the panel shows distinct enemyMatchupScore and allysSynergyScore values; verify single-signal display shows 100% weight on the active signal and indicates the other is unavailable.

### Implementation for User Story 3

- [X] T017 [US3] Modify src/renderer/src/composables/useRecommendation.ts — expose scoreBreakdown from each RecommendationEntry to the template; ensure enemyMatchupScore, allysSynergyScore, combinedScore, and activeSignals are accessible for conditional display
- [X] T018 [US3] Modify src/renderer/src/pages/ChampSelectView.vue — add score breakdown panel per FR-009; display enemyMatchupScore and allysSynergyScore as separate labeled values; handle single-signal state (activeSignals.length === 1) by showing 100% weight on the active signal and a "not available" indicator for the other per spec US3 AC3 (depends on T017)

**Checkpoint**: All three user stories fully functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Type-safety validation and manual LCU verification.

- [X] T019 Run npm run typecheck and fix any type errors across src/shared/types.ts, src/recommendation/engine.ts, src/main/lcu/normalize.ts, src/main/recommendationService.ts, src/renderer/src/composables/useRecommendation.ts, and src/renderer/src/pages/ChampSelectView.vue
- [ ] T020 Execute the manual LCU test checklist from quickstart.md §6 — verify allyChampionIds populates correctly on a live League Client, verify recommendation panel refreshes within 1 second on ally lock-in, verify scoreBreakdown panel shows distinct enemy and ally scores (required by constitution for any PR touching src/main/lcu/)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 run in parallel immediately
- **Foundational (Phase 2)**: Depends on T002 (types defined) — T003, T004, T005 run in parallel after T002
- **US1 (Phase 3)**: Depends on Foundational completion — tests first, then implementation
- **US2 (Phase 4)**: Depends on T002 + T005 (snapshot type) — can start after Phase 2; independent of US1
- **US3 (Phase 5)**: Depends on T011 (scoreBreakdown exists in engine output) + T002
- **Polish (Phase 6)**: Depends on T014, T016, T018 (all implementation complete)

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependency on US2 or US3
- **US2 (P2)**: After Foundational — LCU layer is separate from scoring layer; independent of US1
- **US3 (P3)**: After US1 (needs scoreBreakdown populated by T011 engine changes)

### Within US1 — Critical Ordering

```
T006 ‖ T007 ‖ T008  (write tests + fixture)
       ↓
T009               (contract test, needs T008)
T010               (synergy.ts, after T006 fails)
       ↓
T011               (engine.ts, after T007 fails + T010 complete)
T012               (lolalytics provider, parallel with T010/T011)
       ↓
T013               (service, after T004 + T011)
       ↓
T014               (stats refresh, after T012 + T013)
```

### Parallel Opportunities

- T001 ‖ T002 (Phase 1)
- T003 ‖ T004 ‖ T005 (Phase 2, after T002)
- T006 ‖ T007 ‖ T008 (Phase 3 test writing, after T003)
- T010 ‖ T012 (Phase 3 implementation, different files)
- T015 ‖ T017 (US2 LCU + US3 composable, once US1 complete)

---

## Parallel Example: User Story 1

```bash
# Step 1 — write all tests in parallel:
T006: tests/unit/recommendation/synergy.test.ts
T007: tests/unit/recommendation/engine.test.ts  (new fixtures)
T008: tests/contract/fixtures/fixtureSynergyProvider.ts

# Step 2 — run tests, confirm they all FAIL (Principle VI gate)
npm run test:unit

# Step 3 — implement in parallel where files differ:
T010: src/recommendation/synergy.ts
T012: src/main/stats/lolalyticsMatchupProvider.ts

# Step 4 — sequential completions:
T011: src/recommendation/engine.ts      (needs T010)
T009: tests/contract/synergy-provider.test.ts   (needs T008)
T013: src/main/recommendationService.ts (needs T004 + T011)
T014: src/main/stats/index.ts           (needs T012 + T013)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003, T004, T005)
3. Complete Phase 3: User Story 1 (T006–T014)
4. **STOP and VALIDATE**: `npm run test:unit` — all 6 new engine fixtures pass; `npm run typecheck` clean
5. Verify via DevTools: `recommendation.get()` returns entries with `scoreBreakdown.activeSignals` including `'ally-synergy'`

### Incremental Delivery

1. Setup + Foundational → migration and types committed
2. User Story 1 → combined scoring + synergy data fetch functional (MVP)
3. User Story 2 → ally lock-ins auto-trigger re-ranking within 1 second
4. User Story 3 → score breakdown visible in the UI per FR-009

### Parallel Execution (single developer)

- Start Phase 1 tasks simultaneously (T001 SQL, T002 types)
- After T002: kick off T003, T004, T005 together
- After Phase 2: write T006, T007, T008 together; then T009; then implement T010 + T012 in parallel

---

## Notes

- [P] tasks touch different files with no blocking dependencies between them
- **Principle VI gate**: T006 and T007 must be written and verified FAILING before T010 and T011 are implemented
- `scoreWithAllies()` (T010) must be a pure function — zero I/O or Electron/Vue imports (Principle IV)
- Migration T001 is applied automatically by the migration runner on app startup — no manual SQL needed
- LolalyticsMatchupProvider (T012): synergy field names in the Qwik payload may use `n` instead of `games` — log the raw payload in dev mode and confirm at implementation time per research.md §2
- Pool-scoped synergy fetches only — at most 30 HTTP requests for a typical pool (not all ~170 champions)
- LCU changes (T015, T016) require the manual checklist (T020) before the PR is merged per constitution
