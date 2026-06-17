# Research: Multi-Language Support

**Branch**: `003-multi-language-support` | **Phase**: 0 | **Date**: 2026-06-17

## Decision 1 — i18n Approach: Roll Own Composable

**Decision**: Implement i18n using a hand-rolled Vue 3 composable (`useLocale`) backed by TypeScript message catalogs. Do NOT add `vue-i18n` as a runtime dependency.

**Rationale**: Constitution VII requires any new runtime dep to be justified against what the stack already provides. Vue 3's reactivity system (a module-level `ref<Language>`) plus Node/Chromium's native `Intl.NumberFormat` / `Intl.DateTimeFormat` APIs cover all spec requirements:
- Reactive string lookup: `ref` + derived functions
- Locale-sensitive percentages: `Intl.NumberFormat`
- Locale-sensitive timestamps: `Intl.DateTimeFormat`

For 2 languages and ~70 UI strings, a well-structured hand-rolled composable is no harder to maintain than a full library, and it avoids `vue-i18n`'s ~50 KB bundle addition, its upgrade/migration surface, and its learning curve for future contributors.

**Alternatives considered**:
- `vue-i18n` v9 (the official Vue 3 i18n library): rejected because the feature's scope (2 languages, ~70 strings) doesn't justify the dependency, and the native `Intl` APIs handle all locale-sensitive formatting needs.
- `i18next` with `i18next-vue`: rejected for the same reasons — larger footprint, more surface area.

---

## Decision 2 — Catalog Format: TypeScript with Typed Interface

**Decision**: Define a single `Catalog` interface in a shared types file, then export each language's messages as a TypeScript object satisfying that interface. Use flat camelCase keys (e.g., `poolTitle`, `navChampSelect`).

**Rationale**: TypeScript's structural typing means that if a key is missing from the Spanish catalog, `tsc` (or `vue-tsc`) will report a compile error — zero chance of shipping a blank string in production. JSON files cannot provide this guarantee without additional tooling.

Flat keys are preferred over nested keys because they allow `keyof Catalog` as the argument type of `t()`, which gives call-site type checking (passing an unknown key is a compile error) without the complexity of recursive path types.

**Alternatives considered**:
- JSON files with a separate schema validator: rejected — extra tooling, no compile-time guarantee in the standard `typecheck` script.
- Nested TypeScript object with recursive path types: rejected — significant type complexity for minimal UX gain; flat keys are readable enough.

---

## Decision 3 — Language Persistence: Extend `app_settings` SQLite Table

**Decision**: Add a `language` column to the existing `app_settings` table via migration `003_add_language.sql`. The column stores `'en'` or `'es'` and defaults to `NULL` (unset). During app initialization (before the renderer opens), the main process calls `settings.initLanguageIfUnset(detectedLang)` once to write the OS-detected default.

**Rationale**: The language preference is a user setting like `manual_role` and `stats_freshness_hours` — storing it in the same single-row `app_settings` table keeps the storage model simple and consistent (Constitution III: SQLite is the source of truth). No new table is needed.

The "write once on first launch" pattern for OS locale detection avoids plumbing the OS locale through every subsequent `SETTINGS_GET` IPC call and keeps `AppSettings` always non-null for language.

**Alternatives considered**:
- Store language in a separate JSON config file alongside the DB: rejected — Constitution III says SQLite is the single source of truth for app preferences; a parallel file contradicts that.
- Detect OS locale on every startup and use it when no saved preference exists: rejected — would require `AppSettings.language` to be nullable everywhere in the renderer, adding null-checks throughout the UI code.

---

## Decision 4 — OS Locale Detection: `app.getLocale()` in Main Process on Startup

**Decision**: On startup (inside `initDatabase()` or a post-init step in `main/index.ts`), call `app.getLocale()` from Electron's `app` module. Map the returned locale string to a `Language` by checking if it starts with `'es'` (→ `'es'`) and defaulting to `'en'` otherwise. Call `settings.initLanguageIfUnset(detected)` to write this default only if the column is currently NULL.

**Rationale**: `app.getLocale()` is the standard Electron API for reading the OS/display language. The prefix-match strategy (`startsWith('es')`) correctly handles regional variants like `es-ES`, `es-MX`, `es-419`, etc. (spec assumption). No IPC round-trip from the renderer is needed — the language is included in the existing `SETTINGS_GET` response.

**Alternatives considered**:
- Expose OS locale via a new IPC channel and detect in the renderer: rejected — unnecessary IPC round-trip; main process already calls `app.getLocale()` at startup before the window opens.
- Use `navigator.language` in the renderer (Chromium's locale): rejected — Electron Chromium's locale is not always the same as the OS display language; `app.getLocale()` is the reliable source.

---

## Decision 5 — Vuetify Built-In Text: Sync Vuetify Locale

**Decision**: When the app locale changes, also update Vuetify's internal locale using the `useLocale()` composable exported by Vuetify (`import { useLocale } from 'vuetify'`). This ensures Vuetify-generated text (e.g., autocomplete's "No data available" message in the Pool screen's champion search) respects the selected language.

**Rationale**: Vuetify 3 ships Spanish translations under `vuetify/locale/es`. The `useLocale` composable from Vuetify gives a `current` writable ref. Setting `current.value = 'es'` causes all Vuetify components to re-render their internal text in Spanish. Without this, English Vuetify strings would bleed through even when the app is in Spanish mode.

**Implementation note**: There is a name collision — the app's own `useLocale` composable and Vuetify's `useLocale` composable share the same name. They must be imported with different aliases (e.g., `import { useLocale as useVuetifyLocale } from 'vuetify'`).

**Alternatives considered**:
- Ship custom Vuetify locale messages alongside our own catalog: rejected — duplicates what Vuetify already ships; maintenance burden.
- Ignore Vuetify internal strings: rejected — the champion autocomplete "No data available" message is visible during normal pool management; leaving it in English when the app is in Spanish would fail SC-001.

---

## String Inventory (Scope Reference)

Catalog keys identified by screen (non-champion-name strings only):

**App shell / navigation** (~5 keys): app title, nav labels (Pool, Champ Select, Settings)

**Pool Management** (~15 keys): screen title, subtitle, champion search label/placeholder, role labels (Top/Jungle/Middle/Bottom/Support — shared across screens), Add button, "inactive" chip label, empty-role message, aria-labels for remove buttons

**Champ Select** (~20 keys): screen title, subtitle, role override label, "Auto-detect" button, "Allies locked in" label, "Enemies revealed" label, loading indicator, role-selection prompt, empty-pool alert, "Best Pick" label, score labels (Overall win rate, Enemy matchup, Ally synergy, combined score), signal weight labels ("Not available"), "inactive" chip, breakdown summary format strings, Live chip label

**Settings** (~12 keys): screen title, Role Override card title/subtitle, Clear button, Statistics Freshness card title/subtitle, freshness field label/save button, last-fetch status text (two patterns: fetched / not-yet-fetched)

**Freshness Indicator** (~7 keys): freshness labels (Live/Cached/Stale), relative-time patterns (just now, Xm ago, Xh ago, Xd ago), "No successful stats fetch yet" tooltip

**Total**: ~59 catalog keys
