-- Migration 006 — Local Game Statistics & Personal Counters (spec 008 data-model.md).
-- Additive, non-destructive (Constitution III — never drops user pool data). Adds:
--   1. game_records — one row per completed LoL game captured from LCU match history.
--      Allies/enemies are stored as JSON arrays of Data Dragon champion KEYS (not ids)
--      — they're only ever aggregated by key in the pure counterAnalyzer, never JOINed
--      per-enemy at scale, so JSON is sufficient (research.md §2). The player's own
--      champion is stored separately and excluded from both lists.
--   2. app_settings.last_game_record_fetch_at / _tier — capture freshness + the tier
--      at last capture, paralleling last_ban_stats_fetch_at and current_elo_tier.
--
-- Role values use the canonical Role enum (MIDDLE, not MID) — matches migration 005's
-- ban_stats CHECK and `Role` in @shared/types. player_tier holds a lowercase EloTier
-- slug (e.g. "emerald"), the same representation ban_stats.elo_tier uses, so it
-- compares directly with the LCU-resolved current tier (no CHECK, like ban_stats).

CREATE TABLE IF NOT EXISTS game_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp         INTEGER NOT NULL UNIQUE,        -- unix epoch ms when the game ended; UNIQUE dedupes re-captures
  player_champion   TEXT    NOT NULL,               -- Data Dragon champion key, e.g. "Akali"
  player_role       TEXT    NOT NULL CHECK (player_role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  allied_champions  TEXT    NOT NULL,               -- JSON array of champion keys (allies, excl. the player)
  enemy_champions   TEXT    NOT NULL,               -- JSON array of champion keys (enemies)
  result            TEXT    NOT NULL CHECK (result IN ('win', 'loss')),
  player_tier       TEXT    NOT NULL,               -- lowercase EloTier slug at game time, e.g. "emerald"
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

-- Counter queries filter by tier (current-tier view) and optionally by role, then
-- aggregate enemies; the timestamp index backs reverse-chronological history (US1 AC2).
CREATE INDEX IF NOT EXISTS idx_game_records_player_role ON game_records(player_role);
CREATE INDEX IF NOT EXISTS idx_game_records_player_tier ON game_records(player_tier);
CREATE INDEX IF NOT EXISTS idx_game_records_timestamp ON game_records(timestamp DESC);

-- Capture freshness, paralleling last_stats_fetch_at / last_ban_stats_fetch_at. ISO-8601
-- TEXT so it feeds the shared deriveFreshness() and FreshnessIndicator directly. NULL =
-- no successful capture cycle yet → counters view shows "stale" until the first capture.
ALTER TABLE app_settings
  ADD COLUMN last_game_record_fetch_at TEXT;        -- ISO-8601 timestamp; NULL = never captured

-- Tier at the last capture cycle (lowercase EloTier slug). NULL until first capture.
ALTER TABLE app_settings
  ADD COLUMN last_game_record_tier TEXT;
