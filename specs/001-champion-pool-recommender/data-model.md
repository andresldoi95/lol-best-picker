# Data Model: Champion Pool Recommender

**Date**: 2026-06-14
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

All five roles use a single canonical enum throughout the codebase:

```ts
type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'SUPPORT';
```

(LCU's `utility` and u.gg's `support`/`supp`/`adc` slugs are normalized to this
enum at the integration boundary — see [research.md §2](./research.md#2-league-client-update-lcu-api-integration).)

---

## Persisted Entities (SQLite)

### `champions`

Static champion metadata, refreshed from Riot Data Dragon. Never hard-deleted —
champions removed from the live game data are deactivated (`is_active = 0`) so
existing `pool_entries` foreign keys and history remain valid (FR-018).

| Column | Type | Notes |
|---|---|---|
| `champion_id` | INTEGER PK | Riot numeric champion ID |
| `key` | TEXT UNIQUE NOT NULL | Riot slug, e.g. `"Ahri"` — used to join u.gg stats |
| `name` | TEXT NOT NULL | Display name, e.g. `"Ahri"` |
| `icon_path` | TEXT NOT NULL | Local cache path or CDN URL for the champion icon |
| `is_active` | INTEGER NOT NULL DEFAULT 1 | 0 if absent from the latest Data Dragon refresh |
| `data_version` | TEXT NOT NULL | Data Dragon version this row was last refreshed from |

**Validation**: `key` and `champion_id` unique and immutable once assigned.

---

### `pool_entries`

The player's personal champion pool — a (champion, role) pairing (FR-001–FR-005).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `champion_id` | INTEGER NOT NULL | FK → `champions.champion_id` |
| `role` | TEXT NOT NULL | One of `Role`; CHECK constraint |
| `added_at` | TEXT NOT NULL | ISO-8601 timestamp |

**Constraints**:
- `UNIQUE(champion_id, role)` — enforces FR-005 (no duplicate champion+role; same
  champion may appear under multiple roles as separate rows).
- `CHECK (role IN ('TOP','JUNGLE','MIDDLE','BOTTOM','SUPPORT'))`.

**Lifecycle**: Created on "add to pool," deleted on "remove from pool" (either a
single role row, or all rows for a champion — FR-003). No soft-delete; removal is
immediate and the independent test in US1 relies on the row being gone.

---

### `champion_stats`

Cached champion/matchup win-rate statistics sourced from u.gg via
`StatsProvider` (research.md §1).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `champion_id` | INTEGER NOT NULL | FK → `champions.champion_id` |
| `role` | TEXT NOT NULL | One of `Role`; CHECK constraint |
| `opponent_champion_id` | INTEGER NULL | FK → `champions.champion_id`; **NULL = overall win rate for (champion, role)**, non-NULL = matchup-specific win rate (FR-017) |
| `win_rate` | REAL NOT NULL | Percentage, `0.0–100.0` |
| `games_played` | INTEGER NOT NULL | Sample size backing `win_rate`; `>= 0` |
| `patch` | TEXT NOT NULL | Game patch version this row applies to, e.g. `"14.12"` |
| `fetched_at` | TEXT NOT NULL | ISO-8601 timestamp of the fetch that produced this row |

**Constraints**:
- `UNIQUE(champion_id, role, opponent_champion_id, patch)` — one row per
  champion/role/(opponent or overall)/patch. SQLite treats distinct `NULL`s as
  non-equal for uniqueness, so overall rows (`opponent_champion_id IS NULL`) are
  additionally constrained via a partial unique index:
  `UNIQUE INDEX ON (champion_id, role, patch) WHERE opponent_champion_id IS NULL`.
- `CHECK (win_rate >= 0 AND win_rate <= 100)`.
- `CHECK (games_played >= 0)`.

**Refresh strategy**: A successful `StatsProvider` fetch upserts rows for the
current patch; `app_settings.last_stats_fetch_at` / `last_stats_fetch_status` are
updated regardless of success/failure (research.md §5 freshness policy). Stats for
older patches are retained (not deleted) until the next successful fetch
overwrites them, so a failed refresh always leaves the previous patch's data
available for `cached`/`stale` display.

---

### `app_settings`

Single-row table for app-wide configuration and freshness bookkeeping.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Always `1` (`CHECK (id = 1)`) |
| `stats_freshness_hours` | INTEGER NOT NULL DEFAULT 24 | Threshold from research.md §5 |
| `manual_role` | TEXT NULL | One of `Role` or NULL; session-level override (FR-007) |
| `last_stats_fetch_at` | TEXT NULL | ISO-8601 timestamp of the last *attempted* fetch |
| `last_stats_fetch_status` | TEXT NULL | `'success'` \| `'error'` |
| `riot_api_key` | TEXT NULL | Reserved for future use; not required by this feature (research.md §3) |

---

### `champ_select_snapshot`

Single-row table persisting the last-known champion-select context, so the app
can render a recommendation immediately on launch even if the League Client isn't
running (US3 AC3) and the edge case "role from the player's most recent game."

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Always `1` |
| `assigned_role` | TEXT NULL | One of `Role` or NULL — last detected/selected role |
| `enemy_champion_ids` | TEXT NOT NULL DEFAULT `'[]'` | JSON array of Riot `champion_id`s revealed last session |
| `session_active` | INTEGER NOT NULL DEFAULT 0 | 1 while a champ-select session is currently live |
| `updated_at` | TEXT NOT NULL | ISO-8601 timestamp of last update |

**Role resolution precedence** (used wherever "the assigned role" is needed):
1. `app_settings.manual_role`, if set for this session.
2. Live LCU `assignedPosition` from the current champ-select session, if active.
3. `champ_select_snapshot.assigned_role` (most recent prior session).
4. None → UI shows the role-selection prompt (FR-007 / edge case for pre-champ-select launch with no history).

---

## Runtime / Computed Types (not persisted)

These correspond to the spec's "Champion Select Session" and "Recommendation" key
entities. They are plain TypeScript types produced by `src/main` and
`src/recommendation`, pushed to the renderer via IPC — never written to SQLite as
such (only the durable subset above is persisted).

### `ChampSelectSession`

```ts
interface ChampSelectSession {
  active: boolean;
  phase: 'NONE' | 'BAN_PICK' | 'FINALIZATION';
  assignedRole: Role | null;       // from LCU assignedPosition, normalized
  localPlayerCellId: number | null;
  enemyChampionIds: number[];      // revealed enemy picks only (locked-in), not bans
  updatedAt: string;                // ISO-8601
}
```

### `Recommendation`

```ts
interface RecommendationEntry {
  championId: number;
  championKey: string;
  championName: string;
  iconPath: string;
  role: Role;
  score: number;                    // win-rate percentage used for ranking
  scoreBasis: 'matchup' | 'overall'; // 'matchup' = vs. revealed enemies, 'overall' = no enemies revealed or fallback (FR-017)
  isFlagged: boolean;               // true if champions.is_active = 0 (FR-018)
}

interface Recommendation {
  role: Role;
  entries: RecommendationEntry[];   // ranked best → worst; empty = FR-013 empty state
  enemyChampionIds: number[];       // context used for ranking (echoes session)
  freshness: 'live' | 'cached' | 'stale';
  statsAsOfPatch: string;
  lastUpdatedAt: string;            // ISO-8601 — drives the "last updated" indicator
}
```

**Derivation** (pure function in `src/recommendation/engine.ts`, Constitution
Principle IV):

1. **Filter** `pool_entries` to `role = assignedRole` → candidate champions
   (Principle I — pool + role is the *only* filter; if empty, return
   `entries: []` → FR-013 empty state).
2. **Score** each candidate:
   - If `enemyChampionIds` is non-empty: for each enemy, look up
     `champion_stats` where `opponent_champion_id = enemy.championId`; if present,
     `scoreBasis = 'matchup'`. If no matchup row exists for *any* revealed enemy,
     fall back to the `opponent_champion_id IS NULL` (overall) row,
     `scoreBasis = 'overall'` (FR-017). When multiple enemies are revealed,
     aggregate (e.g., average) the available matchup win rates.
   - If `enemyChampionIds` is empty: use the overall row directly,
     `scoreBasis = 'overall'` (FR-011).
3. **Rank** descending by `score`. **Tie-break** (FR-016, deterministic): on equal
   `score`, order by (a) higher `games_played` on the deciding stat row, then (b)
   ascending `championId` — guarantees a stable, repeatable order.
4. **Flag** entries where the joined `champions.is_active = 0` (FR-018) — included
   in the list (not excluded) but visually flagged, per spec edge case ("flagged or
   excluded... without breaking the rest of the pool"); ranking still uses their
   cached stats if available.
5. **Freshness**: derived per research.md §5 from `app_settings.last_stats_fetch_at`
   / `last_stats_fetch_status` and `stats_freshness_hours`.

---

## Entity-Relationship Summary

```text
champions (1) ──< (N) pool_entries
champions (1) ──< (N) champion_stats.champion_id
champions (1) ──< (N) champion_stats.opponent_champion_id   [nullable]

app_settings            (single row, 1:1 with "the app")
champ_select_snapshot   (single row, 1:1 with "the app")
```

`Recommendation` is computed at request time from
`pool_entries ⋈ champion_stats ⋈ champions`, scoped by
`(assignedRole, enemyChampionIds)` resolved from `champ_select_snapshot` /
live LCU session / `app_settings.manual_role`.

---

## Indexes

- `pool_entries(role)` — recommendation queries always filter by role first.
- `champion_stats(champion_id, role, patch)` and the partial unique index above —
  overall-row lookups and patch-scoped joins.
- `champion_stats(opponent_champion_id)` — matchup lookups by revealed enemy.

These keep recommendation computation (Principle V, < 100ms) to a handful of
indexed lookups over at most a few dozen pool entries.

---

## Migrations

Per the constitution's Development Workflow gate ("Schema changes to SQLite tables
MUST ship with a migration script"), the initial schema is delivered as
`001_initial.sql` (or equivalent versioned migration in
`src/main/db/migrations/`), establishing all five tables above plus the indexes.
Future schema changes add new numbered migration files; the app applies pending
migrations on startup before any repository access.
