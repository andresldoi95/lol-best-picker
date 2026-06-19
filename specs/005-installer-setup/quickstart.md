# Quickstart: Windows User-Level Installer (spec 005)

Developer guide for building, packaging, and testing the installer locally.

## What ships where

| Artifact | Location after install |
|----------|------------------------|
| App binaries | `%LOCALAPPDATA%\Programs\LoL Best Picker\` (electron-builder per-user default) |
| SQLite database | `%LOCALAPPDATA%\LolBestPicker\lol-best-picker.db` |
| Env overrides | `%LOCALAPPDATA%\LolBestPicker\.env.local` |
| Install/runtime log | `%LOCALAPPDATA%\LolBestPicker\install.log` |
| Built installer | `release\LoL Best Picker-<version>-setup.exe` |

All user data is consolidated under `%LOCALAPPDATA%\LolBestPicker` so it survives
upgrade/repair/modify and never needs admin rights (FR-001, FR-007, SC-007).

> The app repoints Electron's `userData` to `%LOCALAPPDATA%\LolBestPicker` at
> startup (`src/main/index.ts` → `app.setPath`). In `npm run dev` this means your
> dev database also lives there. Pre-005 dev databases (under
> `%APPDATA%\lol-best-picker`) are **not** auto-migrated (spec Assumption:
> Backward Compatibility) — copy `lol-best-picker.db` over manually if you want it.

## Build & package

```powershell
npm run electron:rebuild   # better-sqlite3 -> Electron ABI (required before packaging)
npm run package            # = npm run build (typecheck + bundle) + electron-builder --win
# Output: release\LoL Best Picker-<version>-setup.exe
npm rebuild better-sqlite3 # switch the native ABI back so `npm test` works again
```

Config lives in [`electron-builder.yml`](../../electron-builder.yml) (NSIS options)
and [`build/installer.nsh`](../../build/installer.nsh) (custom wizard page, silent
parsing, uninstall prompt). `build/installer.nsh` is auto-detected by
electron-builder from the `buildResources` directory — no `nsis.include` needed.

## The configuration pipeline (testable core)

`src/main/installer/` is **Electron-free and unit-tested** (Constitution IV):

- `paths.ts` — resolve the data dir + file paths from `process.env`.
- `storage.ts` — parse/serialize/read/write `.env.local`.
- `config.ts` — merge with precedence **app overrides > system env > defaults**
  (FR-005) and validate inputs (FR-011).
- `logger.ts` — best-effort append-only `install.log`.
- `index.ts` — `initializeInstallerConfig()`, called once at startup.

Run just these tests (no `better-sqlite3`, so ABI-independent):

```powershell
npx vitest run tests/unit/main/installer
```

## Testing silent mode (FR-012, US5)

```powershell
# No UI; writes %LOCALAPPDATA%\LolBestPicker\.env.local with the given values.
.\release\"LoL Best Picker-0.1.0-setup.exe" /S /LCU_API_KEY=test123 /HTTPS_PROXY=http://127.0.0.1:8888
```

`/S` is NSIS's standard silent flag. After it returns, confirm `.env.local`
contains `LCU_API_KEY=test123`.

## Manual QA

Full install/upgrade/uninstall/silent matrix lives in
[`docs/installer-testing-guide.md`](../../docs/installer-testing-guide.md). The
NSIS script can only be validated by packaging + running on real Windows; there is
no automated Vitest coverage for installer *execution* (only for the config core).
