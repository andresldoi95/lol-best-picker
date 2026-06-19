/**
 * Read/write the application-level `.env.local` override file (spec 005 FR-004).
 *
 * The parse/serialize halves are pure and unit-tested; `readEnvLocal` /
 * `writeEnvLocal` are thin fs wrappers (tested against a temp file, mirroring the
 * repository integration tests). No Electron import — see paths.ts for rationale.
 *
 * Format is a conventional `.env`: `KEY=VALUE` per line, `#` comments, blank
 * lines ignored, `export ` prefix tolerated, values optionally quoted. We never
 * log values here (Constitution II — credentials must not leak).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Valid POSIX/Windows environment variable name (what we accept as a key). */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Strip one layer of matching surrounding single/double quotes from a value. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = value.slice(1, -1)
      // Only double quotes carry escapes (\" and \\); single quotes are literal.
      return first === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner
    }
  }
  return value
}

/**
 * Parse a `.env` file body into a key→value map. Malformed lines (no `=`, empty
 * or invalid key) are skipped rather than throwing — a partially-corrupt file
 * still yields whatever valid overrides it contains (offline-first resilience).
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const eq = withoutExport.indexOf('=')
    if (eq === -1) continue

    const key = withoutExport.slice(0, eq).trim()
    if (!ENV_KEY_RE.test(key)) continue

    result[key] = unquote(withoutExport.slice(eq + 1).trim())
  }
  return result
}

/** True when a value must be quoted to survive a round-trip through the parser. */
function needsQuoting(value: string): boolean {
  return value === '' || /[\s#"'=]/.test(value)
}

/**
 * Serialize a key→value map into a `.env` file body. Keys are sorted for stable
 * diffs; values are double-quoted (with `"`/`\` escaped) only when necessary.
 * `parseEnvFile(serializeEnvFile(x))` round-trips for any valid input.
 */
export function serializeEnvFile(values: Record<string, string>): string {
  const header =
    '# LoL Best Picker — application-level environment overrides.\n' +
    '# Managed by the installer; values here take precedence over system env vars.\n'

  const lines = Object.keys(values)
    .filter((key) => ENV_KEY_RE.test(key))
    .sort()
    .map((key) => {
      const raw = values[key]
      const value = needsQuoting(raw) ? `"${raw.replace(/([\\"])/g, '\\$1')}"` : raw
      return `${key}=${value}`
    })

  return `${header}${lines.join('\n')}\n`
}

/** Read and parse `.env.local`; returns `{}` when the file is absent. */
export function readEnvLocal(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {}
  return parseEnvFile(readFileSync(filePath, 'utf8'))
}

/** Write `.env.local`, creating the parent directory if needed. */
export function writeEnvLocal(filePath: string, values: Record<string, string>): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, serializeEnvFile(values), { encoding: 'utf8' })
}
