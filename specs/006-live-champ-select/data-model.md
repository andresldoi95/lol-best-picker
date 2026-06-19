# Data Model

**Feature**: Live Champion Selection State Management  
**Based on**: [spec.md](spec.md) and [research.md](research.md)

## Entities & Data Structures

### GamePhase (Enum)

Represents the current state of the League of Legends game lifecycle.

```typescript
enum GamePhase {
  WAITING_FOR_STATS = "WAITING_FOR_STATS",
  CHAMPION_SELECT = "CHAMPION_SELECT",
  GAME_START = "GAME_START",
  GAME_IN_PROGRESS = "GAME_IN_PROGRESS",
  WAIT_FOR_STATS = "WAIT_FOR_STATS",
  ENDED = "ENDED",
}
```

**Usage**: Only `CHAMPION_SELECT` phase activates pool filtering and auto-navigation.

---

### SelectedChampion (Entity)

Represents a champion pick or ban by any player (self, ally, or enemy).

```typescript
interface SelectedChampion {
  playerId: string;           // LCU player ID or summoner name
  championId: number;         // Champion ID (e.g., 25 for Mordekaiser)
  pickType: 'PICK' | 'BAN';   // Whether it's a pick or ban
  pickOrder: number;          // Order in pick sequence (0-based)
  playerTeam: 'own' | 'enemy'; // Which team the player is on
  timestamp: number;          // When the pick/ban occurred (ms since epoch)
}
```

**Source**: Derived from LCU endpoint `/lol/champ-select/v1/session`:
- `myTeam[]` → `playerTeam: 'own'`
- `theirTeam[]` → `playerTeam: 'enemy'`

**Validation Rules**:
- `championId` MUST be a valid League champion ID (1–175 range)
- `pickType` MUST be exactly 'PICK' or 'BAN'
- `timestamp` MUST be >= phase start time and <= current time

---

### AvailablePool (Derived)

The user's champion pool filtered to exclude champions that have been selected (picked or banned) by any player.

```typescript
interface AvailablePool {
  championIds: number[];          // User's pool champions minus selected champions
  totalPoolSize: number;          // Original pool size (for UI context)
  excludedChampions: number[];    // Champions removed from availability
  computedAt: number;             // Timestamp when this was computed
  staleAfter: number;             // Unix time when this data is considered stale (computedAt + cache TTL)
}
```

**Computation**:
```
AvailablePool = UserPool - (SelectedChampions[PICK] ∪ SelectedChampions[BAN])
```

**Caching**:
- TTL: 100ms (lightweight caching to avoid recomputation on every render frame)
- Invalidated on any new LCU session update

**Performance Goal**: <100ms recomputation time for pools with up to 200 champions.

---

### RecommendedChampion (Entity)

The current best recommendation from the recommendation engine, scoped to the available pool.

```typescript
interface RecommendedChampion {
  championId: number | null;           // Champion ID, or null if no viable option
  reason: 'available' 
         | 'available_but_suboptimal' 
         | 'unavailable_all_countered' 
         | 'phase_ended';              // Why this champion is recommended or unavailable
  winRateVsEnemies?: number;           // Win rate % against current enemy comp
  matchupDetails?: Array<{
    enemyChampionId: number;
    winRate: number;
  }>;
  validUntil: number;                  // Unix timestamp when this recommendation expires (computed at + 5s)
  computedAt: number;                  // When this recommendation was generated
}
```

**State Transitions**:
- `phase_ended` → clear recommendation and show empty state
- `unavailable_all_countered` → all pool champions countered (display least-bad option with warning)
- `available` → normal recommendation
- `available_but_suboptimal` → recommendation is available but sub-optimal (show alternative)

---

### ChampionSelectState (App State)

Consolidated state for champion select, stored transiently in-memory and partially in SQLite (`app_settings`).

```typescript
interface ChampionSelectState {
  // Current phase
  phase: GamePhase;
  
  // Tracked selections
  selectedChampions: SelectedChampion[];
  availablePool: AvailablePool;
  
  // Current recommendation
  recommendation?: RecommendedChampion;
  
  // Timing
  phaseStartedAt: number;        // Unix ms when CHAMPION_SELECT phase began
  lastUpdatedAt: number;         // Last time this state was refreshed from LCU
  
  // UI state
  emptyStateMessage?: string;    // Message to display when phase_ended
}
```

**Persistence** (in `app_settings` table):
- `champ_select_phase_active`: "true" | "false"
- `champ_select_last_update`: numeric timestamp
- `champ_select_available_pool`: JSON-stringified array of champion IDs

**In-Memory** (renderer Composition API state):
- Full `ChampionSelectState` object for fast access during renders

---

## State Transitions & Validation Rules

### Pool Filtering Rules

1. **Union Filtering**: Remove all champions present in either `picks` or `bans` from the user's pool
2. **Constraint Enforcement**: Never expand available pool beyond the original user pool (Constitution I)
3. **Empty Pool Handling**: If filtering results in zero available champions, display "All your champions are unavailable" message

### Recommendation Computation Rules

1. **Pool Isolation**: Recommendation engine MUST NOT suggest champions outside the available pool
2. **Tie-Breaking**: If multiple available champions have identical win rates, maintain alphabetical order
3. **Stale Handling**: If cached recommendation is >5s old and new LCU state available, recompute

### Phase Transition Rules

- **Enter CHAMPION_SELECT**: Start 100ms polling, enable filtering, auto-navigate to Champ Select view
- **Exit CHAMPION_SELECT**: Stop polling, clear recommendation, set `reason: 'phase_ended'`, display empty state
- **LCU Disconnect**: Treat as phase exit, show graceful "Disconnected from League Client" message

---

## Entity Relationships

```
GamePhase (enum)
    ↓
ChampionSelectState (current state in renderer)
    ├── phase: GamePhase
    ├── selectedChampions: SelectedChampion[]  ←→ LCU /lol/champ-select/v1/session
    ├── availablePool: AvailablePool (derived from UserPool - selectedChampions)
    └── recommendation: RecommendedChampion (computed via recommendation engine)

app_settings table (SQLite)
    ├── champ_select_phase_active: boolean
    ├── champ_select_last_update: timestamp
    └── champ_select_available_pool: JSON array
```

---

## Testing Scenarios (Fixture Data)

### Scenario 1: Normal Pick Flow
- User pool: [Mordekaiser, Sion, Ornn]
- Enemy picks: [Fiora, Darius]
- Ally picks: [Mordekaiser]
- Expected available pool: [Sion, Ornn]
- Expected recommendation: Best win rate of [Sion, Ornn] vs enemy

### Scenario 2: All Champions Countered
- User pool: [Mordekaiser]
- Enemy picks: [Vayne] (hard counter to Mordekaiser)
- Expected available pool: [Mordekaiser]
- Expected recommendation: { championId: 25, reason: "unavailable_all_countered" }

### Scenario 3: Empty Pool After Filtering
- User pool: [Mordekaiser, Sion, Ornn]
- Enemy picks: [Darius]
- Ally picks: [Mordekaiser, Sion, Ornn]
- Expected available pool: []
- Expected message: "All your champions are unavailable"

---

## Performance Targets

- **Pool computation**: <100ms for 200-champion pool
- **Recommendation recomputation**: <100ms
- **IPC message transmission**: <50ms (negligible for local IPC)
- **Renderer update (paint)**: <500ms from recommendation change

