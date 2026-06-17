# IPC Contract: Language Setting

**Branch**: `003-multi-language-support` | **Phase**: 1 | **Date**: 2026-06-17

## Overview

This document describes the single new IPC channel added by this feature: `settings:setLanguage`. All existing channels (`settings:get`, `settings:setManualRole`, `settings:setStatsFreshnessHours`) are unchanged; the `SETTINGS_GET` response is extended with a new `language` field.

---

## Updated Response: `settings:get` → `AppSettings`

The existing `SETTINGS_GET` channel (`settings:get`) returns an `AppSettings` object. One field is added:

| Field | Type | Description |
|-------|------|-------------|
| `language` | `'en' \| 'es'` | The user's currently stored interface language. Always populated (never null) after the first launch — the main process runs `initLanguageIfUnset` before the window opens. |

All other fields (`manualRole`, `statsFreshnessHours`, `lastStatsFetchAt`, `lastStatsFetchStatus`) are unchanged.

**Example response** (extended):
```json
{
  "manualRole": null,
  "statsFreshnessHours": 24,
  "lastStatsFetchAt": "2026-06-17T14:00:00.000Z",
  "lastStatsFetchStatus": "success",
  "language": "es"
}
```

---

## New Channel: `settings:setLanguage`

**Constant**: `IPC.SETTINGS_SET_LANGUAGE = 'settings:setLanguage'`  
**Direction**: Renderer → Main (invoke/response)  
**Type**: `INVOKE_CHANNELS` (request/response, not an event)

### Request

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | `'en' \| 'es'` | The language to activate. Must be a valid `Language` value. |

### Response

`void` — the call resolves with no value when the write completes.

### Preload bridge exposure

```ts
// window.api.settings (additions only)
settings: {
  // ... existing methods unchanged ...
  setLanguage: (language: Language) => invoke<void>(IPC.SETTINGS_SET_LANGUAGE, language)
}
```

### IPC handler (main process)

```ts
// createHandlerMap additions only
[IPC.SETTINGS_SET_LANGUAGE]: (language: Language) => deps.settings.setLanguage(language)
```

### SettingsRepository additions

```ts
// new method
setLanguage(language: Language): void
  // SQL: UPDATE app_settings SET language = ? WHERE id = 1

// new method (called on first launch only)
initLanguageIfUnset(language: Language): void
  // SQL: UPDATE app_settings SET language = ? WHERE id = 1 AND language IS NULL
```

---

## Whitelisting

The new channel must be added to `INVOKE_CHANNELS` in `src/shared/ipcChannels.ts`:

```ts
export const INVOKE_CHANNELS: readonly IpcChannel[] = [
  // ... existing channels ...
  IPC.SETTINGS_SET_LANGUAGE   // NEW
]
```

Without this addition, the preload's `invoke()` guard will reject the call with a "non-whitelisted channel" error.

---

## Error Cases

| Condition | Behaviour |
|-----------|-----------|
| `language` is not `'en'` or `'es'` | SQLite's `CHECK` constraint raises an error; the IPC call rejects with that error. The renderer should validate before calling. |
| DB unavailable | IPC call rejects; renderer catches and stays on current locale. |

---

## No New Push-Event Channel

Language changes are triggered by the user in the Settings UI, so no push-event channel is needed — the renderer updates its own `useLocale` state immediately after the IPC call resolves (identical to how `setManualRole` works today). No other windows are affected.
