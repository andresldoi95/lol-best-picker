-- Initial schema for LoL Best Picker (data-model.md).
-- All five tables + indexes are created here. Future schema changes add new
-- numbered migration files; the app applies pending migrations on startup.

-- Static champion identity/metadata, refreshed from Riot Data Dragon.
-- Never hard-deleted: champions absent from the latest refresh are deactivated
-- (is_active = 0) so existing pool_entries FKs remain valid (FR-018).
CREATE TABLE IF NOT EXISTS champions (
  champion_id  INTEGER PRIMARY KEY,             -- Riot numeric champion ID
  key          TEXT    UNIQUE NOT NULL,         -- Riot slug, e.g. "Ahri" (joins u.gg stats)
  name         TEXT    NOT NULL,                -- Display name
  icon_path    TEXT    NOT NULL,                -- Local cache path or CDN URL
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  data_version TEXT    NOT NULL                 -- Data Dragon version this row was refreshed from
);

-- The player's personal champion pool — a (champion, role) pairing.
CREATE TABLE IF NOT EXISTS pool_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id INTEGER NOT NULL REFERENCES champions(champion_id),
  role        TEXT    NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  added_at    TEXT    NOT NULL,                 -- ISO-8601
  UNIQUE (champion_id, role)                    -- FR-005: no duplicate champion+role
);

CREATE INDEX IF NOT EXISTS idx_pool_entries_role ON pool_entries(role);

-- Cached champion/matchup win-rate statistics (sourced from u.gg via StatsProvider).
CREATE TABLE IF NOT EXISTS champion_stats (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id          INTEGER NOT NULL REFERENCES champions(champion_id),
  role                 TEXT    NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  opponent_champion_id INTEGER REFERENCES champions(champion_id), -- NULL = overall win rate
  win_rate             REAL    NOT NULL CHECK (win_rate >= 0 AND win_rate <= 100),
  games_played         INTEGER NOT NULL CHECK (games_played >= 0),
  patch                TEXT    NOT NULL,        -- e.g. "14.12"
  fetched_at           TEXT    NOT NULL,        -- ISO-8601
  UNIQUE (champion_id, role, opponent_champion_id, patch)
);

-- SQLite treats distinct NULLs as non-equal, so overall rows
-- (opponent_champion_id IS NULL) need a partial unique index to stay one-per-key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_champion_stats_overall
  ON champion_stats(champion_id, role, patch)
  WHERE opponent_champion_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_champion_stats_lookup
  ON champion_stats(champion_id, role, patch);

CREATE INDEX IF NOT EXISTS idx_champion_stats_opponent
  ON champion_stats(opponent_champion_id);

-- Single-row table for app-wide configuration and freshness bookkeeping.
CREATE TABLE IF NOT EXISTS app_settings (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  stats_freshness_hours   INTEGER NOT NULL DEFAULT 24,
  manual_role             TEXT CHECK (manual_role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  last_stats_fetch_at     TEXT,
  last_stats_fetch_status TEXT CHECK (last_stats_fetch_status IN ('success', 'error')),
  riot_api_key            TEXT                  -- Reserved for future use (research.md §3)
);

INSERT OR IGNORE INTO app_settings (id, stats_freshness_hours) VALUES (1, 24);

-- Single-row table persisting the last-known champ-select context (US3 AC3).
CREATE TABLE IF NOT EXISTS champ_select_snapshot (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  assigned_role      TEXT CHECK (assigned_role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  enemy_champion_ids TEXT    NOT NULL DEFAULT '[]', -- JSON array of Riot champion_ids
  session_active     INTEGER NOT NULL DEFAULT 0 CHECK (session_active IN (0, 1)),
  updated_at         TEXT    NOT NULL              -- ISO-8601
);

INSERT OR IGNORE INTO champ_select_snapshot (id, enemy_champion_ids, session_active, updated_at)
  VALUES (1, '[]', 0, '1970-01-01T00:00:00.000Z');
