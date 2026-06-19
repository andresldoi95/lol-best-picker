# Installer Manual Testing Guide (spec 005)

The installer's NSIS behavior cannot be exercised by Vitest — it requires building
a real `setup.exe` and running it on Windows. This checklist is the acceptance
gate for the installer feature. Run it on **Windows 10 (21H2+)** and **Windows 11**
(SC-007) after `npm run package`.

> Automated coverage: the pure configuration core (`src/main/installer/*`) is
> covered by `tests/unit/main/installer/*`. Everything below is manual.

## Pre-req

```powershell
npm run electron:rebuild
npm run package        # produces release\LoL Best Picker-<version>-setup.exe
```

## US1 — First-time installation (P1)

- [ ] Run the installer on a machine with no prior install (no `%LOCALAPPDATA%\LolBestPicker`).
- [ ] Wizard shows: Welcome → Install location → **Environment Configuration** → Installing → Finish.
- [ ] Accept defaults; confirm install completes without an admin/UAC prompt (SC-007).
- [ ] App launches (runAfterFinish) and a Start Menu shortcut exists (FR-008).
- [ ] `%LOCALAPPDATA%\LolBestPicker\lol-best-picker.db` exists; app opens to an empty pool.
- [ ] `%LOCALAPPDATA%\LolBestPicker\install.log` contains an `[installer] ... installed to ...` line (FR-010).

## US2 — Environment variable override (P1)

- [ ] Set a **system** env var (e.g. `setx LCU_API_KEY system-value`), open a new shell.
- [ ] Run installer; on the Environment Configuration page enter `LCU_API_KEY = app-value`.
- [ ] After install, `%LOCALAPPDATA%\LolBestPicker\.env.local` contains `LCU_API_KEY=app-value`.
- [ ] Launch app; confirm it uses `app-value` (app override wins over system, FR-005 / SC-002).
- [ ] Re-run, leave the field blank → existing `.env.local` is **preserved** (not blanked).
- [ ] Enter an invalid proxy (`HTTPS_PROXY = not-a-url`) → app logs it as ignored and falls back (FR-011).

## US3 — Configuration persistence on upgrade/modify (P1)

- [ ] Install, launch, add several champions to your pool, close the app.
- [ ] Re-run the same (or newer) installer → it detects the existing install and offers the maintenance flow.
- [ ] Choose Modify/Repair, finish.
- [ ] Launch app → champion pool, history, and settings are **unchanged** (FR-007 / SC-003).
- [ ] `lol-best-picker.db` modified-time changed only by normal use, not reset.

## US4 — Uninstall with data cleanup (P2)

- [ ] Uninstall via Settings → Apps (or the uninstaller in the install dir).
- [ ] Prompt appears: "Remove your configuration and champion-pool data?" (FR-009).
- [ ] Choose **No** → app files removed, but `%LOCALAPPDATA%\LolBestPicker` (db + `.env.local`) remains.
- [ ] Reinstall → previous pool is still there.
- [ ] Uninstall again, choose **Yes** → `%LOCALAPPDATA%\LolBestPicker` is fully removed (SC-006).
- [ ] No stray shortcuts or `%LOCALAPPDATA%\Programs\LoL Best Picker` remnants.

## US5 — Silent / scripted install (P3)

- [ ] `Setup.exe /S` → no UI window appears (SC-005).
- [ ] `Setup.exe /S /LCU_API_KEY=test /HTTPS_PROXY=http://127.0.0.1:8888` → `.env.local` contains both values.
- [ ] Silent **uninstall** keeps data by default (no accidental wipe).

## Cross-cutting

- [ ] Total `setup.exe` size is under 150 MB (SC-004).
- [ ] Insufficient disk space / permission-denied surface a clear NSIS error (SC-008).
- [ ] Full flow (download → first launch) completes in under 5 minutes (SC-001).
