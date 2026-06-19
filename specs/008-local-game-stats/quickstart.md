# Quickstart: Local Game Statistics & Personal Counters

**Date**: 2026-06-19

---

## User Perspective

### Use Case: "What champions counter me most?"

1. **Play ranked games**: User plays several games of League (MID lane, multiple opponents).
2. **Game recorded**: When each game ends, the app (if running) captures the match outcome via LCU:
   - Champions played (player + allies + enemies)
   - Role, win/loss
   - Current ranked tier
3. **View counters**: User opens the app, navigates to **Personal Counters** view.
4. **See threats**: The view displays:
   - Role filter (e.g., "Showing MID counters")
   - List of enemy champions ranked by threat score
   - Confidence tier label (e.g., "Confirmed threat" = 10+ games, "Likely" = 3–9, "Potential" = 1–2)
   - Win rate % and games count
5. **Make decisions**: User reviews which champions they lose to most frequently and may:
   - Avoid locking in their main champion into a known counter
   - Prioritize banning the top threat
   - Practice specific matchups

### Example Flow

```
[Play 15 MID games] → 
  Game 1: Ahri enemy, LOSS (0-5)
  Game 2: Syndra enemy, WIN (8-2)
  ...
  Game 15: Ahri enemy, LOSS (2-7)
  
[Open Personal Counters view, filter = MID, tier = EMERALD]

Counter Ranking:
  1. Ahri      20% win rate (10 games)     "Confirmed threat"
  2. LeBlanc   25% win rate (4 games)      "Likely threat"
  3. Zed       0% win rate (1 game)        "Potential threat"
```

---

## Developer Perspective

### Integration Points

#### 1. Game Recording (Main Process)

**Module**: `src/main/gameRecorder.ts`

Periodically polls LCU for new games:

```typescript
// Pseudo-code
async function captureGameOutcome() {
  const matches = await lcu.get('/lol-match-history/v1/products/lol/current-summoner/matches');
  const lastRecorded = appSettings.get('last_game_record_fetch_at');
  
  for (const match of matches.games) {
    if (match.gameCreationDate > lastRecorded) {
      const details = await lcu.get(`/lol-match-history/v1/games/${match.gameId}`);
      const gameRecord = parseGameOutcome(details); // Extract allies, enemies, result, tier
      gameRecordsRepo.insert(gameRecord);
      appSettings.set('last_game_record_fetch_at', now());
    }
  }
}

// Trigger: on app start, periodically during play session (e.g., every 5 minutes)
// Non-blocking: runs in main process, sends IPC event to renderer on completion
```

**Database**: `gameRecordsRepository.insert(gameRecord)` → `INSERT INTO game_records (...)`

#### 2. Counter Analysis (Pure Engine)

**Module**: `src/recommendation/counterAnalyzer.ts`

Pure functions for threat scoring:

```typescript
// Pseudo-code
interface CounterStats {
  opponentChampion: string;
  role: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  threatScore: number;
  confidenceTier: 'Potential' | 'Likely' | 'Confirmed';
  lastEncountered: number;
}

function calculateThreatScore(winRate: number, gamesPlayed: number): number {
  const frequencyWeight = Math.min(1.0, gamesPlayed / 5);
  return (50 - winRate) * frequencyWeight;
}

function rankCounters(gameRecords: GameRecord[], role: string): CounterStats[] {
  // Filter by role
  // Group by opponent champion
  // Aggregate wins/losses
  // Calculate threat score and confidence tier
  // Sort by threat score descending
  // Return top 20
}
```

**Tests**: `src/recommendation/counterAnalyzer.test.ts`

```typescript
// Pseudo-code
describe('counterAnalyzer', () => {
  it('should rank by threat score, not raw win rate', () => {
    // 20% WR in 10 games: threat = (50-20)*1.0 = 30
    // 40% WR in 1 game: threat = (50-40)*0.2 = 2
    // First should rank higher
  });
  
  it('should return empty array for empty game records', () => {
    // Edge case: no games played
  });
  
  it('should apply role filter correctly', () => {
    // Only MID games contribute to MID counter ranking
  });
  
  it('should assign confidence tiers correctly', () => {
    // 1-2 games → "Potential"
    // 3-9 games → "Likely"
    // 10+ games → "Confirmed"
  });
});
```

#### 3. API / IPC Contract

**Preload bridge**: Add new IPC channel `game:fetch-counters`

```typescript
// In src/preload/index.ts or src/shared/ipcChannels.ts
window.api.game.fetchCounters(filter: { role?: string; tier?: string }) 
  → Promise<PersonalCounter[]>

// IPC Handler in src/main/ipc/handlers.ts
ipc.handle('game:fetch-counters', async (event, filter) => {
  const gameRecords = gameRecordsRepo.getFiltered(filter);
  const tier = appSettings.get('last_game_record_tier');
  const counters = counterAnalyzer.rankCounters(gameRecords, filter.role);
  return counters;
});
```

#### 4. UI / View

**Component**: `src/renderer/src/views/PersonalCounters.vue`

```vue
<template>
  <div class="personal-counters">
    <!-- Role Filter -->
    <v-btn-toggle v-model="selectedRole" exclusive>
      <v-btn value="">All Roles</v-btn>
      <v-btn value="TOP">TOP</v-btn>
      <v-btn value="JUNGLE">JUNGLE</v-btn>
      <v-btn value="MID">MID</v-btn>
      <v-btn value="BOTTOM">BOTTOM</v-btn>
      <v-btn value="SUPPORT">SUPPORT</v-btn>
    </v-btn-toggle>

    <!-- Tier Context Badge -->
    <v-chip v-if="tierContext">
      {{ tierContext }}
    </v-chip>

    <!-- Counter List -->
    <v-list v-if="counters.length > 0">
      <v-list-item v-for="counter in counters" :key="counter.opponentChampion">
        <span>{{ counter.opponentChampion }}</span>
        <span>{{ counter.winRate }}% win rate ({{ counter.gamesPlayed }} games)</span>
        <v-chip :color="confidenceColor(counter.confidenceTier)">
          {{ counter.confidenceTier }}
        </v-chip>
      </v-list-item>
    </v-list>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <p>No games recorded yet. Play games to see your personal counter analysis.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePersonalCounters } from '../composables/usePersonalCounters';

const { counters, fetchCounters, tierContext } = usePersonalCounters();
const selectedRole = ref('');

const computedCounters = computed(() => {
  return counters.value.filter(c => !selectedRole.value || c.role === selectedRole.value);
});

onMounted(async () => {
  await fetchCounters({ role: selectedRole.value });
});

const confidenceColor = (tier: string) => {
  return tier === 'Confirmed' ? 'error' : tier === 'Likely' ? 'warning' : 'info';
};
</script>
```

**Composable**: `src/renderer/src/composables/usePersonalCounters.ts`

```typescript
export function usePersonalCounters() {
  const counters = ref<PersonalCounter[]>([]);
  const tierContext = ref<string>('');

  async function fetchCounters(filter: { role?: string }) {
    counters.value = await window.api.game.fetchCounters(filter);
    tierContext.value = `Showing counters from Emerald tier (+ 5 games from Diamond)`;
  }

  return { counters: computed(() => counters.value), fetchCounters, tierContext };
}
```

#### 5. Routing

**Router**: `src/renderer/src/router/index.ts`

Add route:

```typescript
{
  path: '/counters',
  component: () => import('../views/PersonalCounters.vue'),
  meta: { label: 'Personal Counters' }
}
```

---

## Development Workflow

### Step 1: Database Migration
1. Create `src/main/db/migrations/006_add_game_records.sql` with table definitions.
2. Integrate into `src/main/db/migrations/index.ts` migration runner.
3. Test migration on fresh DB and on upgraded DB.

### Step 2: Repository & Service
1. Create `src/main/db/repositories/gameRecordsRepository.ts` with CRUD + query methods.
2. Create `src/main/gameRecorder.ts` service to capture outcomes from LCU.
3. Create `src/main/gameAnalyticsService.ts` to compute counters (or embed in gameRecorder).

### Step 3: Pure Engine & Tests
1. Create `src/recommendation/counterAnalyzer.ts` with `rankCounters()` and helper functions.
2. Write unit tests in `src/recommendation/counterAnalyzer.test.ts` covering:
   - Empty game records
   - Tied threat scores
   - Role filtering
   - Confidence tier assignment
3. Ensure tests pass (`npm test`).

### Step 4: IPC & Main Process Integration
1. Add IPC channel and handler in `src/main/ipc/handlers.ts`.
2. Add channel constant in `src/shared/ipcChannels.ts`.
3. Export from `src/preload/index.ts`.

### Step 5: UI & Router
1. Create `PersonalCounters.vue` view.
2. Create `usePersonalCounters.ts` composable.
3. Add `/counters` route to router.

### Step 6: Integration Test
1. Play a test game against LCU (or mock LCU responses).
2. Verify game record appears in database.
3. Verify Personal Counters view displays the counter.
4. Filter by role; verify filtering works.

---

## Testing Strategy

### Unit Tests (Vitest)

- **counterAnalyzer.test.ts**: Threat scoring logic, edge cases, role filtering.
  - Use fixture data: sample GameRecords, expected output counters.

### Integration Tests (Vitest)

- **gameRecordsRepository.test.ts**: Database inserts, queries, indexing.
  - Use in-memory SQLite `:memory:` database.
  - Verify indices are created.
  - Test edge cases: duplicate timestamp, invalid role, NULL champions.

### Manual Tests (QA)

- Launch the app against a running League Client.
- Play a ranked game (or use replay mode if available).
- Verify game is recorded in database (inspect SQLite db).
- Verify Personal Counters view shows the opponent champion with correct stats.

---

## Rollout Plan

### v1 (MVP)

- [x] Game recording via LCU
- [x] SQLite schema + migrations
- [x] Threat score calculation (pure engine + tests)
- [x] Personal Counters UI view with role filtering
- [x] Confidence tiers (Potential, Likely, Confirmed)
- [x] Tier-based filtering (current tier only, with badge)

### v1.1 (Enhancement)

- [ ] Tier archival: automatically hide old-tier counters on promotion
- [ ] Export personal stats (CSV, JSON)
- [ ] Recency weighting: downgrade threat score for stale matchups (>30 days old)

### v2 (Future)

- [ ] Per-champion counters: "When I pick Akali mid, my main counters are [...]"
- [ ] Win-rate trends: chart threat over time
- [ ] Integration with champion select: overlay personal counters on pick screen
