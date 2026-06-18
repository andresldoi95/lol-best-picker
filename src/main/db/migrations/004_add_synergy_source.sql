-- Migration 004 — Live Synergy Data via Browser Rendering (spec 004 data-model.md §1–2).
-- Three additive, non-destructive changes (Constitution III — never drops user data):
--   1. `champion_synergy.source` — how each synergy row was obtained.
--   2. `app_settings.last_synergy_fetch_at`    — when synergy rendering last ran.
--   3. `app_settings.last_synergy_fetch_status` — outcome of the last render attempt.

-- Track the provenance of each cached synergy row:
--   'static'   = parsed from the static Qwik JSON (prior provider — always returned []);
--   'rendered' = extracted from the fully-rendered DOM via a hidden BrowserWindow (this feature).
-- Existing rows correctly default to 'static' (they predate DOM rendering).
ALTER TABLE champion_synergy
  ADD COLUMN source TEXT NOT NULL DEFAULT 'static';

-- Synergy-specific freshness tracking, paralleling last_stats_fetch_at/status.
-- Both NULL until the first render attempt completes.
ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_at TEXT;       -- ISO-8601 timestamp; NULL = never attempted

ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_status TEXT;   -- 'rendered' | 'error'; NULL = never attempted
