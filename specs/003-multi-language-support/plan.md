# Implementation Plan: Multi-Language Support

**Branch**: `003-multi-language-support` | **Date**: 2026-06-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-multi-language-support/spec.md`

## Summary

Add English and Spanish language support to the LoL Best Picker UI. All app-authored interface strings are extracted into typed TypeScript translation catalogs and looked up through a hand-rolled `useLocale` reactive composable (no new runtime dependency). The user's language choice is persisted in SQLite via a new `language` column on the existing `app_settings` table, added through migration 003. On first launch, the OS locale is detected in the Electron main process and written as the default. Language switching is live (no restart required) and driven through one new IPC channel (`settings:setLanguage`).

## Technical Context

**Language/Version**: TypeScript 5.7, Node 22, Chromium (via Electron 31)

**Primary Dependencies**: Electron 31, Vue 3.5 (Composition API), Vuetify 3.7, better-sqlite3 12 — **no new runtime dependency added** (Constitution VII)

**Storage**: SQLite via better-sqlite3 — `app_settings` table extended with a `language` column via migration 003

**Testing**: Vitest 2 (unit tests for `SettingsRepository` language methods and `useLocale` composable)

**Target Platform**: Windows desktop (Electron)

**Performance Goals**: Language switch must complete (locale ref update + Vue re-render) within the 1 second budget in FR-004 / SC-002. Catalog lookup is O(1) key access — no measurable overhead on the recommendation hot path.

**Constraints**: Constitution III (local-first, no telemetry), Constitution VII (no new runtime dep), Constitution IV (no changes to `src/recommendation/`)

**Scale/Scope**: ~59 translation keys across 3 screens + 1 shared component; 2 languages; single Electron window

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Pool-Constrained Recommendations | ✅ Pass | No effect — recommendation logic (`src/recommendation/`) is untouched |
| II — Riot API & LCU Compliance | ✅ Pass | No effect — no new LCU/Riot API interactions |
| III — Local-First | ✅ Pass | Catalogs bundled; language stored in SQLite; no third-party translation service |
| IV — Business Logic Isolation | ✅ Pass | No changes to `src/recommendation/` |
| V — Real-Time Responsiveness | ✅ Pass | Language switching is a rare settings action, not on the champion-select hot path |
| VI — Test-First (Recommendation) | ✅ Pass | No recommendation logic changes |
| VII — Minimal Dependencies | ✅ Pass | Roll own composable; zero new runtime deps |

**Post-design re-check**: All gates still pass. The design introduces no Electron/LCU interactions, no new external network calls, and no changes to recommendation scoring or pool filtering.

## Project Structure

### Documentation (this feature)

```text
specs/003-multi-language-support/
├── plan.md              # This file
├── research.md          # Phase 0: i18n approach, persistence, OS detection decisions
├── data-model.md        # Phase 1: Language type, AppSettings extension, app_settings migration
├── contracts/
│   └── ipc-settings-language.md  # Phase 1: settings:setLanguage IPC contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts                   # Add Language type; extend AppSettings with language field
│   └── ipcChannels.ts             # Add SETTINGS_SET_LANGUAGE channel + whitelist entry
├── main/
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 003_add_language.sql         # ALTER TABLE app_settings ADD COLUMN language
│   │   └── repositories/
│   │       └── settingsRepository.ts        # Add setLanguage() + initLanguageIfUnset()
│   ├── ipc/
│   │   └── handlerMap.ts                    # Add SETTINGS_SET_LANGUAGE handler
│   └── index.ts                             # Call initLanguageIfUnset() after initDatabase()
├── preload/
│   └── index.ts                             # Expose settings.setLanguage on contextBridge
└── renderer/
    └── src/
        ├── i18n/
        │   ├── types.ts                     # Catalog interface (all ~59 message keys)
        │   ├── en.ts                        # English message catalog
        │   ├── es.ts                        # Spanish message catalog
        │   └── useLocale.ts                 # Reactive locale composable (singleton module)
        ├── composables/
        │   └── useSettings.ts               # Add setLanguage() action
        ├── App.vue                          # Initialize locale on mount; translate nav labels
        ├── pages/
        │   ├── PoolManagementView.vue        # Replace all hardcoded strings with t()
        │   ├── ChampSelectView.vue          # Replace all hardcoded strings with t()
        │   └── SettingsView.vue             # Replace strings + add Language Picker card
        └── components/
            └── FreshnessIndicator.vue        # Replace hardcoded strings with t() / d()

tests/
└── unit/
    ├── settingsRepository.language.test.ts  # Unit: setLanguage, initLanguageIfUnset
    └── useLocale.test.ts                    # Unit: t() fallback, n(), d(), setLocale
```

**Structure Decision**: Single-project Electron app with the existing `src/main` + `src/renderer` split. The new `src/renderer/src/i18n/` directory groups all locale concerns. No new top-level project directory is introduced.

## Complexity Tracking

> No constitution violations — this section is intentionally empty.
