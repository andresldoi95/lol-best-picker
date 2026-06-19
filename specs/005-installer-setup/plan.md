# Implementation Plan: Windows User-Level Installer

**Branch**: `005-installer-setup` | **Date**: 2026-06-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-installer-setup/spec.md`

## Summary

Build a Windows installer using electron-builder's native NSIS packager that installs the LoL Best Picker app to `%LOCALAPPDATA%` with user-level permissions. The installer provides a wizard UI to configure environment variable overrides (proxy, API endpoints, LCU credentials) that take precedence over system variables at runtime. On subsequent runs, the installer detects existing installations and offers Repair, Modify, or Uninstall options. All user data (champion pool, game history, cached stats) persists across upgrades and modifications.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 18+ (via Electron, which bundles Node)

**Primary Dependencies**: 
- electron-builder (v24+) — native Windows installer (NSIS or MSI, no external downloads)
- dotenv (optional, for .env parsing) — if not already a dependency
- node-gyp — already required by better-sqlite3

**Storage**: SQLite (existing `better-sqlite3`), Windows Registry or `.env.local` file for application-level environment overrides

**Testing**: Vitest (existing test suite); manual installer testing on Windows 10/11

**Target Platform**: Windows 10 (21H2+) and Windows 11 (standard user permissions, no admin)

**Project Type**: Desktop application (Electron)

**Performance Goals**: Installer download < 150 MB, installation completes in < 3 minutes on typical hardware

**Constraints**: 
- No new Chromium download (electron-builder reuses Electron's bundle)
- Installation to user-local directory only (no machine-wide registry or `Program Files`)
- Must not delete or corrupt SQLite database on upgrade/repair
- User credentials must not appear in logs or unencrypted registry keys

**Scale/Scope**: Single-machine, single-user app; no multi-user or network deployment in v1

## Constitution Check

**GATE: Must pass before Phase 0 research**

| Principle | Applies? | Status | Notes |
|-----------|----------|--------|-------|
| **I. Pool-Constrained** | No | ✓ Pass | Installer doesn't affect recommendation engine |
| **II. Riot API/LCU Compliance** | No | ✓ Pass | Installer doesn't call Riot API; runtime behavior unchanged |
| **III. Local-First Data** | **Yes** | ✓ Pass | App settings stored locally (`%LOCALAPPDATA%`); no telemetry in installer; user credentials not transmitted |
| **IV. Business Logic Isolation** | No | ✓ Pass | Installer is setup/deployment, not recommendation logic |
| **V. Real-Time Responsiveness** | No | ✓ Pass | Installer runs once; doesn't affect champion-select latency |
| **VI. Test-First Recommendation** | No | ✓ Pass | Installer isn't recommendation logic |
| **VII. Minimal Dependencies** | **Yes** | ✓ Pass | electron-builder chosen over Puppeteer/custom tool; reuses Electron's Chromium (no double-download); dotenv is lightweight |

**Conclusion**: Feature complies with Constitution. No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```
specs/005-installer-setup/
├── spec.md                    # Feature specification
├── plan.md                    # This file
├── research.md                # Phase 0: dependency and best-practices research
├── data-model.md              # Phase 1: installer configuration, data persistence
├── contracts/
│   └── installer-ipc.md       # Renderer → Main IPC for configuration handoff
├── quickstart.md              # Phase 1: getting started with installer dev/testing
├── checklists/
│   └── requirements.md        # Quality checklist
└── tasks.md                   # Phase 2 output (/speckit-tasks)
```

### Source Code Layout

```
src/
├── main/
│   ├── installer/             # NEW: Installer-specific logic
│   │   ├── config.ts          # Load/merge system env + app-level overrides
│   │   ├── storage.ts         # Handle config persistence (Registry or .env.local)
│   │   └── nsis-scripts/      # NSIS custom scripts (if needed)
│   │
│   ├── app.ts                 # Updated: Initialize env config before renderer
│   └── ... (existing main process code)
│
├── preload/
│   └── index.ts               # Updated: Expose installer config API if renderer needs it
│
└── renderer/
    └── ... (existing Vue views — installer UI is built by electron-builder, not Vue)

electron.vite.config.ts         # Updated: Configure electron-builder in build section
electron-builder-config.js      # NEW: NSIS installer config (app name, shortcuts, icons)
package.json                    # Updated: Add npm run commands for installer packaging

tests/
├── unit/
│   └── main/
│       └── installer/          # NEW: Unit tests for config loading/merging
└── contract/
    └── installer-ipc.spec.ts   # NEW: Test IPC contract for env config handoff
```

**Structure Decision**: Single project with installer-specific code isolated in `src/main/installer/`. The installer UI (wizard screens) is generated by electron-builder's NSIS template; no Vue components needed for setup. The main decision point is how to persist user-provided environment overrides—this plan uses `.env.local` in the app data directory for simplicity and transparency.

## Complexity Tracking

No violations to justify; feature aligns with Constitution.

---

## Phase 0: Research & Unknowns

### Research Tasks

1. **electron-builder NSIS customization**
   - How to inject custom screens (environment variable form) into NSIS wizard
   - How to pass installer values to the main app at first launch
   - Installer vs. runtime environment variable merging strategy

2. **Environment variable storage & precedence**
   - Windows Registry (HKEY_CURRENT_USER) vs. `.env.local` file in %LOCALAPPDATA%
   - Which is more transparent/user-friendly for debugging
   - Security implications of each approach

3. **SQLite database location & persistence**
   - Verify `src/main/db/` and migrations handle app data directory correctly
   - Test upgrade path: old app → new app with persisted database

4. **Uninstall script handling**
   - NSIS uninstaller options for selective data cleanup
   - How to preserve/remove database and config on user choice

5. **Windows 10 vs. 11 compatibility**
   - Check electron-builder's NSIS generator for any version-specific quirks

### Phase 0 Output

`research.md` with findings and decisions on:
- NSIS customization approach (scripting language, template hooks)
- Env override storage format (JSON in `.env.local` or Registry)
- First-launch handoff mechanism (IPC + file read or environment variables)

---

## Phase 1: Design & Contracts

### 1. Data Model (data-model.md)

**Configuration Entities**:

- **InstallerConfig**
  - `installPath`: string (resolved `%LOCALAPPDATA%\LolBestPicker`)
  - `desktopShortcut`: boolean
  - `startMenuShortcut`: boolean
  - `envOverrides`: Map<string, string> (user-provided environment variable values)

- **RuntimeConfig**
  - Loaded from: system environment + `.env.local` in app data directory
  - Precedence: app-level overrides > system env > hardcoded defaults
  - Scope: current Windows user only (via `%LOCALAPPDATA%`)

- **SQLiteDatabase**
  - Location: `%LOCALAPPDATA%\LolBestPicker\app.db`
  - Must survive: install, upgrade, repair, modify operations
  - Migrated by existing `src/main/db/migrations/`

### 2. Contracts (contracts/)

**File**: `installer-ipc.md`

Installer (NSIS setup process) → Main IPC handoff:

```typescript
// Renderer might need to know about installation state (optional):
window.api.getInstallerState() → { isFirstLaunch: boolean; configPath: string }

// Main process reads installer config at startup:
ipcMain.handle('app:load-env-config', async () => {
  return {
    envOverrides: loadEnvOverrides(), // from .env.local
    dbPath: getDbPath(),
  }
})
```

### 3. Quickstart (quickstart.md)

- How to set up dev environment for testing installer changes
- How to trigger NSIS packaging locally
- Manual testing checklist (install, launch, modify, uninstall, data persistence)

### 4. Agent Context Update

Update `CLAUDE.md` to reference this plan:

```markdown
**Active Feature Plan**

**Feature**: Windows User-Level Installer
**Branch**: `005-installer-setup`
**Plan**: [specs/005-installer-setup/plan.md](specs/005-installer-setup/plan.md)
**Spec**: [specs/005-installer-setup/spec.md](specs/005-installer-setup/spec.md)
```

---

## Next Steps

- **Proceed to Phase 0**: Run `/speckit-plan` research workflow to investigate NSIS customization and environment variable storage options.
- **After Phase 0**: Generate `research.md` with findings.
- **After Phase 1**: Generate `data-model.md`, `contracts/installer-ipc.md`, `quickstart.md`.
- **Then proceed**: `/speckit-tasks` to break Phase 1 design into actionable development tasks.
