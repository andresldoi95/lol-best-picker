# Quickstart: Multi-Language Support

**Branch**: `003-multi-language-support` | **Audience**: developers extending or maintaining the i18n system

This feature adds English/Spanish support via a hand-rolled `useLocale` composable
backed by typed TypeScript catalogs (no `vue-i18n` dependency — Constitution VII).
All locale code lives in `src/renderer/src/i18n/`.

## Architecture at a glance

| File | Role |
|------|------|
| `i18n/types.ts` | `Catalog` interface — the single list of all message keys |
| `i18n/en.ts` | English catalog (`satisfies Catalog`) — the authoritative source |
| `i18n/es.ts` | Spanish catalog (`satisfies Catalog`) |
| `i18n/useLocale.ts` | Singleton composable: `t()`, `n()`, `d()`, `setLocale()`, `locale` |
| `App.vue` | Initializes locale from `settings.language` on mount; syncs Vuetify's locale |
| `SettingsView.vue` | Language picker (writes via `useSettings.setLanguage`) |

Persistence: the choice is stored in the `language` column of the `app_settings`
SQLite table (migration `003_add_language.sql`). On first launch the Electron main
process (`main/index.ts → initLanguageFromOsLocale`) seeds it from `app.getLocale()`.

## How to add a new translation key

Adding a key is atomic across three files — TypeScript enforces it (a missing key
is a compile error, never a blank string at runtime):

1. Add the key to the `Catalog` interface in `i18n/types.ts`.
2. Add the English string to `i18n/en.ts`.
3. Add the Spanish string to `i18n/es.ts`.
4. Use it in a component: `const { t } = useLocale()` then `t('yourNewKey')`.

For strings with dynamic parts, embed a token (e.g. `'No champions for {role}.'`)
and substitute at the call site: `t('yourKey').replace('{role}', roleLabel(role))`.

Run `npm run typecheck` — if you forgot a catalog, `tsc`/`vue-tsc` will tell you.

## How to add a new language

Example: adding French (`'fr'`).

1. **Type**: add `'fr'` to the `Language` union in `src/shared/types.ts`.
2. **Migration**: add a new migration (e.g. `004_*.sql`) that widens the CHECK
   constraint to include `'fr'`. SQLite cannot alter a CHECK in place, so this
   means recreating the column/table — keep it additive and never drop user data
   (Constitution III). Register it in `migrations/index.ts`.
3. **Catalog**: create `i18n/fr.ts` exporting `const fr = { … } satisfies Catalog`
   and add it to the `catalogs` map in `i18n/useLocale.ts`.
4. **Vuetify**: import `fr` from `vuetify/locale` in `renderer/src/main.ts` and add
   it to `createVuetify({ locale: { messages: { …, fr } } })` so built-in Vuetify
   strings follow the new language.
5. **OS detection**: extend the prefix mapping in `initLanguageFromOsLocale`
   (`main/index.ts`) if you want first-launch auto-selection for that locale.
6. **Settings picker**: add `{ value: 'fr', title: 'Français' }` to `languageOptions`
   in `SettingsView.vue`.

## How to verify translations manually

1. Rebuild the native module for Electron: `npm run electron:rebuild`
   (then `npm rebuild better-sqlite3` before running Vitest again — ABI gotcha).
2. `npm run dev`, open **Settings**, switch the Language toggle to **Español**.
3. Confirm every screen updates instantly (no restart): nav labels, Pool, Champ
   Select (including the score breakdown, where `53.2%` becomes `53,2%`), the
   freshness chip and relative-time text, and Vuetify's autocomplete "No data"
   message on the Pool search.
4. Close and relaunch — the app should reopen in the last-selected language.
5. First-launch detection: zero the column (`UPDATE app_settings SET language = NULL`),
   launch with an `es-*` OS locale → app opens in Spanish; an unsupported locale → English.

## Tests

- `tests/unit/useLocale.test.ts` — `t()` fallback chain, `n()`/`d()` formatting.
- `tests/unit/settingsRepository.language.test.ts` — `setLanguage` / `initLanguageIfUnset`
  persistence and the idempotent first-launch guard.
