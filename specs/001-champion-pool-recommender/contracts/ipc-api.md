# Contract: Renderer ↔ Main IPC API (`window.api`)

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This is the typed surface exposed by `src/preload/index.ts` via
`contextBridge.exposeInMainWorld('api', ...)`. The Vue renderer never accesses
`ipcRenderer`, Node, or SQLite directly (`contextIsolation: true`,
`nodeIntegration: false`). All methods are `async` (return `Promise`s) even where
the main-process implementation is synchronous (`better-sqlite3`), so the
renderer code is consistent.

```ts
interface Api {
  pool: {
    list(): Promise<PoolEntryView[]>;
    add(championId: number, role: Role): Promise<void>;
    remove(championId: number, role: Role): Promise<void>;
    removeAllRoles(championId: number): Promise<void>;
  };

  champions: {
    list(): Promise<ChampionSummary[]>;
  };

  recommendation: {
    get(): Promise<Recommendation>;
    onUpdate(callback: (rec: Recommendation) => void): UnsubscribeFn;
  };

  champSelect: {
    getStatus(): Promise<ChampSelectSession>;
    onSessionUpdate(callback: (session: ChampSelectSession) => void): UnsubscribeFn;
  };

  settings: {
    get(): Promise<AppSettings>;
    setManualRole(role: Role | null): Promise<void>;
    setStatsFreshnessHours(hours: number): Promise<void>;
  };
}

type UnsubscribeFn = () => void;
type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'SUPPORT';
```

## Shared Types

```ts
interface ChampionSummary {
  championId: number;
  key: string;
  name: string;
  iconPath: string;
  isActive: boolean;
}

interface PoolEntryView extends ChampionSummary {
  role: Role;
  isFlagged: boolean;   // === !isActive, included for UI convenience (FR-018)
  addedAt: string;       // ISO-8601
}

interface AppSettings {
  manualRole: Role | null;
  statsFreshnessHours: number;
  lastStatsFetchAt: string | null;
  lastStatsFetchStatus: 'success' | 'error' | null;
}

// Recommendation / RecommendationEntry / ChampSelectSession: see data-model.md
```

## Method → Requirement Traceability

| Method | Backing requirement(s) |
|---|---|
| `pool.list` / `add` / `remove` / `removeAllRoles` | FR-001–FR-005, US1 |
| `champions.list` | Supports pool-management "add champion" picker; surfaces `isActive` for FR-018 |
| `recommendation.get` / `onUpdate` | FR-008–FR-017, US2, US3 |
| `champSelect.getStatus` / `onSessionUpdate` | FR-006, FR-007, FR-010 |
| `settings.get` / `setManualRole` | FR-007 (manual role override) |
| `settings.setStatsFreshnessHours` | research.md §5 (freshness threshold is configurable) |

## Channel Naming (Main Process Side)

`ipcMain.handle` channels use `<namespace>:<action>` naming
(`pool:list`, `pool:add`, `pool:remove`, `pool:removeAllRoles`, `champions:list`,
`recommendation:get`, `champSelect:getStatus`, `settings:get`,
`settings:setManualRole`, `settings:setStatsFreshnessHours`). All channel name
strings are defined once as constants in `src/shared/ipcChannels.ts` and imported
by both `src/preload` (for whitelisting) and `src/main/ipc/handlers.ts` (for
registration) — no channel name is duplicated as a string literal.

Push events (main → renderer) use `<namespace>:<event>`:
`recommendation:updated` (payload: `Recommendation`),
`champSelect:sessionUpdated` (payload: `ChampSelectSession`).
The preload's `onUpdate`/`onSessionUpdate` wrap `ipcRenderer.on(channel, ...)` and
return a function that calls `ipcRenderer.removeListener(channel, ...)`.

## Error Handling

- `pool.add` on an existing `(championId, role)` pair is a **no-op success**
  (idempotent — FR-005 "does not create a duplicate entry"), not an error.
- `pool.remove` / `removeAllRoles` on a non-existent entry is a no-op success.
- `recommendation.get` and `champSelect.getStatus` **never reject** for "expected"
  unavailability (LCU not running, stats fetch failed) — these are represented in
  the returned data (`Recommendation.freshness`, `ChampSelectSession.active`), per
  FR-014/FR-015/SC-005 ("never fails silently or shows a blank/error screen").
  Rejections are reserved for programming errors (invalid `championId`/`role`
  enum values).
