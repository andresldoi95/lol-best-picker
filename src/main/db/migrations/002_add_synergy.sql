-- Migration 002 — Composition-Aware Recommendations (spec 002 data-model.md §1–2).
-- Two additive, non-destructive changes:
--   1. New `champion_synergy` table — pool-scoped ally win-rate data.
--   2. ALTER `champ_select_snapshot` ADD COLUMN `ally_champion_ids` — captures
--      ally context for the offline/last-known snapshot (FR-001).

-- Ally-synergy win rates for pool champions. Unlike `champion_stats` (all ~170
-- champions for overall rows), this is refreshed only for the (champion, role)
-- pairs actually in the player's pool, fetched per-champion via LolalyticsMatchupProvider.
CREATE TABLE IF NOT EXISTS champion_synergy (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id      INTEGER NOT NULL REFERENCES champions(champion_id),
  role             TEXT    NOT NULL CHECK (role IN ('TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT')),
  ally_champion_id INTEGER NOT NULL REFERENCES champions(champion_id),
  win_rate         REAL    NOT NULL CHECK (win_rate >= 0 AND win_rate <= 100),
  games_played     INTEGER NOT NULL CHECK (games_played >= 0),
  patch            TEXT    NOT NULL,             -- e.g. "16.12"
  fetched_at       TEXT    NOT NULL,             -- ISO-8601
  UNIQUE (champion_id, role, ally_champion_id, patch)
);

-- Primary lookup: "latest-patch synergy rows for this pool champion in this role".
CREATE INDEX IF NOT EXISTS idx_champion_synergy_lookup
  ON champion_synergy(champion_id, role, patch);

-- Reverse lookup by ally (kept symmetric with idx_champion_stats_opponent).
CREATE INDEX IF NOT EXISTS idx_champion_synergy_ally
  ON champion_synergy(ally_champion_id);

-- Persist ally picks alongside the last-known champ-select context. The '[]'
-- default means existing snapshot rows read as "no allies" before any update.
ALTER TABLE champ_select_snapshot
  ADD COLUMN ally_champion_ids TEXT NOT NULL DEFAULT '[]';
