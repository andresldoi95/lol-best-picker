# Phase 1 Design: Data Model

**Date**: 2026-06-19  
**Status**: Complete

---

## Entity: GameRecord

Represents a single completed League of Legends game.

### Schema (SQLite: `game_records` table)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `timestamp` | INTEGER | NOT NULL, UNIQUE | Unix epoch milliseconds when game ended |
| `player_champion` | TEXT | NOT NULL | Champion key (e.g., "Aatrox") |
| `player_role` | TEXT | NOT NULL | Lane assigned in champion select: TOP, JUNGLE, MID, BOTTOM, SUPPORT |
| `allied_champions` | TEXT | NOT NULL | JSON array of 4 champion keys (allies, sorted alphabetically) |
| `enemy_champions` | TEXT | NOT NULL | JSON array of 5 champion keys (enemies, sorted alphabetically) |
| `result` | TEXT | NOT NULL CHECK (result IN ('win', 'loss')) | Game outcome from player perspective |
| `player_tier` | TEXT | NOT NULL | Normalized elo rank at time of game: IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER |
| `created_at` | INTEGER | DEFAULT CURRENT_TIMESTAMP | Record insertion timestamp (for auditing) |

### Validation Rules

- `timestamp`: Unique (prevents duplicate game records); must be within last 90 days (prevents far-future entries)
- `player_champion`: Must match an entry in the data dragon champions dataset (via `championsRepository`)
- `player_role`: Must be one of the 5 canonical roles
- `allied_champions`, `enemy_champions`: 
  - Arrays must contain valid champion keys
  - `allied_champions` must have exactly 4 unique entries
  - `enemy_champions` must have exactly 5 unique entries
  - No champion should appear in both allied and enemy sets
  - `player_champion` must not appear in allied or enemy sets (player is represented separately)
- `result`: Only 'win' or 'loss' (case-insensitive on insert, normalized to lowercase)
- `player_tier`: Must match normalized tier from LCU `/lol-ranked/v1/current-ranked-stats` (see `normalizeLcuTier` in existing codebase)

### Indexing

```sql
CREATE INDEX idx_game_records_player_role ON game_records(player_role);
CREATE INDEX idx_game_records_player_tier ON game_records(player_tier);
CREATE INDEX idx_game_records_timestamp ON game_records(timestamp DESC);
CREATE INDEX idx_game_records_player_champion ON game_records(player_champion);
```

(Indices support fast filtering by role, tier, and chronological queries.)

### Example Record

```json
{
  "id": 42,
  "timestamp": 1719849300000,
  "player_champion": "Akali",
  "player_role": "MID",
  "allied_champions": ["Alistar", "Jinx", "LeeSin", "Thresh"],
  "enemy_champions": ["Ahri", "Braum", "Ornn", "Syndra", "Zeri"],
  "result": "win",
  "player_tier": "EMERALD",
  "created_at": 1719849305000
}
```

---

## Entity: PersonalCounter (Derived)

Represents an aggregated counter threat from GameRecords.

### Schema (SQLite: `personal_counters` materialized view or table)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `opponent_champion` | TEXT | NOT NULL | Champion that is a counter |
| `player_role` | TEXT | NOT NULL | Role in which this is a counter (or NULL for "all roles") |
| `player_tier` | TEXT | NOT NULL | Tier at which counter data was collected |
| `games_played` | INTEGER | NOT NULL, CHECK (games_played > 0) | Total games vs. this opponent in this role |
| `wins` | INTEGER | NOT NULL, CHECK (wins >= 0 AND wins <= games_played) | Wins vs. this opponent |
| `win_rate` | REAL | GENERATED (wins * 100.0 / games_played) | Win rate as percentage |
| `threat_score` | REAL | GENERATED AS ((50.0 - win_rate) * MIN(1.0, games_played / 5.0)) | Threat scoring formula |
| `confidence_tier` | TEXT | GENERATED AS (CASE WHEN games_played >= 10 THEN 'Confirmed' WHEN games_played >= 3 THEN 'Likely' ELSE 'Potential' END) | Confidence label |
| `last_encountered` | INTEGER | NOT NULL | Timestamp of most recent game vs. this opponent |

### Computation

PersonalCounter rows are derived from GameRecords by:

```sql
SELECT
  opponent_champion,
  player_role,
  player_tier,
  COUNT(*) AS games_played,
  SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS losses,
  COUNT(*) - SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) AS wins,
  MAX(timestamp) AS last_encountered
FROM (
  SELECT opponent_champion FROM game_records
  WHERE player_role = ? AND player_tier = ?
)
GROUP BY opponent_champion, player_role
ORDER BY threat_score DESC, games_played DESC
LIMIT 20
```

(In practice, this can be materialized into a `personal_counters` table, refreshed after each game record insert, or computed on-demand with query-level pagination.)

### Validation Rules

- `opponent_champion`: Must exist in data dragon champions
- `player_role`: Must be one of the 5 canonical roles or NULL (representing all roles)
- `player_tier`: Must match a valid tier
- `games_played`: At least 1 (derived from non-empty game records)
- `wins`: Must be in range [0, games_played]

### Example Rows

For a player with 20 games in MID at EMERALD, facing:

```json
[
  {
    "opponent_champion": "Ahri",
    "player_role": "MID",
    "player_tier": "EMERALD",
    "games_played": 10,
    "wins": 2,
    "win_rate": 20.0,
    "threat_score": 6.0,
    "confidence_tier": "Confirmed",
    "last_encountered": 1719849300000
  },
  {
    "opponent_champion": "LeBlanc",
    "player_role": "MID",
    "player_tier": "EMERALD",
    "games_played": 5,
    "wins": 1,
    "win_rate": 20.0,
    "threat_score": 3.0,
    "confidence_tier": "Likely",
    "last_encountered": 1719840000000
  },
  {
    "opponent_champion": "Zed",
    "player_role": "MID",
    "player_tier": "EMERALD",
    "games_played": 1,
    "wins": 0,
    "win_rate": 0.0,
    "threat_score": 0.1,
    "confidence_tier": "Potential",
    "last_encountered": 1719800000000
  }
]
```

---

## Entity: AppSettings (Existing, Extended)

Existing `app_settings` table is extended with:

| Column | Type | Notes |
|--------|------|-------|
| `last_game_record_fetch_at` | INTEGER | Timestamp of last LCU game outcome capture (for staleness indicator) |
| `last_game_record_tier` | TEXT | Tier at time of last game record capture (detects tier change) |

These fields enable:
1. Displaying "Game data: live / 2 hours ago / stale" indicator
2. Detecting tier changes (to archive old-tier counters, per Spec FR-?)

---

## Relationships

### GameRecord ← → PersonalCounter

- **One-to-Many**: Each GameRecord is used to derive 0..N PersonalCounter rows (one per unique opponent champion per role).
- **Derivation**: PersonalCounter is computed by aggregating GameRecords filtered by `player_role` and `player_tier`.
- **Freshness**: PersonalCounter is refreshed after each GameRecord insert (either materialized view refresh or on-demand computation).

### GameRecord ← → AppSettings

- **Read**: After capturing a game outcome, the app updates `last_game_record_fetch_at` and `last_game_record_tier` in AppSettings to signal freshness.
- **Write**: On tier change detected (LCU query), AppSettings is updated; old-tier counter data is archived (filtered out of Personal Counters view).

---

## State Transitions

### GameRecord Lifecycle

1. **Unrecorded** → **Captured**: LCU returns new match ID; `gameRecorder` fetches details and inserts into `game_records`.
2. **Captured** → **Persisted**: GameRecord survives app restart (stored in SQLite).
3. **Persisted** → **Archived**: (Future, v1.1) If player's tier changes, games from the old tier are marked as archived but not deleted.

### PersonalCounter Lifecycle

1. **Derived** → **Ranked**: After 1 GameRecord, a PersonalCounter is computed for each opponent. Threat score is low (confidence = "Potential").
2. **Ranked** → **Updated**: After each new GameRecord against the same opponent, PersonalCounter is recomputed; threat score and confidence tier may change.
3. **Ranked** → **Archived**: (Future) If tier changes, PersonalCounters from the old tier are filtered out of the view.

---

## Migration Strategy

### Initial Migration: `006_add_game_records.sql`

```sql
CREATE TABLE game_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL UNIQUE,
  player_champion TEXT NOT NULL,
  player_role TEXT NOT NULL CHECK (player_role IN ('TOP', 'JUNGLE', 'MID', 'BOTTOM', 'SUPPORT')),
  allied_champions TEXT NOT NULL,  -- JSON array
  enemy_champions TEXT NOT NULL,   -- JSON array
  result TEXT NOT NULL CHECK (result IN ('win', 'loss')),
  player_tier TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(julianday('now') * 86400000 AS INTEGER))
);

CREATE INDEX idx_game_records_player_role ON game_records(player_role);
CREATE INDEX idx_game_records_player_tier ON game_records(player_tier);
CREATE INDEX idx_game_records_timestamp ON game_records(timestamp DESC);
CREATE INDEX idx_game_records_player_champion ON game_records(player_champion);

-- AppSettings extensions (ALTER TABLE, not breaking)
ALTER TABLE app_settings ADD COLUMN last_game_record_fetch_at INTEGER;
ALTER TABLE app_settings ADD COLUMN last_game_record_tier TEXT;
```

**Non-breaking**: Adds new tables and columns; existing app continues unchanged.

---

## Performance Considerations

### Query Patterns

1. **"Fetch top 10 counters for MID, current tier"**: Index on `(player_role, player_tier)` with ORDER BY `threat_score DESC` → O(log N) seek + O(10) scan.
2. **"Has a new game been recorded?"**: Check `last_game_record_fetch_at` in AppSettings → O(1) read.
3. **"Record new game"**: Insert into `game_records` → O(1) amortized; recompute PersonalCounter → O(N) where N = distinct opponents (typically <50).

### Materialization

- **Materialized view** (explicit refresh): Slightly faster reads; requires explicit refresh after each insert.
- **On-demand computation** (SELECT with GROUP BY): Simpler code; small CPU cost acceptable for <5k games.

**Recommendation for v1**: On-demand computation. If profiling reveals slowness after 10k+ games, materialize into `personal_counters` table with incremental refresh.

---

## Consistency & Invariants

1. **No orphaned PersonalCounters**: PersonalCounter rows are computed from existing GameRecords; deletion of a GameRecord must trigger PersonalCounter recomputation.
2. **Tier consistency**: `GameRecord.player_tier` must match the tier the player held at `timestamp`. Post-hoc tier corrections are out of scope; if the player was promoted between games, both old-tier and new-tier games are recorded under their respective tiers.
3. **Champion pool independence**: PersonalCounter is **not** constrained by the player's champion pool. A champion the player doesn't own can be identified as a personal counter.
