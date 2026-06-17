# Feature Specification: Multi-Language Support

**Feature Branch**: `003-multi-language-support`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "we need to add multipanguage feature, for now Spanish and English!"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View the App in My Preferred Language (Priority: P1)

As a League player who is more comfortable in Spanish (or English), I want to choose the language the app's interface is shown in, so that I can read recommendations, labels, and settings comfortably in my own language during the fast-paced champion select.

**Why this priority**: This is the core of the feature. Without the ability to render the full interface in a chosen language, nothing else in this feature has value. It directly serves users who are not comfortable reading the current single-language interface.

**Independent Test**: Set the language to Spanish in Settings and confirm every screen (Pool, Champ Select, Settings) — including controls, labels, and status messages — displays in Spanish; switch to English and confirm everything displays in English.

**Acceptance Scenarios**:

1. **Given** the app language is set to English, **When** the user opens the Pool, Champ Select, and Settings screens, **Then** all interface text (titles, navigation, buttons, labels, tooltips, status messages) appears in English.
2. **Given** the app language is set to Spanish, **When** the user opens those same screens, **Then** all interface text appears in Spanish.
3. **Given** a screen shows a status or empty-state message (for example, a "last updated" freshness indicator or a "no recommendation available" notice), **When** it is viewed in the selected language, **Then** that message is also presented in the selected language.

---

### User Story 2 - Switch Language Anytime and Have It Remembered (Priority: P2)

As a user, I want to change the interface language from a clearly discoverable setting, have the whole app update immediately without restarting, and have my choice remembered the next time I open the app, so that I configure it once and never think about it again.

**Why this priority**: Persistence and live switching are what make the feature usable day to day. Without persistence the user reconfigures on every launch; without live switching the change feels broken. This builds directly on US1.

**Independent Test**: Change the language in Settings and observe the open UI update immediately; then close and relaunch the app and confirm the previously selected language is still in effect.

**Acceptance Scenarios**:

1. **Given** the app is open and displayed in English, **When** the user selects Spanish in Settings, **Then** the visible interface updates to Spanish without requiring an application restart.
2. **Given** the user selected Spanish previously, **When** the user closes and relaunches the app, **Then** the app opens in Spanish.
3. **Given** the user is in champion select with recommendations on screen, **When** the user switches language, **Then** the recommendation panel and its labels update to the new language while the current recommendation state is preserved.

---

### User Story 3 - Sensible Language on First Launch (Priority: P3)

As a first-time user, I want the app to start in my system's language when it is one of the supported languages, so that I can understand the interface immediately without first hunting for a language setting.

**Why this priority**: This improves the first-run experience but is not essential — a user can always switch manually (US2). It is a refinement layered on top of the core capability and persistence.

**Independent Test**: With no prior language preference saved and the operating system set to a Spanish locale, launch the app and confirm it opens in Spanish; repeat with an unsupported locale and confirm it opens in English.

**Acceptance Scenarios**:

1. **Given** no language preference has been saved yet and the system language is Spanish, **When** the app launches for the first time, **Then** the app displays in Spanish.
2. **Given** no language preference has been saved yet and the system language is English, **When** the app launches, **Then** the app displays in English.
3. **Given** no language preference has been saved yet and the system language is neither Spanish nor English (for example, German), **When** the app launches, **Then** the app displays in English as the default fallback.
4. **Given** a language preference has already been saved, **When** the app launches, **Then** the saved preference takes precedence over the system language.

---

### Edge Cases

- **Missing translation for a specific string**: the system falls back to the English text for that one string, so the user never sees a blank, a raw identifier/key, or broken layout.
- **Champion names and Riot proper nouns**: these are not translated; they display in their canonical form in both languages (e.g., "Ahri", "Lee Sin").
- **Longer translated text**: Spanish strings are frequently longer than their English equivalents; translated text must remain fully readable without clipping, overflow, or breaking the layout of buttons, labels, and panels.
- **Locale-sensitive values**: win-rate percentages and "last updated" timestamps display using conventions appropriate to the selected language.
- **Regional locale variants**: a system locale such as `es-MX`, `es-ES`, or `en-GB` maps to its base supported language (Spanish or English).
- **Switching language while a notice is on screen**: if the language is changed while a background-fetch status or error notice is displayed, that notice is presented (or re-rendered) in the newly selected language.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support displaying the entire user interface in both English and Spanish.
- **FR-002**: Users MUST be able to select the interface language from a discoverable control in the Settings screen.
- **FR-003**: System MUST present, in both supported languages, all app-authored user-facing text — including screen titles, navigation, buttons, form labels, tooltips, status/freshness indicators, empty states, confirmations, and error/notification messages.
- **FR-004**: System MUST apply a language change to the currently displayed interface without requiring an application restart.
- **FR-005**: System MUST persist the user's selected language locally and reapply it on subsequent launches.
- **FR-006**: System MUST, on first launch when no preference is saved, default to the operating system's language when it is a supported language, and otherwise default to English.
- **FR-007**: System MUST treat a saved language preference as authoritative over the system language on every launch after the first selection.
- **FR-008**: System MUST fall back to the English text for any individual string that lacks a translation in the selected language, without showing blanks or raw identifiers.
- **FR-009**: System MUST keep champion names and Riot proper nouns in their canonical, untranslated form regardless of the selected language.
- **FR-010**: System MUST source all translations from data bundled with the application and MUST NOT contact any third-party translation service or transmit user text externally, consistent with the local-first and no-third-party-telemetry principles.
- **FR-011**: System MUST display each selectable language using its own name (e.g., "English", "Español").
- **FR-012**: System MUST format locale-sensitive values (percentages and "last updated" dates/timestamps) according to the conventions of the selected language.

### Key Entities *(include if feature involves data)*

- **Supported Language**: an interface language the app can render. Attributes: language identifier, self-name (the label shown in the language's own form). Initial set: English and Spanish.
- **Language Preference**: the user's chosen interface language. Attributes: selected language, origin (explicit user choice vs. system-derived default), stored locally as part of app settings.
- **Localized Text Catalog**: the collection of translated user-facing strings for a given language. Attributes: language, message key, translated text. Bundled with the app; the English catalog serves as the fallback for missing translations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For both English and Spanish, 100% of app-authored user-facing strings display in the selected language, with zero visible untranslated text across the Pool, Champ Select, and Settings screens.
- **SC-002**: Switching the language updates the entire visible interface within 1 second and with no application restart.
- **SC-003**: The selected language persists across app restarts 100% of the time.
- **SC-004**: On first launch with no saved preference, the app opens in the system language when it is supported (Spanish or English) and in English otherwise — verified across at least one Spanish, one English, and one unsupported system locale.
- **SC-005**: A new user can locate and change the interface language in the Settings screen within 30 seconds and 3 or fewer interactions.
- **SC-006**: Every missing translation falls back to readable English text — zero strings ever appear blank or as a raw placeholder identifier.

## Assumptions

- Scope is limited to two languages — English and Spanish — while leaving room to add more languages later; no other languages are in scope for this feature.
- "Translation" covers app-authored interface text only. Data from the external statistics source is localized for formatting (percentages, timestamps) but its values are not translated; champion names and Riot proper nouns remain canonical.
- The language preference is stored with the app's other local settings (the local store remains the source of truth); no new external storage is introduced.
- Translations are bundled with the application and loaded locally, consistent with the local-first and no-third-party-telemetry principles; no runtime translation service is used.
- English is the fallback language for any string missing a Spanish translation, and the default when the system locale is unsupported.
- Live language switching affects only how the interface is presented; champion select detection, recommendation logic, and data-freshness behavior are unchanged — the recommendations themselves do not change, only their presentation.
- Both supported languages are left-to-right; right-to-left layout support is out of scope.
- System-locale detection maps regional variants (e.g., `es-ES`, `es-MX`, `en-GB`) to their base supported language.
