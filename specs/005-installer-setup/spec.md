# Feature Specification: Windows User-Level Installer

**Feature Branch**: `005-installer-setup`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "Create installer with environment variable override support for Windows user-level installation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Installation (Priority: P1)

A new user downloads the LoL Best Picker installer and runs the Windows setup wizard. They accept the default installation location in their user profile directory and the installer places the application alongside a default configuration. The application launches successfully after installation completes.

**Why this priority**: Essential foundation—without basic installation, users cannot access the application at all.

**Independent Test**: Can be fully tested by running the installer with default settings and verifying the application launches and functions correctly from the installed location.

**Acceptance Scenarios**:

1. **Given** a clean Windows system with no prior LoL Best Picker installation, **When** the user runs the installer, **Then** the application installs to the user's local AppData directory
2. **Given** the installation completes successfully, **When** the user launches the application from the Start Menu, **Then** it starts without errors
3. **Given** installation finishes, **When** the user checks the application folder, **Then** all required files and the SQLite database are present

---

### User Story 2 - Environment Variable Override (Priority: P1)

A user has system environment variables configured (e.g., `LCU_API_KEY`, proxy settings, or custom API endpoints). During installation, they need the ability to override or reconfigure these without manually editing system environment variables. The installer provides a settings page where they can specify custom values that take precedence.

**Why this priority**: Critical for flexibility—different environments (home, work, esports clubs) may require different configurations; without override capability, the app becomes inflexible to user needs.

**Independent Test**: Can be fully tested by running the installer, entering custom environment variable overrides, and verifying the application uses the overridden values instead of system defaults.

**Acceptance Scenarios**:

1. **Given** the installation wizard is at the environment configuration step, **When** the user enters custom values for environment variables, **Then** those values are stored in the application's configuration
2. **Given** both system and application-level environment variables are set, **When** the application starts, **Then** application-level settings take precedence
3. **Given** a user leaves environment variable fields blank during installation, **When** the application runs, **Then** it falls back to system environment variables or sensible defaults

---

### User Story 3 - Configuration Persistence (Priority: P1)

After initial installation, the user can run the installer again to repair, update, or modify environment variable settings without losing their champion pool or game history data. The installer recognizes an existing installation and offers upgrade/repair/modify options.

**Why this priority**: Data safety—users' pool data and cached statistics are valuable; reinstalling cannot destroy this state.

**Independent Test**: Can be fully tested by installing once, running the installer a second time, modifying environment variables, and verifying the champion pool and game history remain intact.

**Acceptance Scenarios**:

1. **Given** an existing LoL Best Picker installation, **When** the user runs the installer again, **Then** the installer offers Repair, Modify, or Uninstall options
2. **Given** the user chooses Modify, **When** they update environment variables and proceed, **Then** the SQLite database (pool, cached stats, history) is preserved
3. **Given** an existing installation is already present, **When** upgrade completes, **Then** the new version is running without manual restart requests

---

### User Story 4 - Uninstall with Data Cleanup (Priority: P2)

When a user chooses to uninstall, they are given the option to remove the application files while keeping their configuration/pool data, or to perform a complete uninstall including all local data. This respects user choice and GDPR/data retention principles.

**Why this priority**: Important for user agency and trust—uninstall should be clean and reversible where the user intends it to be.

**Independent Test**: Can be fully tested by installing, then running uninstall with both options and verifying file cleanup matches the user's choice.

**Acceptance Scenarios**:

1. **Given** a user selects Uninstall, **When** the uninstaller asks about data cleanup options, **Then** they can choose between "Keep Configuration" or "Remove All"
2. **Given** the user chooses "Keep Configuration", **When** uninstall completes, **Then** the SQLite database and settings remain on disk
3. **Given** the user chooses "Remove All", **When** uninstall completes, **Then** all application files and configuration are deleted

---

### User Story 5 - Silent/Scripted Installation (Priority: P3)

System administrators or power users can run the installer in silent mode with command-line arguments to deploy LoL Best Picker across machines with standard configurations, enabling IT or esports team setups.

**Why this priority**: Nice-to-have for advanced users—bulk deployment is less common than individual installation.

**Independent Test**: Can be fully tested by running the installer with silent flags and command-line parameters, verifying no UI appears and the application installs with specified settings.

**Acceptance Scenarios**:

1. **Given** a user runs the installer with `/silent` and configuration arguments, **When** installation completes, **Then** no installer UI is displayed
2. **Given** silent install with environment variable arguments, **When** installation finishes, **Then** those values are applied to the configuration

---

### Edge Cases

- What happens if the user lacks write permissions to their AppData directory?
- How does the installer handle a corrupted or locked SQLite database from a previous installation?
- What if a system environment variable is unset and the application-level override is also empty—should the app use a hardcoded default?
- How does the installer behave if the system runs out of disk space during extraction?
- What if a user cancels during the environment variable configuration step—should defaults apply or should they be prompted again on next launch?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Installer MUST place application files in `%LOCALAPPDATA%\LolBestPicker` (Windows user-level directory only)
- **FR-002**: Installer MUST provide a wizard-style UI with at least: Welcome, Installation Path, Environment Variables, Ready to Install, and Completion screens
- **FR-003**: Installer MUST allow users to set custom values for environment variables (e.g., proxy, API endpoints, LCU credentials) via form inputs during setup
- **FR-004**: Installer MUST store application-level environment variable overrides in a configuration file (e.g., `.env` or registry) accessible only to the current Windows user
- **FR-005**: Application-level environment variable settings MUST take precedence over system environment variables at runtime
- **FR-006**: Installer MUST detect existing installations and offer Repair, Modify Settings, or Uninstall options on subsequent runs
- **FR-007**: Installer MUST preserve the SQLite database (champion pool, game history, cached stats) when upgrading or modifying settings
- **FR-008**: Installer MUST create a Windows Start Menu shortcut and/or desktop shortcut as optional user selections
- **FR-009**: Uninstaller MUST ask users whether to keep or remove configuration and local data
- **FR-010**: Installer MUST log installation actions (success/failure) to a user-accessible log file for troubleshooting
- **FR-011**: Installer MUST validate environment variable inputs (e.g., URL format for endpoints, no special characters in credentials)
- **FR-012**: Installer MUST support silent/unattended mode with `/silent` flag and environment variable arguments for scripted deployment
- **FR-013**: Installer MUST use electron-builder's native Windows packaging (NSIS or MSI) to avoid external dependencies; no Puppeteer or additional Chromium download

### Key Entities

- **Installation Configuration**: Stores install path, environment variable overrides, shortcut preferences, and user choices
- **Application Settings Store**: Registry or `.env.local` file holding runtime environment variable overrides scoped to the current user
- **SQLite Database**: Champion pool, game history, cached statistics—must persist across installations
- **Installation Log**: Timestamped record of installer actions for debugging and audit trails

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete a full installation from download to first app launch in under 5 minutes without manual configuration steps
- **SC-002**: Installer correctly applies application-level environment variable overrides; app uses overridden values 100% of the time when both system and app-level values exist
- **SC-003**: Data persistence is guaranteed; 100% of champion pool, game history, and cached stats remain after reinstall/upgrade
- **SC-004**: Installer footprint is under 150 MB total (bundle size + Chromium already provided by Electron)
- **SC-005**: Silent installation with command-line arguments completes without UI or manual interaction
- **SC-006**: Uninstall operations remove files as specified by user choice; no stray files remain in common locations
- **SC-007**: Installation succeeds on Windows 10 (21H2+) and Windows 11 with standard user permissions (no admin required)
- **SC-008**: Installer displays clear error messages for failures (insufficient disk space, permission denied, corrupted database); recovery steps are actionable

## Assumptions

- **Windows Only (v1)**: Installer is Windows-only; macOS and Linux support are out of scope for this feature
- **No Admin Required**: Installation targets `%LOCALAPPDATA%`, which is writable by all Windows users without elevation
- **electron-builder Integration**: The project will use electron-builder's native Windows installer (NSIS or MSI), not third-party tools like Puppeteer, to keep dependencies minimal (Constitution VII)
- **Environment Variables Scope**: Application-level overrides are stored per-user; no machine-wide overrides in this version
- **Backward Compatibility**: Existing installations from development builds (via `npm run dev`) are not migrated; users must manually move their SQLite database if desired
- **Riot API Compliance**: Environment variable configuration respects [Constitution II](../.specify/memory/constitution.md) — no automated in-game actions or insecure credential storage (e.g., plain text in registry is acceptable for user-scoped settings, not global secrets)
- **Offline Fallback**: Installer requires internet only if downloading updates; offline installation from pre-downloaded bundle is supported
- **User Data Location**: SQLite database and app settings remain in `%LOCALAPPDATA%\LolBestPicker` to ensure they persist even if the app is reinstalled
