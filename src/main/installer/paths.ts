/**
 * Centralized resolution of the app's user-level data directory and the files
 * inside it (SQLite DB, `.env.local` overrides, install log).
 *
 * Pure with respect to Electron: every path is derived from an injected
 * `PathEnvironment` (built from `process.env`), so this module is unit-testable
 * in plain Node with no Electron runtime — matching the recommendation engine's
 * isolation discipline (Constitution IV). `src/main/index.ts` is the only place
 * that bridges these paths into Electron via `app.setPath('userData', …)`.
 *
 * Spec 005 FR-001 / "User Data Location": data lives under
 * `%LOCALAPPDATA%\LolBestPicker` so it persists across installs/upgrades and
 * never requires admin rights.
 */
import { join } from 'node:path'

/** The folder name under `%LOCALAPPDATA%` that holds all user data. */
export const DATA_DIR_NAME = 'LolBestPicker'

/** SQLite filename — kept identical to the pre-005 name so existing data is
 *  found unchanged once `userData` is repointed at the new directory. */
export const DB_FILE_NAME = 'lol-best-picker.db'

/** Application-level environment overrides, written by the installer. */
export const ENV_LOCAL_FILE_NAME = '.env.local'

/** Human-readable install/runtime log (FR-010). */
export const INSTALL_LOG_FILE_NAME = 'install.log'

/** Highest-precedence override for the data dir — used by tests and power users
 *  to relocate everything (e.g. portable installs). */
export const DATA_DIR_ENV_VAR = 'LOLBESTPICKER_DATA_DIR'

/** The slice of the process environment that path resolution depends on. */
export interface PathEnvironment {
  /** `%LOCALAPPDATA%` on Windows (e.g. `C:\Users\me\AppData\Local`). */
  localAppData?: string
  /** Explicit data-dir override (`LOLBESTPICKER_DATA_DIR`) — wins over everything. */
  dataDirOverride?: string
  /** User home, used to reconstruct LocalAppData when `localAppData` is absent. */
  home?: string
}

/** Build a {@link PathEnvironment} from a process env map (production wiring). */
export function pathEnvironmentFromProcess(env: NodeJS.ProcessEnv = process.env): PathEnvironment {
  return {
    localAppData: env.LOCALAPPDATA,
    dataDirOverride: env[DATA_DIR_ENV_VAR],
    home: env.USERPROFILE ?? env.HOME
  }
}

/**
 * Resolve the absolute path of the user-level data directory.
 *
 * Precedence: explicit override → `%LOCALAPPDATA%\LolBestPicker` →
 * `<home>\AppData\Local\LolBestPicker` (last resort if LOCALAPPDATA is unset).
 * Throws if none of those can be determined rather than silently writing to cwd.
 */
export function resolveDataDir(env: PathEnvironment): string {
  const override = env.dataDirOverride?.trim()
  if (override) return override

  const localAppData = env.localAppData?.trim()
  if (localAppData) return join(localAppData, DATA_DIR_NAME)

  const home = env.home?.trim()
  if (home) return join(home, 'AppData', 'Local', DATA_DIR_NAME)

  throw new Error(
    `Cannot resolve data directory: neither ${DATA_DIR_ENV_VAR}, LOCALAPPDATA, nor a home directory is available`
  )
}

/** Absolute path to the SQLite database inside the data directory. */
export function resolveDbPath(env: PathEnvironment): string {
  return join(resolveDataDir(env), DB_FILE_NAME)
}

/** Absolute path to the `.env.local` overrides file inside the data directory. */
export function resolveEnvLocalPath(env: PathEnvironment): string {
  return join(resolveDataDir(env), ENV_LOCAL_FILE_NAME)
}

/** Absolute path to the install/runtime log inside the data directory. */
export function resolveInstallLogPath(env: PathEnvironment): string {
  return join(resolveDataDir(env), INSTALL_LOG_FILE_NAME)
}
