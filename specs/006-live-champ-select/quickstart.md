# Quickstart: Live Champion Selection Implementation

**Goal**: Implement and test a minimal viable feature where:
1. App detects champion select phase
2. Filters available champions
3. Auto-navigates to champion select view
4. Shows empty state when phase ends

**Estimated Time**: 2–3 hours for basic implementation

---

## Step 0: Setup

```bash
npm run dev          # Start Electron app with HMR
# In another terminal:
npm run test:watch   # Watch for test failures
```

---

## Step 1: Create Pool Filtering Module (src/recommendation/filter-available-pool.ts)

**What**: Pure function to remove picked/banned champions from the user's pool.

**Input**:
```typescript
function filterAvailablePool(
  userPool: number[],
  selectedChampions: { championId: number; pickType: 'PICK' | 'BAN' }[]
): number[] {
  const selectedIds = new Set(selectedChampions.map(s => s.championId));
  return userPool.filter(id => !selectedIds.has(id));
}
```

**Test** (src/recommendation/filter-available-pool.test.ts):
```typescript
// Normal case: some champions removed
const pool = [1, 2, 3, 4, 5];
const selected = [{ championId: 2, pickType: 'PICK' }, { championId: 4, pickType: 'BAN' }];
expect(filterAvailablePool(pool, selected)).toEqual([1, 3, 5]);

// Edge case: all champions removed
const allSelected = [{ championId: 1 }, { championId: 2 }, { championId: 3 }, { championId: 4 }, { championId: 5 }];
expect(filterAvailablePool(pool, allSelected)).toEqual([]);

// Edge case: empty selections
expect(filterAvailablePool(pool, [])).toEqual(pool);
```

---

## Step 2: Create Champion Select Monitor (src/main/game/champion-select-monitor.ts)

**What**: Main process module that polls LCU and emits state changes via IPC.

**Skeleton**:
```typescript
export class ChampionSelectMonitor {
  private pollingInterval: NodeJS.Timer | null = null;
  private lastKnownSession: any = null;

  constructor(
    private lcu: LcuAdapter,
    private ipc: Electron.IpcMain
  ) {}

  start() {
    // Begin polling /lol/champ-select/v1/session every 100ms
    this.pollingInterval = setInterval(() => this.poll(), 100);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async poll() {
    try {
      const session = await this.lcu.get('/lol/champ-select/v1/session');
      
      // Check if phase changed
      if (this.phaseChanged(session)) {
        this.emit('game:championSelectState', {
          phase: session.timer.phase === 'CHAMPION_SELECT' ? 'CHAMPION_SELECT' : 'NOT_ACTIVE',
          selectedChampions: this.extractSelections(session),
          availablePool: filterAvailablePool(userPool, selections),
          timestamp: Date.now(),
        });
      }
      
      this.lastKnownSession = session;
    } catch (err) {
      // 404 = not in select, 401 = auth expired, etc.
      if (this.shouldEmitPhaseEnd(err)) {
        this.emit('game:championSelectState', {
          phase: 'NOT_ACTIVE',
          selectedChampions: [],
          availablePool: [],
          timestamp: Date.now(),
        });
      }
    }
  }

  private emit(channel: string, data: any) {
    // Send to all renderer windows
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, data);
    }
  }
}
```

**Test**:
- Mock LCU adapter
- Verify polling starts/stops
- Verify IPC emissions on phase changes

---

## Step 3: Integrate Monitor into Main Process (src/main/index.ts)

**What**: Initialize and manage the monitor lifecycle with app startup.

**Sketch**:
```typescript
const monitor = new ChampionSelectMonitor(lcu, ipcMain);

app.on('ready', () => {
  // ... existing setup ...
  monitor.start();
});

app.on('before-quit', () => {
  monitor.stop();
});
```

---

## Step 4: Add IPC Channel to Preload (src/preload/index.ts)

**What**: Expose `window.api.on('game:championSelectState', callback)` to renderer.

**Sketch**:
```typescript
contextBridge.exposeInMainWorld('api', {
  // Existing APIs...
  
  // New: Listen for game state updates
  onGameChampionSelectState: (callback: (state: any) => void) => {
    ipcRenderer.on('game:championSelectState', (_event, state) => {
      callback(state);
    });
  },
  
  // Cleanup
  offGameChampionSelectState: () => {
    ipcRenderer.removeAllListeners('game:championSelectState');
  },
});
```

---

## Step 5: Update Renderer (src/renderer/views/ChampSelect.vue or store)

**What**: Listen for state changes and auto-navigate.

**Pseudocode**:
```typescript
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router'; // or equivalent

const state = ref({
  phase: 'NOT_ACTIVE',
  availablePool: [],
  recommendation: null,
});

const router = useRouter();

// Listen for game state from main
window.api.onGameChampionSelectState((message) => {
  state.value = message;
  
  // Auto-navigate when champion select begins
  if (message.phase === 'CHAMPION_SELECT' && router.currentRoute.value.path !== '/champ-select') {
    router.push('/champ-select');
  }
});

// Update recommendation engine with filtered pool
const recommendedChampion = computed(() => {
  if (state.value.phase === 'NOT_ACTIVE') {
    return null; // Show empty state
  }
  
  // Pass filtered pool to recommendation engine
  return getRecommendation(state.value.availablePool, state.value.selectedChampions);
});
```

---

## Step 6: Create Empty State UI (src/renderer/views/ChampSelect.vue)

**What**: Display when phase is not active.

**Template**:
```vue
<template>
  <div v-if="gameState.phase === 'NOT_ACTIVE'" class="empty-state">
    <VCard class="text-center pa-8">
      <VCardTitle>Champion Select Inactive</VCardTitle>
      <VCardText>
        <p>Start a League of Legends game to see champion recommendations.</p>
      </VCardText>
    </VCard>
  </div>
  
  <div v-else>
    <!-- Existing recommendation display, now with filtered pool -->
  </div>
</template>
```

---

## Step 7: Test the Flow

**Manual test**:
1. Launch the app: `npm run dev`
2. Open League of Legends
3. Start a ranked game (or Practice Tool to test faster)
4. Enter champion select
5. **Expected**: App automatically switches to Champ Select view
6. **Expected**: Champions you/allies/enemies pick disappear from the available list
7. Exit champion select or end the game
8. **Expected**: View shows empty state

**Automated test**:
- Mock LCU adapter responses
- Mock router
- Verify IPC events emitted correctly
- Verify pool filtering math

---

## Deployment Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (including new filter tests)
- [ ] Manual test passed (with real League client)
- [ ] Recommendation engine still respects pool constraint (Constitution I)
- [ ] LCU access remains read-only (Constitution II)
- [ ] No new external dependencies added

---

## Debugging Tips

**Monitor not starting?**
- Check `app.on('ready')` is called before `monitor.start()`
- Verify LCU adapter is initialized

**IPC not reaching renderer?**
- Check preload bridge exposes the event listener
- Use DevTools: `window.api.onGameChampionSelectState((msg) => console.log(msg))`

**Phase not detected?**
- Verify you're actually in champion select (not loading screen)
- Check `/lol/champ-select/v1/session` returns 200 vs 404

**Pool not filtering?**
- Add console.log in monitor before emit
- Verify selectedChampions array is populated correctly

