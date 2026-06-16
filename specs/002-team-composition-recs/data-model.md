# Data Model: Composition-Aware Recommendations

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document covers the schema additions and type extensions required for the
composition-aware recommendation feature, layered on top of the base feature's
data model ([spec 001 data-model.md](../001-champion-pool-recommender/data-model.md)).

---

## 1. New SQLite Table: `champion_synergy`

Stores ally-synergy win-rate data for pool champions. Scoped to the champions
actually in the player's pool (fetched per-champion via `LolalyticsMatchupProvider`).

```sql
-- Migration: src/main/db/migrations/002_add_synergy.sql
CREATE TABLE IF NOT EXISTS champion_synergy (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id      INTEGER NOT NULL REFERENCES champions(champion_id),
  role             TEXT    NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  ally_champion_id INTEGER NOT NULL REFERENCES champions(champion_id),
  win_rate         REAL    NOT NULL CHECK (win_rate >= 0 AND win_rate <= 100),
  games_played     INTEGER NOT NULL CHECK (games_played >= 0),
  patch            TEXT    NOT NULL,       -- e.g. "16.12"
  fetched_at       TEXT    NOT NULL,       -- ISO-8601
  UNIQUE (champion_id, role, ally_champion_id, patch)
);

CREATE INDEX IF NOT EXISTS idx_champion_synergy_lookup
  ON champion_synergy(champion_id, role, patch);

CREATE INDEX IF NOT EXISTS idx_champion_synergy_ally
  ON champion_synergy(ally_champion_id);
```

**Interpretation of a row**: "When `champion_id` plays `role` with `ally_champion_id`
on the same team, the historical win rate is `win_rate`% (based on `games_played` games
at patch `patch`)."

**Row scope**: Only champion-role pairs in the player's pool. Unlike `champion_stats`
(which covers all ~170 champions for overall rows), `champion_synergy` is refreshed
only for the pool's current (champion, role) pairs at the time of the refresh cycle.

---

## 2. Schema Extension: `champ_select_snapshot`

Add an `ally_champion_ids` column so the snapshot captures ally context for
offline/fallback use (FR-001, US2 fallback).

```sql
-- Part of migration 002_add_synergy.sql
ALTER TABLE champ_select_snapshot
  ADD COLUMN ally_champion_ids TEXT NOT NULL DEFAULT '[]';
-- '[]' default means existing rows read as "no allies" before any update.
```

`ally_champion_ids` is a JSON array of Riot champion IDs (same encoding as
`enemy_champion_ids`).

---

## 3. Extended TypeScript Types (`src/shared/types.ts`)

### `ChampSelectSession` — add `allyChampionIds`

```ts
export interface ChampSelectSession {
  active: boolean
  phase: ChampSelectPhase
  assignedRole: Role | null
  localPlayerCellId: number | null
  enemyChampionIds: number[]
  allyChampionIds: number[]   // NEW — locked-in ally picks, excluding the local player
  updatedAt: string
}
```

`allyChampionIds` contains only champions already locked in by teammates (`championId > 0`
and `cellId !== localPlayerCellId` from the LCU `myTeam[]` array). A hovering (not
locked) champion is NOT included (research.md §1).

### `ScoreBreakdown` — new type

```ts
export type ActiveSignal = 'enemy-matchup' | 'ally-synergy' | 'overall'

export interface ScoreBreakdown {
  /** Enemy-matchup component: avg WR vs revealed enemies (or overall fallback). */
  enemyMatchupScore: number     // 0–100
  /** Ally-synergy component: avg WR with locked-in allies (or overall fallback). */
  allysSynergyScore: number     // 0–100
  /** Weighted aggregate = the entry's top-level `score`. 50% each when both active. */
  combinedScore: number         // 0–100
  /** Which signals contributed to `combinedScore`. */
  activeSignals: ActiveSignal[]
}
```

### `ScoreBasis` — extended

```ts
export type ScoreBasis = 'matchup' | 'overall' | 'combined'
// 'combined' = both enemy-matchup and ally-synergy signals were active
```

### `RecommendationEntry` — add `scoreBreakdown`

```ts
export interface RecommendationEntry {
  championId: number
  championKey: string
  championName: string
  iconPath: string
  role: Role
  /** Combined score (0–100) used for ranking. Was enemy-only WR in spec 001. */
  score: number
  /** 'combined' when both signals active; 'matchup'/'overall' for enemy-only path. */
  scoreBasis: ScoreBasis
  isFlagged: boolean
  /** NEW — full signal breakdown for the score-breakdown UI (US3). */
  scoreBreakdown: ScoreBreakdown
}
```

### `Recommendation` — add `allyChampionIds`

```ts
export interface Recommendation {
  role: Role | null
  entries: RecommendationEntry[]
  enemyChampionIds: number[]
  allyChampionIds: number[]   // NEW — echoes the session context used for ranking
  freshness: Freshness
  statsAsOfPatch: string
  lastUpdatedAt: string
}
```

---

## 4. Engine Input Types (`src/recommendation/engine.ts`)

### `SynergyRowInput` — new

```ts
export interface SynergyRowInput {
  championId: number
  role: Role
  allyChampionId: number
  winRate: number
  gamesPlayed: number
}
```

### `RecommendationInput` — extended

```ts
export interface RecommendationInput {
  poolEntries: PoolEntryInput[]
  statRows: StatRowInput[]
  synergyRows: SynergyRowInput[]   // NEW
  role: Role | null
  enemyChampionIds: number[]
  allyChampionIds: number[]        // NEW
  freshness: FreshnessInput
  statsAsOfPatch: string
}
```

---

## 5. Repository Types (`src/main/db/repositories/`)

### `SynergyRepository` — new file

```ts
export interface SynergyRow {
  championId: number
  role: Role
  allyChampionId: number
  winRate: number
  gamesPlayed: number
}

export class SynergyRepository {
  /** Upsert synergy rows (REPLACE on UNIQUE conflict). */
  upsertSynergy(rows: SynergyRow[]): void

  /** Fetch the latest-patch synergy rows for the given pool champion IDs. */
  getSynergyRowsForChampions(championIds: number[]): SynergyRow[]
}
```

### `SnapshotRepository` — extended

`ChampSelectSnapshot` gains `allyChampionIds: number[]`. The `update()` call must
also persist/restore this array (JSON-serialized, same as `enemy_champion_ids`).

---

## 6. Scoring Logic (`src/recommendation/`)

### `src/recommendation/synergy.ts` — new file (Principle IV)

Pure function; no I/O, no framework imports.

```ts
export interface AllyCandidateScore {
  score: number
  gamesPlayed: number
  signal: 'ally-synergy' | 'overall'
}

/** Score a pool candidate against locked-in ally champions.
 *  Falls back to the candidate's overall WR per FR-011-analogue (research.md §3). */
export function scoreWithAllies(
  candidate: PoolEntryInput,
  synergyRows: SynergyRowInput[],
  allyChampionIds: number[],
  overallWinRate: number
): AllyCandidateScore
```

### `src/recommendation/engine.ts` — modifications

- `scoreCandidate()` return type gains `enemyScore` (rename of `score`) for clarity.
- New internal call to `scoreWithAllies()` to obtain `allyScore`.
- Combined score computed per research.md §3 weighting table.
- `RecommendationEntry` built with `scoreBreakdown` populated.
- `allyChampionIds` exclusion added: pool candidates whose `championId` appears in
  `allyChampionIds` are excluded before scoring (FR-010).

---

## 7. Entity Relationship Summary (additions to spec 001 ERD)

```
champions
  ← (champion_id, ally_champion_id) — champion_synergy — (champion_id, role, ally_champion_id)
                                                           ↑
                                              pool-scoped synergy rows
                                              refreshed per LolalyticsMatchupProvider

champ_select_snapshot
  └── ally_champion_ids  (JSON array, new column)
```

---

## 8. Role-Resolution Precedence (unchanged)

```
manual_role (app_settings)
  → session.assignedRole (live LCU)
  → snapshot.assigned_role (SQLite)
  → null (show role-selection prompt)
```

No change from spec 001 — ally synergy and enemy matchup scoring both operate on
whichever role is resolved.
