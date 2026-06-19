/**
 * Append-only install/runtime log (spec 005 FR-010) at
 * `%LOCALAPPDATA%\LolBestPicker\install.log`.
 *
 * Logging must never crash startup, so every fs call is guarded — a failure to
 * write the log is swallowed (best-effort, like the stats refresh). Only key
 * NAMES and event descriptions are ever written here; values/credentials are not
 * (Constitution II).
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export interface InstallerLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** Format one log line. Pure, so the timestamp can be injected in tests. */
export function formatLogLine(level: LogLevel, message: string, now: Date = new Date()): string {
  return `[${now.toISOString()}] ${level} ${message}\n`
}

/**
 * Create a logger that appends to `logPath`. The first write ensures the parent
 * directory exists. All errors are caught so logging can never abort the caller.
 */
export function createInstallerLogger(logPath: string): InstallerLogger {
  let dirReady = false

  const write = (level: LogLevel, message: string): void => {
    try {
      if (!dirReady) {
        mkdirSync(dirname(logPath), { recursive: true })
        dirReady = true
      }
      appendFileSync(logPath, formatLogLine(level, message), { encoding: 'utf8' })
    } catch {
      // Best-effort logging — never let a disk/permission error break startup.
    }
  }

  return {
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message) => write('ERROR', message)
  }
}

/** A logger that discards everything — useful for tests and headless contexts. */
export function createNoopLogger(): InstallerLogger {
  return { info: () => {}, warn: () => {}, error: () => {} }
}
