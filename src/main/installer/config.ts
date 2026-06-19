/**
 * Merge runtime environment configuration with the precedence the spec mandates
 * (FR-005): application-level overrides (`.env.local`) > system environment >
 * hardcoded defaults. Empty/blank app overrides do NOT shadow the system value —
 * a field the user left blank in the installer falls back to system env or a
 * default (US2 AC3).
 *
 * Pure: no fs, no Electron. `applyMergedConfig` is the only function that mutates
 * a target env, and the target is injected (production passes `process.env`).
 */

/** Keys the installer surfaces and the app treats as runtime configuration. */
export const KNOWN_ENV_KEYS = [
  'LCU_API_KEY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LOLALYTICS_BASE_URL'
] as const

export type KnownEnvKey = (typeof KNOWN_ENV_KEYS)[number]

/** Where a resolved value came from, so precedence is assertable in tests. */
export type ConfigSource = 'app' | 'system' | 'default'

export interface ResolvedValue {
  value: string
  source: ConfigSource
}

export interface ConfigSources {
  /** Hardcoded fallbacks, lowest precedence. */
  defaults?: Record<string, string>
  /** The system environment (e.g. `process.env`). */
  systemEnv: Record<string, string | undefined>
  /** Application overrides parsed from `.env.local`, highest precedence. */
  appOverrides: Record<string, string>
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Resolve the effective value (and its source) for every key drawn from the
 * union of known keys, provided app overrides, and provided defaults. Keys with
 * no value at any layer are omitted.
 */
export function mergeConfig(sources: ConfigSources): Record<string, ResolvedValue> {
  const { defaults = {}, systemEnv, appOverrides } = sources

  const keys = new Set<string>([
    ...KNOWN_ENV_KEYS,
    ...Object.keys(appOverrides),
    ...Object.keys(defaults)
  ])

  const resolved: Record<string, ResolvedValue> = {}
  for (const key of keys) {
    if (isNonEmpty(appOverrides[key])) {
      resolved[key] = { value: appOverrides[key], source: 'app' }
    } else if (isNonEmpty(systemEnv[key])) {
      resolved[key] = { value: systemEnv[key] as string, source: 'system' }
    } else if (isNonEmpty(defaults[key])) {
      resolved[key] = { value: defaults[key], source: 'default' }
    }
  }
  return resolved
}

/**
 * Apply a merged config onto a target env map. Only values that the system env
 * does NOT already provide are written — i.e. `app` overrides and `default`
 * fills. System-sourced values are left untouched (they're already present).
 * Returns the keys that were actually written, sorted.
 */
export function applyMergedConfig(
  target: Record<string, string | undefined>,
  merged: Record<string, ResolvedValue>
): string[] {
  const applied: string[] = []
  for (const [key, resolved] of Object.entries(merged)) {
    if (resolved.source === 'system') continue
    target[key] = resolved.value
    applied.push(key)
  }
  return applied.sort()
}

export interface ValidationError {
  key: string
  message: string
}

const URL_LIKE_KEY_RE = /(_URL|_ENDPOINT|PROXY)$/

/** True if `value` contains any whitespace or ASCII control character (incl.
 *  DEL). Implemented via code-point inspection to avoid embedding control-char
 *  literals in source. */
function hasWhitespaceOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true // control chars (incl. tab/newline)
    if (code === 0x20) return true // space
  }
  return false
}

/**
 * Validate override values (FR-011). URL-like keys (`*_URL`, `*_ENDPOINT`,
 * `*PROXY`) must be parseable http(s)/socks URLs; credential-like values must not
 * contain whitespace or control characters. Returns an empty array when valid.
 * Pure — callers decide whether to reject input or skip the offending keys.
 */
export function validateEnvOverrides(values: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = []
  for (const [key, value] of Object.entries(values)) {
    if (!isNonEmpty(value)) continue

    if (URL_LIKE_KEY_RE.test(key)) {
      let parsed: URL | null = null
      try {
        parsed = new URL(value)
      } catch {
        parsed = null
      }
      if (!parsed || !/^(https?|socks[45]?):$/.test(parsed.protocol)) {
        errors.push({ key, message: `${key} must be a valid http(s)/socks URL` })
      }
    } else if (hasWhitespaceOrControl(value)) {
      errors.push({ key, message: `${key} must not contain whitespace or control characters` })
    }
  }
  return errors
}
