# Research & Technical Investigation

**Feature**: Live Champion Selection State Management  
**Conducted**: 2026-06-18  
**Plan**: [plan.md](plan.md)

## Research Task 0a: LCU Event Model & Polling Strategy

### Findings

**Current LCU Adapter Status**:
- The project has `src/main/` modules that handle LCU communication
- Existing implementation uses HTTP polling to connect to the local LCU on `127.0.0.1:port`
- The LCU port and auth token are read from the League Client's lockfile
- Current polling handles basic game state (ready check, etc.) with polling intervals managed by the adapter

**Game Phase Detection**:
- The LCU endpoint `/lol/champ-select/v1/session` is available during champion select and returns full session state including:
  - `timer.phase`: Current phase ("CHAMPION_SELECT", "GAME_START", etc.)
  - `myTeam[]`: Array of team members with `championId`, `cellId`, `pickType`
  - `theirTeam[]`: Array of enemy team with same structure
- The session endpoint returns 404 when not in champion select (expected behavior)

**Polling Strategy**:
- **Interval**: 100ms during active champion select (after phase detection)
- **Rationale**: Balances <500ms UI responsiveness target with reasonable CPU utilization
- **Fallback**: On LCU disconnect, gracefully degrade to empty state without crashing

**Decision**: Extend existing LCU adapter polling to include champion select phase detection and session tracking, rather than adding separate polling logic.

---

## Research Task 0b: Renderer State Management & View Navigation

### Findings

**Current Navigation Architecture**:
- The renderer uses Vue 3 Composition API with multiple views (Pool, Champ Select, Settings)
- Navigation is likely implemented via component state management or a simple view-switching mechanism
- The Champ Select view component already exists and handles recommendation display

**View Navigation from Main Process**:
- IPC is already established between main and renderer via `window.api` (contextBridge)
- Pattern: Main process sends events/state changes, renderer listens and updates
- Recommendation: Add new IPC channel `game:championSelectPhase` to signal view navigation and state updates

**State Management**:
- Current recommendation state is rendered in the Champ Select view
- Need to extend this to track:
  - Current available champions (filtered pool)
  - Phase active/inactive status
  - Empty state messaging

**Decision**: Use existing IPC pattern with new `game:championSelectPhase` channel. Renderer listens for phase changes and auto-navigates to Champ Select view when phase begins.

---

## Research Task 0c: Database Schema for Champion Select State

### Findings

**Current App Settings**:
- The project uses SQLite with an `app_settings` table for configuration values
- This table already stores various app-level settings with key-value structure

**Champion Select State Requirements**:
- Phase status (active/inactive)
- Last known selected champions (for restore on restart)
- Phase start/end timestamps
- Empty state message preference

**Storage Decision**:
- **Extend `app_settings` table** with these keys:
  - `champ_select_phase_active` (boolean)
  - `champ_select_last_update` (timestamp)
  - `champ_select_available_pool` (JSON array of champion IDs)
  
- **Alternative Rejected**: New table would add unnecessary schema complexity for ephemeral state

**No Migration Needed**: Using app_settings key-value pattern avoids schema versioning during initial rollout.

---

## Consolidated Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|--------------------------|
| **Polling interval**: 100ms | <500ms UI response target achievable; CPU-efficient | 50ms (excessive), 200ms (risks missing picks) |
| **Storage**: `app_settings` table | Minimal schema, aligned with project patterns | New table (over-engineered for transient state) |
| **IPC channel**: `game:championSelectPhase` | Clear naming, single event for phase changes | Multiple channels (increases complexity) |
| **Navigation**: Extend existing renderer state | Reuses current patterns, minimal coupling | Main process handles view (tight coupling) |
| **Pool filtering location**: `src/recommendation/` module | Isolated, unit-testable per Constitution IV | Main process (couples logic to IPC) |

---

## Dependencies & Constraints

✅ **No new dependencies required** — all tools already available (Electron IPC, SQLite, LCU API, Vue state)

✅ **Constitution I**: Pool filtering maintains constraint — no new champions introduced

✅ **Constitution II**: LCU access is read-only, no game automation

✅ **Constitution IV**: Business logic (filtering) isolated in `src/recommendation/` module

✅ **Constitution V**: Real-time responsiveness targets align with <1s navigation, <500ms UI updates

---

## Next Steps

→ Phase 1: Generate data-model.md, contracts/, quickstart.md, update CLAUDE.md
