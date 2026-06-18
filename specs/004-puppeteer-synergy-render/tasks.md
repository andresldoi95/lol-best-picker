---

description: "Task list for Live Synergy Data via Browser Rendering (spec 004)"
---

# Tasks: Live Synergy Data via Browser Rendering

**Input**: Design documents from `specs/004-puppeteer-synergy-render/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: `parseSynergyDom()` unit tests are required (Constitution VI / SC-005) and must be
written *before* the function body is implemented.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in every task description

## Path Conventions

Single project — `src/`, `tests/` at repository root.

---

## Phase 1: Setup (Verification)

**Purpose**: Confirm the baseline builds and all existing tests pass before any changes.

- [X] T001 Verify baseline: run `npm rebuild better-sqlite3 && npm test && npm run typecheck` and confirm all pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration and shared type extensions that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Create `src/main/db/migrations/004_add_synergy_source.sql` with three additive `ALTER TABLE ADD COLUMN` statements: `source TEXT NOT NULL DEFAULT 'static'` on `champion_synergy`; `last_synergy_fetch_at TEXT` and `last_synergy_fetch_status TEXT` on `app_settings`
- [X] T003 [P] Add `SynergyFetchStatus = 'rendered' | 'error'` and `SynergySource = 'rendered' | 'fallback'` union types; extend `AppSettings` with `lastSynergyFetchAt: string | null` and `lastSynergyFetchStatus: SynergyFetchStatus | null`; add `synergySource: SynergySource` to `Recommendation` in `src/shared/types.ts`
- [X] T004 [P] Add optional `source?: 'rendered' | 'static'` field to the `NormalizedSynergyRow` interface in `src/main/stats/synergyProvider.ts`

**Checkpoint**: Foundation ready — schema and types defined; user story phases can now begin.

---

## Phase 3: User Story 1 — See Recommendations With Accurate Ally Synergy Scores (Priority: P1) 🎯 MVP

**Goal**: Replace the always-empty ally synergy signal with live champion-pair win rates extracted
from the lolalytics build page rendered in a hidden Electron BrowserWindow.

**Independent Test**: Enter champion select with at least one ally locked in; confirm the
recommended champion's displayed synergy score differs from its overall win rate (SC-001).

### Implementation for User Story 1

- [X] T005 [US1] Inspect live lolalytics rendered DOM: create a minimal stub `src/main/stats/lolalyticsPageRendererProvider.ts` with a hidden BrowserWindow (session `persist:synergy-render`) that navigates to a lolalytics build page and dumps `document.documentElement.outerHTML` to a local file per `quickstart.md §2`; document the synergy table CSS selectors found — *DOM-capture hook implemented (`SYNERGY_DUMP_DIR` env in `maybeDumpHtml`); selectors modeled on research.md §4 and require live validation via the Manual Test Checklist (no live network capture possible in this env)*
- [X] T006 [US1] Write 5 unit test cases in `tests/unit/stats/lolalyticsPageRendererProvider.test.ts` using fixture HTML captured in T005 (SC-005): valid rows → `NormalizedSynergyRow[]`; missing synergy table → `[]`; unknown champion slug → row skipped; below `minGames` → row skipped; page champion itself → excluded from allies — **confirmed all 5 FAIL before T007**
- [X] T007 [US1] Implement the `parseSynergyDom(html, slugToKey, championKey, role, patch, minGames): NormalizedSynergyRow[]` pure exported function in `src/main/stats/lolalyticsPageRendererProvider.ts`; all 5 T006 test cases pass; each returned row carries `source: 'rendered'`
- [X] T008 [US1] Implement the `LolalyticsPageRendererProvider` class in `src/main/stats/lolalyticsPageRendererProvider.ts`: constructor accepting `LolalyticsPageRendererOptions` (extends matchup options with `slugToKey`, `renderTimeoutMs = 5000`, `pollIntervalMs = 250`); `fetchBuildStats(targets)` creates one hidden BrowserWindow with `persist:synergy-render` session, renders each target sequentially (navigate → poll 250 ms → timeout at 5 s → log + skip), destroys the window, delegates matchups to the wrapped `LolalyticsMatchupProvider`, returns merged `BuildStats`
- [X] T009 [P] [US1] Update `SynergyRepository.upsertSynergy()` in `src/main/db/repositories/synergyRepository.ts` to bind and persist the `source` column (`@source`, defaulting to `'static'` when absent)
- [X] T010 [US1] Build `slugToKey` map from `champions.list()` (`champion.key.toLowerCase() → champion.key`) and replace `new LolalyticsMatchupProvider(...)` with `new LolalyticsPageRendererProvider({ idToKey, keyToId, slugToKey })` in `src/main/index.ts`

**Checkpoint**: User Story 1 is independently testable — a synergy refresh produces rows with
`source = 'rendered'` in SQLite and ally scores in recommendations differ from overall WR.

---

## Phase 4: User Story 2 — App Remains Fully Functional When Live Data Cannot Be Fetched (Priority: P2)

**Goal**: Track refresh outcomes in `app_settings` so the app always falls back gracefully and
never crashes or hides the recommendation panel when the stats site is unreachable.

**Independent Test**: Block network during a scheduled refresh; confirm recommendations still
appear and `last_synergy_fetch_status = 'error'` is written to `app_settings` (SC-003).

### Implementation for User Story 2

- [X] T011 [US2] Add `markSynergyFetchRendered(): void` and `markSynergyFetchError(): void` methods to `SynergyRepository` in `src/main/db/repositories/synergyRepository.ts`; each method issues `UPDATE app_settings SET last_synergy_fetch_at = @now, last_synergy_fetch_status = '<status>' WHERE id = 1` (parallel to `StatsRepository.markFetchError()`)
- [X] T012 [US2] Update `refreshBuildStats()` in `src/main/stats/index.ts`: call `deps.synergy?.markSynergyFetchRendered()` immediately after a successful `upsertSynergy()` call; call `deps.synergy?.markSynergyFetchError()` in the catch block

**Checkpoint**: User Stories 1 AND 2 are independently functional — failures are tracked in
settings; fallback to cached/overall-WR data is confirmed with no crash.

---

## Phase 5: User Story 3 — Data Freshness Indicator Distinguishes Live From Cached Synergy (Priority: P3)

**Goal**: Propagate `synergySource` through the recommendation pipeline and show a live/estimated
chip in `ChampSelectView` so players know how to weight the synergy signal.

**Independent Test**: After a successful render, the chip reads "Synergy: live" (green); after
blocking the network and triggering a fallback, the chip reads "Synergy: estimated" (grey) (SC-004).

### Implementation for User Story 3

- [X] T013 [US3] Update `SettingsRepository.get()` in `src/main/db/repositories/settingsRepository.ts` to read `last_synergy_fetch_at` and `last_synergy_fetch_status` from `app_settings` and return them as `lastSynergyFetchAt` and `lastSynergyFetchStatus` on the `AppSettings` object
- [X] T014 [US3] Update `src/main/recommendationService.ts` to derive `synergySource: SynergySource` from `AppSettings.lastSynergyFetchStatus` (`'rendered'` when status is `'rendered'`, `'fallback'` otherwise including `null`) and include it in every `Recommendation` returned (threaded through the pure engine's `RecommendationInput`, default `'fallback'`)
- [X] T015 [P] [US3] Add "Synergy: live / estimated" inline chip to `src/renderer/src/pages/ChampSelectView.vue`: show `mdi-check-circle` (green) + "Synergy: live" when `recommendation.synergySource === 'rendered'`; show `mdi-information-outline` (grey) + "Synergy: estimated" otherwise

**Checkpoint**: All three user stories are independently functional — freshness chip reflects the
correct live vs. estimated state in both the success and fallback scenarios.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Architecture documentation and final end-to-end validation.

- [X] T016 Update the Architecture section of `CLAUDE.md` with the BrowserWindow-over-Puppeteer rationale: Electron already bundles Chromium; `persist:synergy-render` session partition avoids CSP hook interference; no new npm dependencies (FR-013)
- [X] T017 [P] Run full verification: `npm rebuild better-sqlite3 && npm test && npm run typecheck` — **all pass (80 tests, typecheck clean, production build clean)**; the manual checklist from `quickstart.md §Manual Test Checklist` requires a live League client + lolalytics network + GUI and remains for the developer to run (it also validates the live synergy-table selectors per T005)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Phase 2 only — no dependency on US2 or US3
- **US2 (Phase 4)**: Depends on Phase 2; integrates with `SynergyRepository` extended in US1 (T009)
- **US3 (Phase 5)**: Depends on Phase 2 and US2 (reads `lastSynergyFetchStatus` written by T011/T012)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational — no dependency on US2 or US3
- **User Story 2 (P2)**: Starts after Foundational — extends `SynergyRepository` first touched in T009 (US1)
- **User Story 3 (P3)**: Starts after US2 — `SettingsRepository.get()` must return fields that T011 writes

### Within User Story 1

- T005 (DOM inspection) → T006 (write tests, confirm fail) → T007 (implement, tests pass) → T008 (implement class)
- T009 (`synergyRepository.ts`) can run in parallel with T008 (`lolalyticsPageRendererProvider.ts`) — different files
- T010 (wiring in `main/index.ts`) depends on T008 and T009 both complete

### Parallel Opportunities

- T003 and T004 (Phase 2) can run in parallel — different files
- T008 and T009 (within US1) can run in parallel — different files
- T015 (`ChampSelectView.vue`) can run in parallel with T013/T014 once `SynergySource` type is defined (T003)
- T016 and T017 (Polish) can run in parallel

---

## Parallel Example: User Story 1

```
# After T007 completes, launch T008 and T009 concurrently:
T008: Implement LolalyticsPageRendererProvider class in src/main/stats/lolalyticsPageRendererProvider.ts
T009: Update SynergyRepository.upsertSynergy() in src/main/db/repositories/synergyRepository.ts

# T010 waits for both, then wires everything together:
T010: Build slugToKey map and replace provider in src/main/index.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Verify baseline
2. Complete Phase 2: Foundational — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Confirm ally scores differ from overall WR (SC-001) in a live champion select session
5. Demo / smoke test before continuing

### Incremental Delivery

1. Setup + Foundational → types and schema ready
2. User Story 1 → live synergy pair data in recommendations (MVP)
3. User Story 2 → failure tracking + graceful degradation verified
4. User Story 3 → freshness chip visible in UI
5. Polish → architecture doc + full verification

---

## Notes

- **ABI reminder**: run `npm run electron:rebuild` before `npm run dev`; run `npm rebuild better-sqlite3` before `npm test`
- T005 must precede T006 — fixture HTML from the live rendered DOM is the basis for all 5 unit test cases
- T006 tests **must fail** before T007 is implemented (Constitution VI / SC-005, test-first for recommendation logic)
- T008 must use `session.fromPartition('persist:synergy-render')` — this is the CSP isolation fix (research.md §3)
- `markSynergyFetch*` methods update `app_settings`, not `champion_synergy`; they parallel `StatsRepository.markFetchError()` in `statsRepository.ts`
- [P] tag means different files and no dependency on an incomplete sibling task in the same phase — safe to run concurrently
- The `a1.lolalytics.com` endpoint is deliberately never called directly; rendering lets the page's own JS call it (Constitution II)
