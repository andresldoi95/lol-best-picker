# IPC Contract: Game State Updates (Main → Renderer)

**Channel**: `game:championSelectState`  
**Direction**: Main process → Renderer process  
**Pattern**: One-way event emission

## Message Format

```typescript
interface GameChampionSelectStateMessage {
  // Game phase indicator
  phase: 'CHAMPION_SELECT' | 'NOT_ACTIVE';
  
  // All selected champions (picks + bans) by team
  selectedChampions: Array<{
    playerId: string;
    championId: number;
    pickType: 'PICK' | 'BAN';
    pickOrder: number;
    playerTeam: 'own' | 'enemy';
  }>;
  
  // Filtered available champions from user's pool
  availablePool: number[];
  
  // Current recommendation (if in champion select)
  recommendation?: {
    championId: number;
    reason: 'available' | 'available_but_suboptimal' | 'unavailable_all_countered';
    winRateVsEnemies?: number;
  };
  
  // Metadata
  timestamp: number;           // Unix ms when this state snapshot was created
  phaseStartedAt?: number;     // Unix ms when CHAMPION_SELECT phase began
}
```

## Emit Triggers

| Trigger | Description |
|---------|-------------|
| **LCU connection detected** | Send initial state on connect |
| **Phase changes** | Emit when entering/exiting CHAMPION_SELECT |
| **Champion selected/banned** | Emit when myTeam or theirTeam changes |
| **Recommendation updates** | Emit when filtered recommendation changes |
| **Every 100ms during active phase** | Polling update (prevents stale renderer state) |
| **LCU disconnect** | Send `phase: 'NOT_ACTIVE'` to signal graceful shutdown |

## Renderer Handler Behavior

```typescript
// Pseudocode for renderer listening to this event

window.api.on('game:championSelectState', (message: GameChampionSelectStateMessage) => {
  // 1. Update local state with selections and available pool
  state.selectedChampions = message.selectedChampions;
  state.availablePool = message.availablePool;
  state.recommendation = message.recommendation;
  
  // 2. Auto-navigate if entering CHAMPION_SELECT phase
  if (message.phase === 'CHAMPION_SELECT' && currentView !== 'ChampSelect') {
    router.push('/champ-select');  // or equivalent navigation
  }
  
  // 3. Show empty state if phase ended
  if (message.phase === 'NOT_ACTIVE') {
    state.recommendation = null;
    state.selectedChampions = [];
    state.availablePool = [];
    showEmptyState("Champion select is not active");
  }
});
```

## Error Handling

- **Invalid championId**: Renderer ignores; main process validates before emit
- **Corrupted message**: Renderer logs error, retains previous state
- **Rapid updates**: Renderer batches updates via React/Vue batching (deduplicated within 16ms frame)

## Testing Contract

✅ **Unit tests** (main process):
- Message formatting with valid phase transitions
- Message encoding/decoding round-trip
- Edge case: empty selectedChampions array

✅ **Integration tests** (renderer):
- Listener receives messages
- State updates correctly on message
- Auto-navigation triggers at correct phase
- Empty state displays on phase exit

