# IPC Contract: Game Recording & Personal Counters API

**Date**: 2026-06-19  
**Project**: LoL Best Picker (Electron desktop app)  
**Scope**: Renderer ↔ Main process communication for game statistics

---

## Overview

The renderer process (Vue UI) communicates with the main process (Electron, SQLite, LCU) via the `contextBridge` preload API. This document defines the IPC contracts for game recording and personal counter analysis.

---

## Channel: `game:fetch-counters`

**Direction**: Renderer → Main (handle in main; return Promise)  
**Type**: Invoke (request-reply)

### Request

```typescript
interface FetchCountersRequest {
  role?: 'TOP' | 'JUNGLE' | 'MID' | 'BOTTOM' | 'SUPPORT' | undefined;
  // If undefined, include counters from all roles
  
  tier?: string;
  // If undefined, use player's current tier
  // Future: allow user to select historical tier
}
```

### Response

```typescript
interface PersonalCounter {
  opponent_champion: string;       // e.g., "Ahri"
  player_role: string;             // e.g., "MID" (or null for "all roles"?)
  player_tier: string;             // e.g., "EMERALD"
  games_played: number;            // e.g., 10
  wins: number;                    // e.g., 2
  win_rate: number;                // e.g., 20.0 (percentage)
  threat_score: number;            // e.g., 6.0 (calculated, higher = more threatening)
  confidence_tier: 'Potential' | 'Likely' | 'Confirmed';
  // Potential: 1–2 games
  // Likely: 3–9 games
  // Confirmed: 10+ games
  last_encountered: number;        // Unix timestamp (ms) of most recent game vs this opponent
}

interface FetchCountersResponse {
  counters: PersonalCounter[];     // Sorted by threat_score DESC, games_played DESC, champion name ASC
  tier_context: string;            // e.g., "Showing Emerald tier (+ 5 games from Diamond)"
  total_games_recorded: number;    // For empty-state context
  last_updated_at: number;         // Unix timestamp (ms) of last game record
}
```

### Error Cases

| Scenario | Response | HTTP Analog |
|----------|----------|-------------|
| No games recorded | `counters: []`, empty `tier_context` | 200 OK (empty result) |
| LCU tier fetch fails | Return last-known tier from AppSettings | Degraded; always has a fallback |
| Database error | Reject with error message | 500 Internal Server Error |
| Invalid role parameter | Reject with error message | 400 Bad Request |

### Implementation (Main Process)

```typescript
// src/main/ipc/handlers.ts
ipc.handle('game:fetch-counters', async (event, request: FetchCountersRequest) => {
  const currentTier = request.tier || appSettings.get('last_game_record_tier') || 'EMERALD';
  
  try {
    const gameRecords = gameRecordsRepo.getByTier(currentTier);
    const counters = counterAnalyzer.rankCounters(gameRecords, request.role);
    
    return {
      counters,
      tier_context: `Showing ${currentTier} tier`,
      total_games_recorded: gameRecords.length,
      last_updated_at: appSettings.get('last_game_record_fetch_at')
    };
  } catch (err) {
    throw new Error(`Failed to fetch counters: ${err.message}`);
  }
});
```

### Preload Export

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  game: {
    async fetchCounters(filter?: { role?: string; tier?: string }) {
      return ipcRenderer.invoke('game:fetch-counters', filter || {});
    }
  }
  // ... other API methods
});
```

### Renderer Usage

```typescript
// src/renderer/src/composables/usePersonalCounters.ts
import { ref } from 'vue';

export function usePersonalCounters() {
  const counters = ref<PersonalCounter[]>([]);
  const tierContext = ref('');
  
  const fetchCounters = async (filter?: { role?: string }) => {
    try {
      const response = await window.api.game.fetchCounters(filter);
      counters.value = response.counters;
      tierContext.value = response.tier_context;
    } catch (error) {
      console.error('Failed to fetch counters:', error);
      counters.value = [];
    }
  };
  
  return { counters, tierContext, fetchCounters };
}
```

---

## Channel: `game:record-outcome` (Event, Main → Renderer)

**Direction**: Main → Renderer (emit from main)  
**Type**: Send (fire-and-forget, no reply)

### Event Payload

```typescript
interface GameRecordedEvent {
  champion: string;               // e.g., "Akali"
  role: string;                   // e.g., "MID"
  result: 'win' | 'loss';
  timestamp: number;              // Unix ms
  tier: string;                   // e.g., "EMERALD"
  message: string;                // e.g., "Game recorded: Akali vs. Ahri (loss)"
}
```

### Purpose

Notifies the renderer that a new game has been recorded, so it can:
- Refresh the Personal Counters view if open
- Show a toast notification: "New game recorded!"
- Update freshness indicator

### Implementation

```typescript
// src/main/gameRecorder.ts
async function captureGameOutcome() {
  // ... capture logic ...
  
  const gameRecord = { /* ... */ };
  gameRecordsRepo.insert(gameRecord);
  
  // Notify renderer
  mainWindow.webContents.send('game:record-outcome', {
    champion: gameRecord.player_champion,
    role: gameRecord.player_role,
    result: gameRecord.result,
    timestamp: gameRecord.timestamp,
    tier: gameRecord.player_tier,
    message: `Game recorded: ${gameRecord.player_champion} ${gameRecord.result} (${gameRecord.player_role})`
  });
}
```

### Renderer Listener

```typescript
// src/main.ts (app initialization)
ipcRenderer.on('game:record-outcome', (event, payload: GameRecordedEvent) => {
  console.log(`[Game Recorded] ${payload.message}`);
  // Trigger refresh of counters view or show notification
  // Example: emit custom event for Vue components to listen to
  window.dispatchEvent(new CustomEvent('game-recorded', { detail: payload }));
});
```

---

## Backwards Compatibility

### Migration Path (if needed in future)

1. **Version 1.0**: Initial release with `game:fetch-counters` and `game:record-outcome`.
2. **Version 1.1+**: If schema changes, main process handles migration transparently; IPC interface remains unchanged.

### Versioning

No explicit versioning needed at IPC layer; the preload API version is tied to the app version. If breaking changes occur (unlikely), a new channel (e.g., `game:fetch-counters-v2`) can be introduced alongside the old one during transition.

---

## Security & Validation

### Main Process (Trusted)

- Validates `FetchCountersRequest.role` against known role set.
- Validates `FetchCountersRequest.tier` against known tier set (if provided).
- Sanitizes error messages before sending to renderer (no stack traces).

### Renderer (Untrusted by design)

- Cannot directly access database or LCU.
- Cannot invoke arbitrary main-process code.
- All data flows through IPC handlers; main process enforces validation.

---

## Testing

### IPC Handler Tests

```typescript
// src/main/__tests__/gameRecorder.ipc.test.ts
describe('game:fetch-counters IPC handler', () => {
  it('should return empty counters array when no games recorded', async () => {
    const response = await ipc.invoke('game:fetch-counters', {});
    expect(response.counters).toEqual([]);
  });
  
  it('should filter counters by role', async () => {
    // Insert game records with different roles
    // Invoke with role='MID'
    // Verify only MID counters returned
  });
  
  it('should reject invalid role', async () => {
    await expect(ipc.invoke('game:fetch-counters', { role: 'INVALID' }))
      .rejects.toThrow();
  });
});
```

### Renderer Integration Tests

```typescript
// src/renderer/src/__tests__/PersonalCounters.test.ts
describe('PersonalCounters component', () => {
  it('should display counters returned by IPC', async () => {
    // Mock window.api.game.fetchCounters
    // Render component
    // Verify counter list is displayed
  });
  
  it('should show empty state when no counters', async () => {
    // Mock window.api.game.fetchCounters to return []
    // Render component
    // Verify "No games recorded" message
  });
});
```

---

## Future Extensions

### Planned (v1.1+)

1. **`game:get-stats`** — Get raw game history (paginated)
   - Request: `{ offset: number; limit: number }`
   - Response: `{ games: GameRecord[]; total_count: number }`

2. **`game:delete-game`** — Remove a game record (manual correction)
   - Request: `{ gameId: number }`
   - Response: `{ success: boolean; message: string }`

3. **`game:export-stats`** — Export personal stats as JSON/CSV
   - Request: `{ format: 'json' | 'csv'; role?: string }`
   - Response: `{ data: string (JSON or CSV content) }`

### Out of Scope (v1)

- Syncing stats to cloud
- Multi-device counters
- Real-time counter feeds
