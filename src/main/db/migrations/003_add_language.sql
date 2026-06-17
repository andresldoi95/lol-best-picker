-- Migration 003 — Multi-Language Support (spec 003 data-model.md § Modified Table: app_settings).
-- One additive, non-destructive change: add a `language` column to the single-row
-- `app_settings` table. The default is NULL (not 'en') so the main process can
-- distinguish "not yet initialized" (→ seed from OS locale via initLanguageIfUnset)
-- from "user explicitly chose English". After first launch the column always holds
-- a valid Language value.
ALTER TABLE app_settings ADD COLUMN language TEXT
  CHECK (language IN ('en', 'es'));
