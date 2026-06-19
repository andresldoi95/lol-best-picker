/**
 * Installer configuration entry point — the one function `src/main/index.ts`
 * calls at startup. Still Electron-free (operates on `process.env` and the
 * filesystem only); the Electron bridge is a single `app.setPath('userData', …)`
 * call in `index.ts` using the returned `dataDir`.
 *
 * Responsibilities (spec 005 US2 / FR-004 / FR-005 / FR-010 / FR-011):
 *  1. Resolve + create `%LOCALAPPDATA%\LolBestPicker`.
 *  2. Read `.env.local` overrides, drop any that fail validation.
 *  3. Merge with system env (app overrides win) and apply to `process.env`.
 *  4. Log key names only — never values (Constitution II).
 *
 * Defensive by design: a malformed/locked `.env.local` is logged and skipped, it
 * never aborts launch (offline-first robustness).
 */
import { mkdirSync } from 'node:fs'
import { applyMergedConfig, mergeConfig, validateEnvOverrides } from './config'
import { createInstallerLogger } from './logger'
import {
  pathEnvironmentFromProcess,
  resolveDataDir,
  resolveEnvLocalPath,
  resolveInstallLogPath,
  type PathEnvironment
} from './paths'
import { readEnvLocal } from './storage'

export interface InstallerConfigResult {
  /** The resolved user-level data directory (`%LOCALAPPDATA%\LolBestPicker`). */
  dataDir: string
  /** Override keys that were applied to the target env (sorted, names only). */
  appliedKeys: string[]
  /** Override keys dropped for failing validation (names only). */
  invalidKeys: string[]
}

/**
 * Initialize installer-provided configuration. Returns the data directory the
 * caller should point Electron's `userData` at, plus a summary of what was
 * applied. `env`/`target` are injectable so this is unit-testable in plain Node.
 */
export function initializeInstallerConfig(
  env: PathEnvironment = pathEnvironmentFromProcess(),
  target: NodeJS.ProcessEnv = process.env
): InstallerConfigResult {
  const dataDir = resolveDataDir(env)
  mkdirSync(dataDir, { recursive: true })

  const logger = createInstallerLogger(resolveInstallLogPath(env))

  let appliedKeys: string[] = []
  let invalidKeys: string[] = []

  try {
    const overrides = readEnvLocal(resolveEnvLocalPath(env))

    invalidKeys = validateEnvOverrides(overrides).map((error) => error.key)
    const valid: Record<string, string> = { ...overrides }
    for (const key of invalidKeys) delete valid[key]
    if (invalidKeys.length) {
      logger.warn(`Ignoring invalid override keys: ${invalidKeys.join(', ')}`)
    }

    const merged = mergeConfig({ systemEnv: target, appOverrides: valid })
    appliedKeys = applyMergedConfig(target, merged)
    logger.info(`Applied override keys: ${appliedKeys.join(', ') || '(none)'}`)
  } catch (error) {
    logger.error(`Failed to load environment overrides: ${(error as Error).message}`)
  }

  return { dataDir, appliedKeys, invalidKeys }
}

export {
  resolveDataDir,
  resolveDbPath,
  resolveEnvLocalPath,
  resolveInstallLogPath,
  pathEnvironmentFromProcess,
  DATA_DIR_NAME,
  DB_FILE_NAME,
  ENV_LOCAL_FILE_NAME,
  INSTALL_LOG_FILE_NAME
} from './paths'
