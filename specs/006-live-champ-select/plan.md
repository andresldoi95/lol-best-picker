# Implementation Plan: Live Champion Selection State Management

**Branch**: `006-live-champ-select` | **Date**: 2026-06-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-live-champ-select/spec.md`

## Summary

Implement real-time champion selection state management that dynamically filters the user's available champion pool based on picks/bans by allies and enemies during champion select, with automatic view navigation when the select phase begins and automatic clearing when it ends. The feature uses LCU polling to track game phase and player selections, the existing recommendation engine with dynamic pool filtering (maintaining Constitution I constraint), and IPC to communicate state changes to the Vue renderer with <500ms update latency.

## Technical Context

**Language/Version**: TypeScript 5.x (Node target for main, DOM target for renderer)

**Primary Dependencies**: 
- Electron (IPC + app lifecycle)
- Vue 3 (Composition API, renderer)
- Vuetify 3 (UI components)
- better-sqlite3 (SQLite storage)
- LCU API (via HTTP polling on 127.0.0.1)

**Storage**: SQLite via better-sqlite3 (app_settings table for champion select phase state, selected_recommendation tracking)

**Testing**: Vitest (unit tests for recommendation filtering, mocks for LCU and IPC)

**Target Platform**: Windows desktop (Electron)

**Project Type**: Electron desktop application (single-window, multi-process)

**Performance Goals**: 
- Champion select view navigation within 1 second of phase detection
- Recommendation re-computation within 100ms of LCU state change
- UI update (render) within 500ms of recommendation change

**Constraints**:
- No pool-outside-champion inclusion (Constitution I)
- Read-only LCU access, no game automation (Constitution II)
- All LCU polling in main process, renderer updates via IPC (Constitution V)
- Recommendation filtering logic in isolation module, testable without Electron (Constitution IV)

**Scale/Scope**: 
- Single user, local LCU connection only
- 10–200+ champion pool (typical ranked player)
- Polled LCU updates (~100ms intervals during select phase)

## Constitution Check

**Phase 0 Gate - Pre-Research Compliance**:

✅ **Constitution I (Pool Constraint)** — PASS
- Feature filters the user's existing pool, does not introduce new champions
- Filtering is applied *before* recommendation display

✅ **Constitution II (Riot/LCU Compliance)** — PASS
- Uses LCU read-only API for phase and pick/ban state
- No game automation or file/memory modification

✅ **Constitution IV (Business Logic Isolation)** — PASS
- Recommendation engine remains framework-agnostic
- New pool-filtering logic will live in `src/recommendation/` module, unit-tested in isolation

✅ **Constitution V (Real-Time Responsiveness)** — PASS
- LCU polling runs in main process
- Renderer receives updates via IPC
- <1s navigation, <100ms computation targets align with policy

✅ **Constitution III (Local-First)** — PASS
- App remains usable offline; empty state displays gracefully if LCU disconnects

**No violations identified. Proceed to Phase 0 Research.**

## Phase 0: Research & Clarifications

### Research Tasks

#### Task 0a: LCU Event Model & Polling Strategy

**Question**: Does the existing LCU adapter (if any) already emit champion-select phase events, or must we add polling?

**Current Knowledge**: 
- The project has existing LCU adapter code
- Current main app monitors game phase in some fashion
- Need to confirm: does it already detect champion select phase? What's the polling interval during select?

**Research Output** (in research.md):
- Document current LCU adapter event model
- Confirm game-phase event availability
- Define polling interval during select phase (100ms recommended for <500ms UI response)
- Identify existing hooks for phase transitions

**Deliverable**: Section in research.md on LCU event architecture

---

#### Task 0b: Renderer State Management & View Navigation

**Question**: What is the current view/navigation model in the Vue renderer? Does it use Vue Router, a tab/panel system, or direct component mounting?

**Current Knowledge**:
- Project has Pool, Champ Select, and Settings views
- Need to confirm the navigation mechanism to auto-switch to Champ Select view

**Research Output** (in research.md):
- Document current view/navigation architecture
- Identify how to programmatically switch to Champ Select view from main process
- Confirm IPC pattern already in use for navigation signals

**Deliverable**: Section in research.md on navigation architecture and available patterns

---

#### Task 0c: Database Schema for Champion Select State

**Question**: Where should champion-select phase state and selected recommendations be stored? Extend app_settings table, or a new champion_select_state table?

**Current Knowledge**:
- Project uses SQLite with existing app_settings usage
- Need to align with existing schema design patterns
- State is ephemeral (cleared on phase end), but good to track for quick app restart scenarios

**Research Output** (in research.md):
- Confirm current app_settings schema or identify appropriate table
- Decide: extend app_settings or create new table
- Document field structure (phase_active, selected_champion_id, phase_started_at, last_update_ts)

**Deliverable**: Section in research.md on database design

---

### Consolidated Findings

After research tasks complete, consolidate into `research.md`:

| Decision | Rationale | Alternatives Considered |
|----------|-----------|--------------------------|
| LCU polling interval: 100ms | Balances responsiveness (<500ms UI update) vs. CPU load | 50ms (too hot), 200ms (risks stale data) |
| Champion select state in app_settings | Minimal new schema, aligned with existing patterns | Separate table (over-engineered for ephemeral state) |
| IPC event for phase change: `game:championSelect:phase-change` | Consistent with existing IPC patterns | Single large update (batches changes, risks stale interim state) |
| Auto-navigate using existing router/view mechanism | Reuses current navigation model | New IPC handler (tight coupling) |

## Phase 1: Design & Contracts

### 1a. Data Model (`data-model.md`)

**Entities**:

- **GamePhase**: Enum → `{ IN_PROGRESS, CHAMPION_SELECT, WAITING_FOR_STATS, GAME_START, GAME_IN_PROGRESS, WAIT_FOR_STATS, ENDED }`
  - Only `CHAMPION_SELECT` activates the filtering and auto-nav

- **SelectedChampions**: Tracks picks/bans per player
  - Fields: `{ playerId: string; championId: number; pickType: ''PICK'' | ''BAN''; pickOrder: number; timestamp: number }`
  - Derived in real-time from LCU `/lol/champ-select/v1/session` → `myTeam` + `theirTeam`

- **RecommendedChampion**: Current recommendation state
  - Fields: `{ championId: number | null; reason: ''available'' | ''available_but_suboptimal'' | ''unavailable_all_countered'' | ''phase_ended''; validUntil?: number }`
  - Transient state, cleared when phase ends

- **AvailablePool**: Filtered user pool
  - Derived: `userPool - selectedChampions (allies + enemies)`
  - Computed on each LCU update, cached with timestamp for <100ms recomputation

### 1b. Contracts (IPC & LCU)

#### IPC Contract: Main → Renderer

```typescript
// game:championSelectState
type ChampionSelectStateMessage = {
  phase: ''CHAMPION_SELECT'' | ''NOT_ACTIVE'';
  selectedChampions: Array<{
    playerId: string;
    championId: number;
    pickType: ''PICK'' | ''BAN'';
    playerTeam: ''own'' | ''enemy'';
  }>;
  availablePool: number[]; // Champion IDs in user's filtered pool
  recommendation?: {
    championId: number;
    reason: string;
  };
  timestamp: number;
}
```

**Trigger**: On LCU state change (detected via polling), emit to renderer.

**Renderer Handler**: 
- Update local state with available pool and current recommendation
- If phase is 'CHAMPION_SELECT' and not currently on Champ Select view, navigate
- If phase is 'NOT_ACTIVE', clear recommendation and show empty state

#### LCU Contract: Query `/lol/champ-select/v1/session`

Sample response contains `myTeam`, `theirTeam`, `timer.phase`, and other metadata.

### 1c. Quickstart (`quickstart.md`)

**Minimal working example**: 
1. App detects LCU connection and begins polling `/lol/champ-select/v1/session`
2. When `timer.phase === ''CHAMPION_SELECT''`, extract `myTeam` and `theirTeam` picks/bans
3. Filter user's pool by removing picked/banned champion IDs
4. Pass filtered pool to recommendation engine (existing logic)
5. Send filtered recommendation + available pool via IPC to renderer
6. Renderer displays available champions and auto-navigates to Champ Select view
7. On timer phase exit or LCU disconnect, emit `phase: ''NOT_ACTIVE''` and renderer shows empty state

### 1d. Agent Context Update

Update `CLAUDE.md` (between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers).

---

## Project Structure

### Documentation (this feature)

```text
specs/006-live-champ-select/
├── spec.md              ✅ Specification (completed)
├── plan.md              ✅ This file
├── research.md          📝 Phase 0 output (research tasks)
├── data-model.md        📝 Phase 1 output (entity definitions)
├── quickstart.md        📝 Phase 1 output (minimal working example)
├── contracts/
│   ├── ipc-game-state.md
│   └── lcu-session-api.md
├── checklists/
│   └── requirements.md   ✅ Quality checklist
└── tasks.md             📝 Phase 2 output (actionable tasks, /speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── shared/                          # Types (existing)
├── recommendation/                  # Recommendation engine (Constitution IV)
│   ├── filter-available-pool.ts      📝 NEW: Pool filtering logic
│   └── [existing logic]
├── main/                            # Electron main process
│   ├── index.ts                     🔄 EXISTING: App lifecycle
│   ├── ipc/
│   │   └── handlers.ts              🔄 EXISTING: Add game state handler
│   └── game/
│       └── champion-select-monitor.ts  📝 NEW: LCU polling
└── renderer/
    └── views/
        └── ChampSelect.vue           🔄 EXISTING: Handle dynamic pool

tests/
├── unit/
│   └── recommendation/
│       └── filter-available-pool.test.ts     📝 NEW: Test filtering
```

**Structure Decision**: Single Electron project. New code in `src/main/game/champion-select-monitor.ts` and `src/recommendation/filter-available-pool.ts`.

## Complexity Tracking

No Constitution violations identified.

---

## Next Steps

1. **Phase 0**: Complete research tasks → generate `research.md`
2. **Phase 1**: Generate `data-model.md`, `contracts/`, `quickstart.md`, update CLAUDE.md
3. **Phase 2**: Generate tasks via `/speckit-tasks`

