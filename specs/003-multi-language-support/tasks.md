# Tasks: Multi-Language Support

**Input**: Design documents from `/specs/003-multi-language-support/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ipc-settings-language.md ✅

**Organization**: Tasks grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on in-progress tasks)
- **[Story]**: Which user story this task belongs to (US1/US2/US3 from spec.md)
- File paths relative to repository root

---

## Phase 1: Setup (Shared Types and Constants)

**Purpose**: Add the shared `Language` type and IPC constants that every subsequent task depends on. These are pure type/constant additions — no logic, no side effects. All three tasks touch different files and can run in parallel.

- [X] T001 [P] Add `Language` union type (`'en' | 'es'`) and extend `AppSettings` with `language: Language` field in `src/shared/types.ts` (per data-model.md § Modified Type: AppSettings)
- [X] T002 [P] Add `SETTINGS_SET_LANGUAGE: 'settings:setLanguage'` constant to the `IPC` object and append `IPC.SETTINGS_SET_LANGUAGE` to `INVOKE_CHANNELS` in `src/shared/ipcChannels.ts` (per contracts/ipc-settings-language.md § Whitelisting)
- [X] T003 [P] Create `src/main/db/migrations/003_add_language.sql` with `ALTER TABLE app_settings ADD COLUMN language TEXT CHECK (language IN ('en', 'es'))` (per data-model.md § Modified Table: app_settings)

**Checkpoint**: Shared type contract is in place — all subsequent tasks compile against it.

---

## Phase 2: Foundational (Locale Infrastructure and Persistence Layer)

**Purpose**: Build the rendering infrastructure (`Catalog` → `useLocale`) and persistence infrastructure (SQLite methods → IPC handler → preload → composable action) that all user stories need. **No user story implementation can proceed until this phase is complete.**

- [X] T004 Define the `Catalog` interface in `src/renderer/src/i18n/types.ts` listing all ~59 flat camelCase message keys for the app shell, Pool, Champ Select, Settings, and FreshnessIndicator (per research.md § String Inventory and data-model.md § New Entity: Catalog) — depends on T001
- [X] T005 [P] Create English message catalog in `src/renderer/src/i18n/en.ts` exporting a const object satisfying `Catalog` with all ~59 English strings — depends on T004
- [X] T006 [P] Create Spanish message catalog in `src/renderer/src/i18n/es.ts` exporting a const object satisfying `Catalog` with all ~59 Spanish strings — depends on T004
- [X] T007 Create `src/renderer/src/i18n/useLocale.ts` singleton composable exporting: `locale` (readonly `Ref<Language>`), `t(key: keyof Catalog): string` with English fallback for missing keys, `n(value: number, style: 'decimal1' | 'percent'): string` using `Intl.NumberFormat`, `d(isoString: string): string` using `Intl.DateTimeFormat`, and `setLocale(lang: Language): void` — depends on T004, T005, T006
- [X] T008 [P] Add `setLanguage(language: Language): void` and `initLanguageIfUnset(language: Language): void` methods to `src/main/db/repositories/settingsRepository.ts`; update `get()` to read and return the `language` column — depends on T001, T003
- [X] T009 Register `SETTINGS_SET_LANGUAGE` handler in `src/main/ipc/handlerMap.ts` calling `deps.settings.setLanguage(language)` — depends on T002, T008
- [X] T010 [P] Expose `settings.setLanguage: (language: Language) => invoke<void>(IPC.SETTINGS_SET_LANGUAGE, language)` on the contextBridge API in `src/preload/index.ts` — depends on T002
- [X] T011 Add `setLanguage(lang: Language): Promise<void>` action to `src/renderer/src/composables/useSettings.ts` (calls `window.api.settings.setLanguage(lang)` then `load()`) — depends on T010
- [X] T012 [P] Register migration `003_add_language` in `src/main/db/migrations/index.ts` by importing the new SQL file and appending it to the `migrations` array — depends on T003

**Checkpoint**: Foundation ready. Locale system exists; persistence wired from SQLite through IPC to renderer composable.

---

## Phase 3: User Story 1 — View the App in My Preferred Language (Priority: P1) 🎯 MVP

**Goal**: Every app-authored UI string in all three screens and the FreshnessIndicator renders in the locale currently active in `useLocale`. The locale is initialized from `settings.language` on mount.

**Independent Test**: Load the app with `useLocale.setLocale('es')` called in App.vue's `onMounted` (temporarily hardcoded), and confirm every screen — Pool, Champ Select, Settings, nav, freshness chip and relative-time text — displays in Spanish. Switch to `'en'` and confirm all strings return to English.

- [X] T013 [P] [US1] Update `src/renderer/src/App.vue` to call `useLocale.setLocale(settings.value.language)` in `onMounted` after `useSettings.load()`; add a `watch` on `settings.value?.language` that calls `setLocale()` on change; also call Vuetify's locale `current.value` using `import { useLocale as useVuetifyLocale } from 'vuetify'` to sync Vuetify built-in strings; translate the three `navItems` labels using `t()` — depends on T007, T011
- [X] T014 [P] [US1] Update `src/renderer/src/pages/PoolManagementView.vue` to replace all hardcoded UI strings (screen title, subtitle, champion search label and placeholder, role labels, Add button, "inactive" chip label, empty-role card text, remove button aria-labels) with `t()` calls from `useLocale` — depends on T007
- [X] T015 [P] [US1] Update `src/renderer/src/pages/ChampSelectView.vue` to replace all hardcoded UI strings (screen title, subtitle, role override label, Auto-detect button, "Allies locked in", "Enemies revealed", role-selection prompt alert, empty-pool alert, "Best Pick" overline, score labels including "Overall win rate", "Enemy matchup", "Ally synergy", "combined score", "Not available", "inactive" chip, Live chip) with `t()` calls; replace `${score.toFixed(1)}%` in `formatScore()` with `n(score, 'decimal1') + '%'` using `useLocale` — depends on T007
- [X] T016 [P] [US1] Update `src/renderer/src/pages/SettingsView.vue` to replace all hardcoded strings (screen title, "Role Override" card title and subtitle, "Clear (auto-detect role)" button, "Statistics Freshness" card title and subtitle, freshness field label, Save button, last-fetch status text patterns in `lastFetchText`) with `t()` calls; replace `new Date(at).toLocaleString()` in `lastFetchText` with `d(at)` from `useLocale` — depends on T007
- [X] T017 [P] [US1] Update `src/renderer/src/components/FreshnessIndicator.vue` to replace hardcoded freshness chip labels ("Live", "Cached", "Stale") and all relative-time strings ("never updated", "updated just now", "updated Xm ago", "updated Xh ago", "updated Xd ago", "No successful stats fetch yet") with `t()` calls; replace `new Date(props.lastUpdatedAt).toLocaleString()` in `absoluteTimestamp` with `d(props.lastUpdatedAt)` from `useLocale` — depends on T007
- [X] T018 [US1] Write unit tests for `useLocale` composable in `tests/unit/useLocale.test.ts`: (1) `t()` returns the correct English string for a known key; (2) `t()` returns the correct Spanish string after `setLocale('es')`; (3) `t()` falls back to English when a key is missing from the Spanish catalog; (4) `t()` returns the raw key string when the key is missing from both catalogs; (5) `n()` formats a decimal number correctly in each locale; (6) `d()` formats an ISO timestamp correctly in each locale — depends on T007

**Checkpoint**: All app screens display fully in Spanish when locale is set to `'es'`. No hardcoded English strings remain in any component. US1 acceptance scenarios 1–3 pass.

---

## Phase 4: User Story 2 — Switch Language Anytime and Have It Remembered (Priority: P2)

**Goal**: The Settings screen has a Language Picker. Selecting a language updates the entire UI immediately (no restart), and the choice is written to SQLite so the app reopens in the same language.

**Independent Test**: Open Settings, switch to Spanish — confirm the UI updates immediately. Close and relaunch — confirm app opens in Spanish. Switch back to English — confirm the UI returns to English instantly.

- [X] T019 [US2] Add a "Language" card to `src/renderer/src/pages/SettingsView.vue`: a `v-select` or `v-btn-toggle` with options `{ value: 'en', title: 'English' }` and `{ value: 'es', title: 'Español' }` bound to `settings.value.language`; on selection call `await setLanguage(newLang)` from `useSettings`, then call `useLocale.setLocale(newLang)` — the `watch` in App.vue (T013) also reacts to the updated `settings.language` so the live switch is doubly covered — depends on T011, T016
- [X] T020 [P] [US2] Write unit tests for `SettingsRepository` language methods in `tests/unit/settingsRepository.language.test.ts`: (1) `get()` returns `language` from the database; (2) `setLanguage('es')` writes `'es'` and `get()` returns it; (3) `initLanguageIfUnset('en')` writes `'en'` when column is NULL; (4) `initLanguageIfUnset('en')` does NOT overwrite an existing `'es'` value — depends on T008

**Checkpoint**: Language selection in Settings is live, persisted, and surviving a restart. US2 acceptance scenarios 1–3 pass.

---

## Phase 5: User Story 3 — Sensible Language on First Launch (Priority: P3)

**Goal**: On first launch (no saved preference), the app opens in the OS's language when it is supported (Spanish or English), and in English otherwise. After any explicit user choice, the saved preference always wins.

**Independent Test**: Delete or zero the `language` column in the SQLite DB; launch with OS locale set to a Spanish locale (e.g., `es-ES`) and verify the app opens in Spanish. Repeat with an unsupported locale (e.g., `de`) and verify English. Then set language to Spanish in Settings, relaunch with OS locale `en-US`, and verify the app still opens in Spanish.

- [X] T021 [US3] Add OS locale detection to `src/main/index.ts`: after `initDatabase()` and before creating the browser window, call `app.getLocale()`, map the result to `Language` by checking `startsWith('es')` → `'es'` otherwise `'en'`, then call `settingsRepository.initLanguageIfUnset(detected)` — depends on T008, T012

**Checkpoint**: First-launch language detection works for all three locale scenarios. US3 acceptance scenarios 1–4 pass.

---

## Phase 6: Polish and Cross-Cutting Concerns

**Purpose**: Type safety verification, test suite validation, and developer documentation.

- [X] T022 [P] Run `npm run typecheck` and resolve any type errors in modified files (`src/shared/types.ts`, `src/shared/ipcChannels.ts`, `src/main/db/repositories/settingsRepository.ts`, `src/main/ipc/handlerMap.ts`, `src/preload/index.ts`, `src/renderer/src/i18n/*.ts`, all updated `.vue` files)
- [X] T023 [P] Run `npm test` and confirm all Vitest tests pass including the new `useLocale.test.ts` and `settingsRepository.language.test.ts`
- [X] T024 Create `specs/003-multi-language-support/quickstart.md` documenting: how to add a new translation key (update `Catalog` interface + both catalogs), how to add a new language (add `Language` union value + migration check constraint + catalog file + Vuetify locale import), and how to verify translations manually in development

---

## Dependencies and Execution Order

### Phase Dependencies

```
Phase 1 (Setup): No dependencies — start immediately; T001/T002/T003 are parallel
Phase 2 (Foundational): Depends on Phase 1 completion
  - T004 starts after T001
  - T005, T006 start after T004 (parallel)
  - T007 starts after T005+T006
  - T008 starts after T001+T003 (parallel with T004-T007)
  - T009 starts after T008+T002
  - T010 starts after T002 (parallel with T004-T008)
  - T011 starts after T010
  - T012 starts after T003 (parallel with T004-T011)
Phase 3 (US1): Depends on T007 (useLocale), T011 (useSettings.setLanguage), T013 watches settings
  - T013 depends on T007, T011
  - T014, T015, T016, T017, T018 depend on T007 and can all run in parallel with each other
Phase 4 (US2): Depends on T011, T016 (SettingsView updated with t())
  - T019 depends on T011, T016
  - T020 depends on T008 (parallel with T019)
Phase 5 (US3): Depends on T008, T012
  - T021 depends on T008, T012
Phase 6 (Polish): Depends on all story phases complete
```

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2 complete. Independent — no dependency on US2 or US3.
- **US2 (P2)**: Starts after Phase 2 complete. Builds on US1 (T019 adds to SettingsView already updated by T016).
- **US3 (P3)**: Starts after Phase 2 complete. Fully independent of US1 and US2 — only needs the repository method from T008 and migration from T012.

### Parallel Opportunities

Within Phase 1: T001, T002, T003 all run in parallel (three different files)

Within Phase 2: 
- Track A (i18n): T004 → T005 ∥ T006 → T007
- Track B (persistence): T008 → T009, T010 → T011, T012
- Tracks A and B are fully parallel (different files)

Within Phase 3 (US1): T014, T015, T016, T017, T018 all run in parallel (different files); T013 depends on T007+T011 but can overlap with T014-T018

Within Phase 6: T022, T023 parallel; T024 independent

---

## Parallel Example: Phase 2

```
# Two parallel tracks after Phase 1:

Track A — i18n infrastructure:
  Task T004: Define Catalog interface in src/renderer/src/i18n/types.ts
  Then parallel:
    Task T005: Create src/renderer/src/i18n/en.ts
    Task T006: Create src/renderer/src/i18n/es.ts
  Then:
    Task T007: Create src/renderer/src/i18n/useLocale.ts

Track B — persistence infrastructure (all parallel with Track A):
  Task T008: Update src/main/db/repositories/settingsRepository.ts
  Task T009: Update src/main/ipc/handlerMap.ts (after T008)
  Task T010: Update src/preload/index.ts
  Task T011: Update src/renderer/src/composables/useSettings.ts (after T010)
  Task T012: Update src/main/db/migrations/index.ts
```

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T012)
3. Complete Phase 3: User Story 1 (T013–T018)
4. **STOP and VALIDATE**: Verify all three screens render correctly in both English and Spanish by calling `setLocale('es')` from App.vue and inspecting each screen.
5. Run `npm run typecheck` and `npm test`.

At this point the app is fully translated; it just doesn't have a UI to change the language yet.

### Incremental Delivery

1. Phase 1+2 → Foundation complete
2. Phase 3 (US1) → App fully translatable; locale switchable via composable call. **Demo-able.**
3. Phase 4 (US2) → User-accessible language picker; preference persists. **Shippable.**
4. Phase 5 (US3) → First-launch OS detection. **Complete.**
5. Phase 6 → Polish.

---

## Notes

- **No new runtime dependencies**: the entire i18n system uses Vue 3 reactivity + native `Intl` APIs (Constitution VII).
- **Type-safe catalogs**: `keyof Catalog` on `t()` means a missing key is a compile error, not a blank string at runtime. Add both the key to `Catalog` (T004) and both catalogs (T005, T006) atomically.
- **Vuetify locale sync** (T013): Import `useLocale as useVuetifyLocale` from `'vuetify'` to avoid name collision with the app's own `useLocale`. Setting `current.value` on the Vuetify composable changes built-in Vuetify strings (e.g., autocomplete's "No data available").
- **Migration 003** (T003, T012): Additive only — `ALTER TABLE ... ADD COLUMN` never drops data (Constitution III).
- **`initLanguageIfUnset` is idempotent** (T008): The SQL `WHERE language IS NULL` guard ensures repeated app launches never overwrite an explicit user choice.
- **Score formatting** (T015): Replace `score.toFixed(1) + '%'` with `n(score, 'decimal1') + '%'` — in Spanish locale, the decimal separator is a comma, so "53.2%" becomes "53,2%".
