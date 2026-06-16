# Contract: Renderer ↔ Main IPC API (updated for spec 002)

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This document extends the base IPC contract from
[spec 001 contracts/ipc-api.md](../../001-champion-pool-recommender/contracts/ipc-api.md).
Only **changed** or **new** surfaces are described here. Unchanged methods
(`pool.*`, `champions.*`, `settings.*`) are not repeated.

---

## Changed Types

### `ChampSelectSession`

```ts
interface ChampSelectSession {
  active: boolean
  phase: 'NONE' | 'BAN_PICK' | 'FINALIZATION'
  assignedRole: Role | null
  localPlayerCellId: number | null
  enemyChampionIds: number[]
  allyChampionIds: number[]   // NEW — locked-in allies (not the local player)
  updatedAt: string
}
```

`allyChampionIds` is populated from `myTeam[]` in the LCU session, filtered to
entries where `championId > 0` (locked in) and `cellId !== localPlayerCellId`
(not the player being recommended for). Absent when LCU is disconnected (`[]`).

### `RecommendationEntry`

```ts
interface RecommendationEntry {
  championId: number
  championKey: string
  championName: string
  iconPath: string
  role: Role
  score: number               // Combined score (0–100); was enemy-only WR in spec 001
  scoreBasis: ScoreBasis      // 'combined' | 'matchup' | 'overall'
  isFlagged: boolean
  scoreBreakdown: ScoreBreakdown   // NEW
}

type ScoreBasis = 'combined' | 'matchup' | 'overall'

interface ScoreBreakdown {
  enemyMatchupScore: number      // 0–100
  allysSynergyScore: number      // 0–100
  combinedScore: number          // === entry.score
  activeSignals: ActiveSignal[]
}

type ActiveSignal = 'enemy-matchup' | 'ally-synergy' | 'overall'
```

### `Recommendation`

```ts
interface Recommendation {
  role: Role | null
  entries: RecommendationEntry[]
  enemyChampionIds: number[]
  allyChampionIds: number[]   // NEW — context echo
  freshness: Freshness
  statsAsOfPatch: string
  lastUpdatedAt: string
}
```

---

## `champSelect` namespace — change detection

The main process MUST detect ally lock-in events (a new `championId > 0` appears in
`myTeam[]` that was `0` previously) and treat them as meaningful session changes, the
same way enemy picks are detected. This ensures `recommendation:updated` is pushed
within 1 second of an ally lock-in (SC-001, Principle V).

The existing `sessionKey()` function in `champSelectAdapter.ts` must include
`allyChampionIds` in its change-fingerprint:

```ts
// sessionKey must capture ally picks
const key = `${session.phase}:${session.assignedRole}:${[...session.enemyChampionIds].sort().join(',')}:${[...session.allyChampionIds].sort().join(',')}`
```

---

## Method → Requirement Traceability (additions)

| What changed | Backing requirement(s) |
|---|---|
| `ChampSelectSession.allyChampionIds` | FR-001 (detect ally picks), FR-005 (update on ally lock-in) |
| `RecommendationEntry.scoreBreakdown` | FR-009 (breakdown display), US3 |
| `Recommendation.allyChampionIds` | US3 AC3 (single active signal visible) |
| `RecommendationEntry.scoreBasis = 'combined'` | FR-003 (combined score), FR-004 (ranking) |
| Ally lock-in triggers `recommendation:updated` | FR-005, SC-001 |

---

## Error Handling (unchanged)

All existing error-handling conventions from spec 001 `ipc-api.md` apply.
`recommendation.get()` and `champSelect.getStatus()` still never reject for
expected unavailability — `allyChampionIds: []` is the correct representation of
"no allies locked in or LCU not running", not an error state.
