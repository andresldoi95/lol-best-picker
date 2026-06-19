# LCU Contract: Champion Select Session API

**Endpoint**: `GET /lol/champ-select/v1/session`  
**Availability**: Only returns data when player is in champion select phase  
**Response on Not Available**: HTTP 404

## Request

```http
GET http://127.0.0.1:[PORT]/lol/champ-select/v1/session
Authorization: Bearer [TOKEN_FROM_LOCKFILE]
Content-Type: application/json
```

**Port & Auth**: Obtained from League Client lockfile (`C:\Riot Games\League of Legends\lockfile`):
```
LeagueClientUx.[PID].[PORT].[TOKEN].[PROTOCOL]
```

## Response (200 OK)

```typescript
interface ChampSelectSessionResponse {
  gameId: number;
  
  // Our team
  myTeam: Array<{
    cellId: number;                // Position (0–4)
    championId: number;             // Selected champion ID (0 if not yet selected)
    summonerInternalName: string;   // Player identifier
    nameVisibilityLevel: string;    // "ANONYMIZED" or similar
    isPlaceholder: boolean;         // true if slot not yet filled
    summonerId?: number;
    isActingPlayer?: boolean;       // true if this is the current player
  }>;
  
  // Enemy team
  theirTeam: Array<{
    // Same structure as myTeam
  }>;
  
  // Game timer
  timer: {
    phase: 'CHAMPION_SELECT' | 'GAME_START' | 'FINALIZATION'; // Relevant to us: 'CHAMPION_SELECT'
    adjustedTimeLeftInPhase: number; // Milliseconds remaining in current phase
    totalTimeInPhase: number;         // Total duration of this phase (ms)
    internalNowInEpochMs: number;    // Server-side current timestamp
    isInfinite: boolean;             // Usually false for CHAMPION_SELECT
  };
  
  // Configuration
  allowBattleBoost: boolean;
  allowDuplicatePicks: boolean;
  allowRerolls: boolean;
  hasSimultaneousBans: boolean;
  isCustomGame: boolean;
  allowSkinSelection: boolean;
  
  // Other metadata (not critical for this feature)
  bans?: { myTeamBans: number[]; theirTeamBans: number[] };
  pickableChampionIds?: number[];
  allowableBans?: number[];
}
```

## Usage in Feature

### Extract Picks

```typescript
const myPicks = myTeam
  .filter(p => p.championId > 0)
  .map(p => ({ playerId: p.summonerInternalName, championId: p.championId, pickType: 'PICK', playerTeam: 'own' }));

const enemyPicks = theirTeam
  .filter(p => p.championId > 0)
  .map(p => ({ playerId: p.summonerInternalName, championId: p.championId, pickType: 'PICK', playerTeam: 'enemy' }));

const allPicks = [...myPicks, ...enemyPicks];
```

### Detect Phase

```typescript
if (response.timer.phase === 'CHAMPION_SELECT') {
  // Active champion select - filter pool and show recommendations
} else {
  // Phase ended - clear state and show empty state
}
```

### Monitor Timer

```typescript
// Time left in champion select (useful for UI warning: "Hurry, X seconds left")
const secondsLeft = Math.floor(response.timer.adjustedTimeLeftInPhase / 1000);
```

## Error Handling

| Status | Meaning | Renderer Behavior |
|--------|---------|-------------------|
| **200** | Active champion select | Process normally |
| **404** | Not in champion select | Treat as phase end, show empty state |
| **401** | Auth token invalid | Log warning, retry with fresh token from lockfile |
| **Connection timeout** | LCU unavailable | Show "Disconnected from League Client" |

## Polling Strategy

- **Interval**: 100ms during CHAMPION_SELECT phase
- **Backoff**: Exponential backoff on 401 (reread lockfile)
- **Circuit breaker**: Stop polling if 10 consecutive failures (likely client closed)

## Testing Contract

✅ **Unit tests** (mock LCU responses):
- Valid CHAMPION_SELECT response → pool filters correctly
- 404 response → phase_ended state
- Missing champions in response → graceful degradation

✅ **Integration tests** (vs real LCU):
- Connection to real League Client
- Parse response correctly
- Handle phase transitions

