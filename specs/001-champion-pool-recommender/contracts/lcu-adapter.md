# Contract: LCU Adapter (Live Champion-Select State)

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) §2

Isolates `src/main` from the raw League Client Update (LCU) API. Lives in
`src/main/lcu/`. All operations are **read-only** (Constitution Principle II).

```ts
interface LcuAdapter {
  /** Resolves once the lockfile is found and an authenticated connection is
   *  established. Resolves to `null` if no running client is detected
   *  (lockfile absent) — this is an expected, non-error state. */
  connect(): Promise<LcuClient | null>;
}

interface LcuClient {
  /** GET /lol-champ-select/v1/session, normalized. Returns `null` if the player
   *  is not currently in champ select (LCU returns 404 for this endpoint). */
  getChampSelectSession(): Promise<ChampSelectSession | null>;

  /** Confirms ranked Solo/Duo or Flex via /lol-gameflow/v1/gameflow-phase +
   *  /lol-lobby/v2/lobby (FR-006, spec assumption on "ranked game"). */
  isRankedChampSelect(): Promise<boolean>;

  /** WebSocket subscription to `/lol-champ-select/v1/session` change events.
   *  Returns an unsubscribe function. Handler receives the same normalized
   *  `ChampSelectSession | null` shape as getChampSelectSession(). */
  onChampSelectUpdate(handler: (session: ChampSelectSession | null) => void): () => void;

  /** Fires when the LCU connection drops (client closed, lockfile removed). */
  onDisconnect(handler: () => void): void;
}
```

`ChampSelectSession` is defined in [../data-model.md](../data-model.md#champselectsession).

## Connection Details (research.md §2)

- **Lockfile**: `%LOCALAPPDATA%\Riot Games\League of Legends\lockfile`,
  colon-delimited `processName:pid:port:password:protocol`.
- **Base URL**: `https://127.0.0.1:{port}`, HTTP Basic auth
  (`riot` / `{password}`), TLS verified against Riot's published
  `riotgames.pem` root certificate.
- **WebSocket**: `wss://127.0.0.1:{port}/`, same auth; subscribe to
  `OnJsonApiEvent_lol-champ-select_v1_session`.
- **Polling fallback**: if the WebSocket subscription fails to establish, the
  adapter falls back to polling `getChampSelectSession()` every 1s (matches
  Constitution Principle V's 1s budget as a worst case, not the normal path).

## Normalization Rules

| Raw LCU field | Normalized field | Notes |
|---|---|---|
| `myTeam[cellId === localPlayerCellId].assignedPosition` | `ChampSelectSession.assignedRole` | `"utility"` → `SUPPORT`; `""`/unrecognized → `null` (triggers FR-007 manual selection) |
| `theirTeam[].championId` (non-zero only) | `ChampSelectSession.enemyChampionIds` | `0` = not yet picked → excluded. Only **picks**, not bans (spec Assumptions) |
| `timer.phase` | `ChampSelectSession.phase` | passthrough enum |
| presence of a session at all | `ChampSelectSession.active` | `false` + last-known values when `getChampSelectSession()` returns `null` |

## Failure / Absence Handling

| Condition | Adapter behavior | Consumer-visible effect |
|---|---|---|
| Lockfile not found | `connect()` resolves `null` | `champ_select_snapshot` (last known) is used; `ChampSelectSession.active = false` |
| Client running, not in champ select | `getChampSelectSession()` → `null` | Same as above |
| Connection drops mid-session | `onDisconnect` fires; adapter retries `connect()` on an interval | Last `ChampSelectSession` retained (US3 AC1) until reconnect |
| Ranked check fails / non-ranked queue | `isRankedChampSelect()` → `false` | Main process does not surface a recommendation update for this session (spec scope: ranked only) |

## Test Doubles

`tests/contract/lcu-adapter.test.ts` uses a `FixtureLcuAdapter` driven by
recorded raw LCU JSON fixtures (captured once from Rift Explorer / a real client
per the constitution's manual-test-checklist requirement) covering: no client,
champ select with 0 enemies revealed, champ select with 1–5 enemies revealed,
`assignedPosition === "utility"` mapping, and a disconnect-mid-session sequence.
