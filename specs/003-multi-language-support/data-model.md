# Data Model: Multi-Language Support

**Branch**: `003-multi-language-support` | **Phase**: 1 | **Date**: 2026-06-17

## Summary of Changes

This feature adds a single new field to the existing `app_settings` table and two new types to the shared type catalog. No tables are added or removed; no existing columns are modified. All other existing entities (champions, pool_entries, champion_stats, synergy_stats, champ_select_snapshot) are unchanged.

---

## New Type: `Language`

**Location**: `src/shared/types.ts`

A union of supported language identifiers. Adding a new language in the future means adding a new string literal to this union.

```
Language = 'en' | 'es'
```

| Value | Meaning |
|-------|---------|
| `'en'` | English (default fallback) |
| `'es'` | Spanish |

**Constraints**:
- Must be stored in SQLite as the exact string values above (no other values are valid).
- Drives `AppSettings.language` and the renderer's locale composable.

---

## Modified Type: `AppSettings`

**Location**: `src/shared/types.ts`

Add one field to the existing `AppSettings` interface:

| Field | Type | Description |
|-------|------|-------------|
| `language` | `Language` | User's selected interface language. Set on first launch from OS locale detection; thereafter reflects the user's explicit choice. Never null in the renderer (initialized before the window opens). |

The existing fields (`manualRole`, `statsFreshnessHours`, `lastStatsFetchAt`, `lastStatsFetchStatus`) are unchanged.

---

## Modified Table: `app_settings`

**Migration**: `src/main/db/migrations/003_add_language.sql`

One column is added to the existing single-row `app_settings` table:

| Column | Type | Constraint | Default |
|--------|------|------------|---------|
| `language` | `TEXT` | `CHECK (language IN ('en', 'es'))` | `NULL` |

The default is NULL (not `'en'`) to distinguish "not yet initialized" from "user explicitly chose English". The `initLanguageIfUnset(lang)` method in `SettingsRepository` writes the OS-derived default once on first launch. After that, the column always holds a valid `Language` value.

**Migration SQL** (additive only — no data loss):
```sql
ALTER TABLE app_settings ADD COLUMN language TEXT
  CHECK (language IN ('en', 'es'));
```

---

## New Entity: `Catalog`

**Location**: `src/renderer/src/i18n/types.ts`

The `Catalog` interface defines all translateable UI string keys. Every language's message file must satisfy this interface (enforced at compile time by TypeScript). Adding a key here without updating all catalog files is a compile error.

The catalog is **flat** (no nesting) to allow type-safe key lookup via `keyof Catalog`.

**Key naming convention**: `<screen><Concept>` in camelCase, e.g. `poolTitle`, `settingsRoleOverrideTitle`, `champSelectBestPick`.

The full list of ~59 keys is documented in `research.md § String Inventory`. The definitive enumeration is in the TypeScript `Catalog` interface itself at implementation time.

---

## New Entity: `LocaleComposable` (renderer module)

**Location**: `src/renderer/src/i18n/useLocale.ts`

A module-level singleton (following the same pattern as `useSettings` and `usePool`) that exposes:

| Export | Type | Description |
|--------|------|-------------|
| `locale` | `Readonly<Ref<Language>>` | Currently active language. Reactive — changing it re-renders all consumers. |
| `t(key)` | `(key: keyof Catalog) => string` | Looks up a message key in the current locale's catalog. Falls back to English if the key is missing in the active locale. |
| `n(value, style)` | `(value: number, style: 'decimal1' \| 'percent') => string` | Locale-aware number formatting using native `Intl.NumberFormat`. `'decimal1'` → one decimal place (for win-rate scores); `'percent'` → locale percentage format. |
| `d(isoString)` | `(isoString: string) => string` | Locale-aware date+time formatting using native `Intl.DateTimeFormat`. |
| `setLocale(lang)` | `(lang: Language) => void` | Updates the reactive `locale` ref. Called by the Settings UI and on startup. |

**Fallback contract**: If `lang` is `'es'` and a key is missing from the Spanish catalog, `t()` returns the English string for that key. If the key is absent from both catalogs, `t()` returns the raw key string (so the UI never shows a blank).

---

## Translation Catalog Files

**Location**: `src/renderer/src/i18n/en.ts` and `src/renderer/src/i18n/es.ts`

Each file exports a const object satisfying the `Catalog` interface. They are bundled into the renderer chunk at build time (no runtime fetch, consistent with Constitution III local-first).

The English catalog is authoritative — it is the source from which Spanish strings are derived.

---

## State Transition: Language Selection

```
App launch
  ↓
settings.initLanguageIfUnset(detectedOsLang)   ← main process
  ↓
SETTINGS_GET → AppSettings { language: 'en' | 'es' }
  ↓
useLocale.setLocale(settings.language)         ← renderer App.vue onMounted
  ↓
User changes language in Settings UI
  ↓
window.api.settings.setLanguage(newLang)       ← IPC invoke
  ↓
settings.setLanguage(newLang)                  ← SettingsRepository (SQLite write)
  ↓
useSettings.load() → AppSettings updated
  ↓
useLocale.setLocale(newLang)                   ← locale ref updated
  ↓
All reactive t() / n() / d() calls re-evaluate ← Vue reactivity
```
