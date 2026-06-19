# Tasks: Windows User-Level Installer

**Input**: Design documents from `specs/005-installer-setup/`

**Prerequisites**: plan.md (tech stack: electron-builder, NSIS, .env.local), spec.md (5 user stories)

**Organization**: Tasks grouped by user story to enable independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Implementation Status (filled in by `/speckit-implement`, 2026-06-18)

The original task list was written against a **hand-authored NSIS project**
(`installer.nsi`, `uninstaller.nsi`, PowerShell runner scripts) and assumed
Vitest could execute installers. The repo already uses **electron-builder**,
which *owns* the generated `.nsi` and exposes customization through a single
auto-detected `build/installer.nsh` include plus `electron-builder.yml` options.
Tasks were therefore implemented against that reality. Legend:

- ✅ **done** — implemented and verified (`npm run build` + `npx vitest run` green)
- ➡️ **adapted** — done, but via electron-builder's model instead of as literally written
- ⏳ **manual-verify** — code is done; runtime check needs a Windows packaging run (see `docs/installer-testing-guide.md`)
- 🧪 **test reframed** — installer-*execution* can't run in Vitest; moved to the manual QA guide (the pure config pipeline IS unit-tested)
- 🔁 **descoped** — intentionally not built (rationale inline)
- ⛔ **rejected** — would violate the constitution / be harmful (rationale inline)

**Delivered (Electron-free, unit-tested — `tests/unit/main/installer/`, 37 tests):**
`src/main/installer/{paths,storage,config,logger,index}.ts`. **Wiring:**
`src/main/index.ts` repoints `userData` → `%LOCALAPPDATA%\LolBestPicker` and
applies `.env.local` overrides at startup. **Packaging:** `electron-builder.yml`
+ `build/installer.nsh`. **Docs/CI:** quickstart, testing guide, RELEASE_NOTES,
GitHub Actions workflow.

> ⚠️ Local `npm run package` could not finish in this environment:
> electron-builder fails extracting its `winCodeSign` tool ("Cannot create
> symbolic link: A required privilege is not held") — a Windows
> Developer-Mode/admin limitation **unrelated to this code**, hit before NSIS
> even compiles. Validate the installer via the CI workflow (`windows-latest`
> has the privilege) or a dev box with Developer Mode on.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and installer configuration framework

- [X] T001 Create `src/main/installer/` directory structure ✅ — created `{paths,storage,config,logger,index}.ts`; NSIS lives in `build/installer.nsh` (electron-builder convention) rather than `src/main/installer/nsis-scripts/`
- [X] T002 Installer packaging config ➡️ — `electron-builder.yml` already existed; **extended** it (shortcuts, runAfterFinish, deleteAppDataOnUninstall, no-elevation) instead of creating a competing `electron-builder-config.js`
- [X] T003 [P] Create `src/main/installer/config.ts` ✅ — pure env merge with precedence + `validateEnvOverrides`; no Electron imports
- [X] T004 [P] Create `src/main/installer/storage.ts` ✅ — `.env.local` parse/serialize/read/write under `%LOCALAPPDATA%\LolBestPicker`
- [X] T005 [P] Create `src/main/installer/paths.ts` ✅ — central resolution of data dir / db / `.env.local` / log paths (injectable env)
- [X] T006 `npm run package` command ✅ — already present in `package.json` (`npm run build && electron-builder --win`)
- [X] T007 Create `src/main/installer/logger.ts` ✅ — best-effort append-only `install.log`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T008 Wire installer config at startup ✅➡️ — `src/main/index.ts` (not `app.ts`) calls `initializeInstallerConfig()` then `app.setPath('userData', dataDir)` before DB init / renderer load
- [ ] T009 [P] `installer/ipc.ts` `app:load-env-config` IPC 🔁 — **descoped**: overrides may include credentials (`LCU_API_KEY`); exposing them across the preload bridge violates the spirit of Constitution II. Task itself was "if needed"; no FR needs it. Main process consumes overrides directly via `process.env`.
- [X] T010 SQLite at user-level data dir ✅➡️ — `app.setPath` repoints `userData`, so `initDatabase()` opens `%LOCALAPPDATA%\LolBestPicker\lol-best-picker.db` (kept the existing filename, not `app.db`, so existing data is found); migrations run via existing `db/index.ts`
- [X] T011 Unit tests — config precedence ✅ — `tests/unit/main/installer/config.test.ts` (system > app-level > defaults, blank-override fallback)
- [X] T012 [P] Unit tests — path resolution ✅ — `tests/unit/main/installer/paths.test.ts`
- [ ] T013 Contract test — installer IPC 🔁 — descoped with T009 (no renderer IPC surface to contract-test)

**Checkpoint**: Foundation ready ✅ — config core unit-tested, startup wiring builds clean

---

## Phase 3: User Story 1 - First-Time Installation (P1) 🎯 MVP

- [X] T014 [P] [US1] Wizard pages (Welcome/Path/Ready/Completion) ✅➡️ — provided by electron-builder's assisted installer (`oneClick: false`); not a hand-written `installer.nsi`
- [X] T015 [P] [US1] Upgrade/existing-install detection ✅➡️ — native to electron-builder (stable appId/GUID); our data dir is outside the install dir so it's untouched
- [X] T016 [US1] Start Menu shortcut ✅ — `nsis.createStartMenuShortcut` / `shortcutName` in `electron-builder.yml`
- [X] T017 [US1] First-launch marker ✅➡️ — `customInstall` writes `install.log`; first-vs-repeat launch is already inferable from the seeded/empty DB (no separate marker needed)
- [X] T018 [US1] First-launch default DB + migrations ✅ — existing `initDatabase()` seeds champions/stats and runs migrations on a fresh DB
- [ ] T019 [P] [US1] `installer-first-launch.spec.ts` 🧪 — installer *execution* isn't Vitest-runnable; covered by `docs/installer-testing-guide.md` (US1)
- [X] T020 [US1] Installer exe/shortcut config ✅➡️ — set in `electron-builder.yml` (`runAfterFinish`, shortcuts). Note: no `build/icon.ico` asset committed yet → electron-builder uses its default icon; drop an `icon.ico` in `build/` to brand it
- [ ] T021 [US1] Verify shortcuts resolve 🟡 — manual QA (testing guide, US1)

**Checkpoint**: US1 — fresh-install path implemented; end-to-end verification is manual (packaging blocked locally)

---

## Phase 4: User Story 2 - Environment Variable Override (P1)

- [X] T022 [P] [US2] "Environment Configuration" wizard page ✅➡️ — `build/installer.nsh` `customPageAfterChangeDir` (nsDialogs fields for LCU_API_KEY / HTTPS_PROXY / LOLALYTICS_BASE_URL)
- [X] T023 [P] [US2] Validate env inputs ✅ — `validateEnvOverrides()` (URL/proxy format, no whitespace/control chars in credentials) runs at app startup; invalid keys are dropped + logged
- [X] T024 [P] [US2] Pass page values to persistence ✅➡️ — `customInstall` writes them straight to `.env.local` (no intermediate temp file/registry)
- [X] T025 [US2] Persist `.env.local` ✅➡️ — done inside `customInstall`; the separate `install-runner.ps1` is unnecessary (NSIS writes the file directly) — **folded in**, no PowerShell runner
- [X] T026 [US2] Parse `.env.local` → key/value ✅ — `storage.parseEnvFile` / `readEnvLocal`
- [X] T027 [US2] Precedence rule ✅ — `config.mergeConfig` (app override > system > default)
- [X] T028 [P] [US2] Unit test — storage ✅ — `tests/unit/main/installer/storage.test.ts`
- [X] T029 [P] [US2] Unit test — config precedence ✅ — `tests/unit/main/installer/config.test.ts`
- [ ] T030 [US2] `installer-env-override.spec.ts` 🧪 — installer execution not Vitest-runnable → testing guide (US2). The equivalent pure pipeline (read `.env.local` → merge → apply) **is** covered by `initializeInstallerConfig.test.ts`

**Checkpoint**: US2 — override capture + precedence implemented and unit-tested

---

## Phase 5: User Story 3 - Configuration Persistence (P1)

- [X] T031 [US3] Upgrade detection ✅➡️ — native electron-builder (see T015)
- [X] T032 [US3] Repair/Modify/Uninstall dialog ✅➡️ — electron-builder's assisted installer shows the maintenance UI on re-run
- [X] T033 [US3] Modify action ✅➡️ — native; the env-config page is shown again, `.env.local` is only rewritten when a value is supplied (blank re-install never clobbers saved config)
- [X] T034 [P] [US3] Preserve SQLite on upgrade ✅➡️ — achieved by **design, not a backup/restore dance**: user data lives in `%LOCALAPPDATA%\LolBestPicker`, *outside* the install dir, and `deleteAppDataOnUninstall: false`, so reinstalling binaries can't touch it
- [X] T035 [US3] Upgrade-mode backup ✅➡️ — not needed (see T034); the "create backup before writing files" step is obviated by separating data from binaries
- [ ] T036 [US3] `test_0000_create_test_db.sql` in `src/main/db/migrations/` ⛔ — **rejected**: shipping a test migration in the production migration chain would corrupt every real user's schema and violates Constitution III. Data-persistence is verified via the existing idempotent migration runner + manual QA (testing guide, US3)
- [ ] T037 [P] [US3] `installer-upgrade-preserve-data.spec.ts` 🧪 — not Vitest-runnable → testing guide (US3)
- [X] T038 [US3] Migrations run on upgrade ✅ — existing `runMigrations()` is idempotent (tracks applied IDs in `schema_migrations`); new migrations apply on next launch regardless of installer

**Checkpoint**: US3 — data survives upgrade/modify by construction; verify via testing guide

---

## Phase 6: User Story 4 - Uninstall with Data Cleanup (P2)

- [X] T039 [P] [US4] Uninstaller keep/remove prompt ✅➡️ — `build/installer.nsh` `customUnInstall` (MessageBox, `/SD IDNO` ⇒ silent keeps data)
- [X] T040 [US4] Conditional data delete ✅ — `RMDir /r "$LOCALAPPDATA\LolBestPicker"` only on explicit "Yes"
- [X] T041 [US4] Shortcut/registry cleanup ✅➡️ — electron-builder's generated uninstaller already removes shortcuts/registry/app files; the `uninstall-runner.ps1` is unnecessary — **folded in**
- [ ] T042 [P] [US4] Verify removal completeness 🟡 — manual QA (testing guide, US4)
- [ ] T043 [P] [US4] `installer-uninstall-keep-config.spec.ts` 🧪 — not Vitest-runnable → testing guide (US4)
- [ ] T044 [P] [US4] `installer-uninstall-remove-all.spec.ts` 🧪 — not Vitest-runnable → testing guide (US4)
- [ ] T045 [US4] Uninstall from maintenance dialog 🟡 — manual QA (testing guide, US4)

**Checkpoint**: US4 — keep/remove choice implemented in `customUnInstall`

---

## Phase 7: User Story 5 - Silent/Scripted Installation (P3)

- [X] T046 [P] [US5] Silent flag ✅➡️ — NSIS's standard `/S` (electron-builder convention; `/silent` is not the NSIS flag). Documented in quickstart + RELEASE_NOTES
- [X] T047 [P] [US5] Parse `/KEY=value` params ✅ — `${GetParameters}` + `${GetOptions}` in `customInstall`
- [X] T048 [US5] Silent-mode handling ✅➡️ — `customInstall` reads command-line params; custom pages auto-skip under `/S` (no runner script)
- [ ] T049 [P] [US5] `installer-silent-mode.spec.ts` 🧪 — not Vitest-runnable → testing guide (US5)
- [ ] T050 [P] [US5] `installer-silent-with-args.spec.ts` 🧪 — not Vitest-runnable → testing guide (US5)

**Checkpoint**: US5 — silent install + arg parsing implemented

---

## Phase N: Polish & Cross-Cutting Concerns

- [X] T051 [P] `docs/installer-testing-guide.md` ✅ — full manual QA matrix mapped to US1–US5 + cross-cutting SCs
- [X] T052 [P] `specs/005-installer-setup/quickstart.md` ✅ — dev packaging + silent-mode + config-pipeline guide
- [X] T053 [P] CI to package installer ✅ — `.github/workflows/release-installer.yml` (tag/dispatch, `windows-latest`, uploads artifact; code-signing documented as opt-in)
- [ ] T054 [P] `installer-error-scenarios.spec.ts` 🧪 — disk-space/permission failures are NSIS-runtime concerns, not Vitest-testable → testing guide (cross-cutting)
- [X] T055 RELEASE_NOTES.md ✅ — installer behavior + env-config + silent-mode documented
- [X] T056 Install logging ✅⏳ — implemented (`logger.ts` unit-tested; `customInstall` appends `install.log`); on-disk presence is manual-verify after a real install
- [ ] T057 [P] Validate on Win 10 / Win 11 🟡 — manual QA (testing guide); also runnable via the CI workflow
- [ ] T058 Measure installer footprint < 150 MB ⏳ — local packaging blocked (winCodeSign symlink privilege); `release/win-unpacked` was 325 MB uncompressed, NSIS LZMA typically compresses an Electron app well under 150 MB — confirm from the CI artifact

**Checkpoint**: code, docs, and CI complete; installer-binary verification (T019/T021/T030/T037/T042–T045/T049/T050/T054/T056–T058) is gated on a successful packaging run (CI or Developer-Mode Windows box)

---

## Notes

- [P] = can run in parallel (different files, no blocker dependencies)
- NSIS customization lives in **one** electron-builder include (`build/installer.nsh`), not hand-written `.nsi`/`.ps1` files — that's the supported, zero-extra-dependency mechanism (Constitution VII)
- The pure config core (`src/main/installer/*`) stays Electron-free and unit-tested, mirroring the recommendation-engine isolation discipline (Constitution IV)
- `build/installer.nsh` is intentionally git-tracked (the blanket `build/` ignore was narrowed to `build/Release/`)
