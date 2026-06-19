-- Migration 005 — Role-Based Ban Recommendations (spec 007 plan.md § Data Model).
-- Additive, non-destructive (Constitution III — never drops user pool data). Adds:
--   1. ban_stats — cached per-(champion, role, elo) overall win rates, ranked into
--      the "Recommended Bans" list. Normalized like champion_stats: name/icon are
--      JOINed from `champions` at read time, not denormalized here.
--   2. app_settings.last_ban_stats_fetch_at / _status — ban-fetch freshness,
--      paralleling last_stats_fetch_* and last_synergy_fetch_* (deriveFreshness).
--   3. app_settings.current_elo_tier — last-known ranked tier resolved from the LCU
--      (FR-008). Persisted so the right tier's bans render offline on next launch.

CREATE TABLE IF NOT EXISTS ban_stats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id  INTEGER NOT NULL REFERENCES champions(champion_id),
  role         TEXT    NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  elo_tier     TEXT    NOT NULL,                 -- lolalytics tier slug, e.g. "emerald"
  win_rate     REAL    NOT NULL CHECK (win_rate >= 0 AND win_rate <= 100),
  pick_rate    REAL,                             -- optional context; NULL when unknown
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  patch        TEXT    NOT NULL,                 -- e.g. "14.12"
  data_source  TEXT    NOT NULL DEFAULT 'lolalytics',
  fetched_at   TEXT    NOT NULL,                 -- ISO-8601
  UNIQUE (champion_id, role, elo_tier, patch, data_source)
);

-- Ban ranking always queries by (elo_tier, role) at the latest patch.
CREATE INDEX IF NOT EXISTS idx_ban_stats_lookup ON ban_stats(elo_tier, role, patch);

-- Ban-fetch freshness, paralleling last_stats_fetch_at/status. NULL until the first
-- ban-stats fetch attempt completes; bundled seed data does not set these (treated
-- as never-fetched → "stale" until a live fetch succeeds, same as champion_stats).
ALTER TABLE app_settings
  ADD COLUMN last_ban_stats_fetch_at TEXT;       -- ISO-8601 timestamp; NULL = never attempted

ALTER TABLE app_settings
  ADD COLUMN last_ban_stats_fetch_status TEXT    -- 'success' | 'error'; NULL = never attempted
    CHECK (last_ban_stats_fetch_status IN ('success', 'error'));

-- Last-known ranked tier from the LCU (FR-008). NULL = never resolved → the app
-- falls back to a default tier (FR-009).
ALTER TABLE app_settings
  ADD COLUMN current_elo_tier TEXT;
