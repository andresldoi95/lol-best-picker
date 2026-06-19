# Release Notes

## Unreleased — Windows User-Level Installer (spec 005)

LoL Best Picker now ships as a proper Windows installer built with
electron-builder's native NSIS packager — no admin rights, no extra downloads.

### Installing

- Download `LoL Best Picker-<version>-setup.exe` and run it.
- The wizard installs to your user profile (`%LOCALAPPDATA%`), so **no
  administrator privileges are required**.
- All your data — champion pool, history, cached stats, settings — lives in
  `%LOCALAPPDATA%\LolBestPicker` and is **preserved across upgrades, repairs, and
  modifications**.

### Configuring environment overrides

During installation, the **Environment Configuration** page lets you set optional
per-user overrides without touching system environment variables:

| Field | Purpose |
|-------|---------|
| `LCU_API_KEY` | League Client API key, if you need a custom one |
| `HTTPS_PROXY` | Route the app's network access through a proxy |
| `LOLALYTICS_BASE_URL` | Override the stats source base URL |

These are saved to `%LOCALAPPDATA%\LolBestPicker\.env.local`. **Application-level
values take precedence over system environment variables** at runtime; leave a
field blank to fall back to your system setting (or the app default). Leaving all
fields blank on a re-install never erases a configuration you saved earlier.

### Silent / scripted installation (for IT & teams)

```powershell
Setup.exe /S /LCU_API_KEY=<key> /HTTPS_PROXY=http://host:port
```

`/S` runs the installer with no UI; any `/KEY=value` arguments are written to
`.env.local`. Silent uninstall keeps your data by default.

### Uninstalling

The uninstaller asks whether to **keep** your configuration and champion-pool data
(for a later reinstall) or **remove everything**. Your choice is respected.

### Troubleshooting

Installation actions are logged to `%LOCALAPPDATA%\LolBestPicker\install.log`.
Credentials are never written to the log.
