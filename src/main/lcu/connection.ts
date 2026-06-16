import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpsRequest, Agent } from 'node:https'

export interface LcuCredentials {
  port: number
  password: string
  protocol: string
  authHeader: string
  agent: Agent
}

export interface ParsedLockfile {
  processName: string
  pid: string
  port: number
  password: string
  protocol: string
}

/**
 * Candidate lockfile locations, highest-priority first. The League Client writes
 * its `lockfile` into its **install directory** (default `C:\Riot Games\League of
 * Legends`), NOT into `%LOCALAPPDATA%` — the latter only holds the *Riot Client*
 * lockfile under `Riot Client\Config\`. The old `%LOCALAPPDATA%\…\League of
 * Legends` path is kept last purely as a defensive fallback. Point
 * `LBP_LCU_LOCKFILE` at the lockfile directly for a non-standard install.
 */
export function lockfileCandidates(): string[] {
  const leagueSubpath = join('Riot Games', 'League of Legends', 'lockfile')
  const candidates: string[] = []

  const override = process.env['LBP_LCU_LOCKFILE']
  if (override) candidates.push(override)

  // Riot's default install root is `<systemdrive>:\Riot Games`; cover that plus
  // the Program Files variants some users relocate to.
  const systemDrive = process.env['SystemDrive'] ?? 'C:'
  const installRoots = [
    join(systemDrive + '\\'),
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramW6432']
  ]
  for (const root of installRoots) {
    if (root) candidates.push(join(root, leagueSubpath))
  }

  // Legacy (incorrect) location this app originally shipped with — last resort.
  const localAppData = process.env['LOCALAPPDATA']
  if (localAppData) candidates.push(join(localAppData, leagueSubpath))

  // ProgramFiles / ProgramW6432 collapse to the same path on 64-bit Windows.
  return [...new Set(candidates)]
}

/** First existing lockfile among {@link lockfileCandidates}, falling back to the
 *  canonical install default when no client has written one yet. */
export function defaultLockfilePath(): string {
  const candidates = lockfileCandidates()
  return candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1]
}

/** Parse the colon-delimited `processName:pid:port:password:protocol` lockfile. */
export function parseLockfile(content: string): ParsedLockfile | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const [processName, pid, port, password, protocol] = parts
  const portNum = Number(port)
  if (!Number.isFinite(portNum)) return null
  return { processName, pid, port: portNum, password, protocol }
}

function buildAgent(): Agent {
  const pemPath = join(__dirname, 'riotgames.pem')
  if (existsSync(pemPath)) {
    // Trust Riot's published LCU root certificate rather than disabling
    // verification outright (Constitution Principle II / research.md §2).
    return new Agent({ ca: readFileSync(pemPath) })
  }
  // The official riotgames.pem should be bundled for production. Only fall back to
  // localhost-scoped insecure TLS when a developer explicitly opts in.
  const insecure = process.env['LBP_LCU_INSECURE'] === '1'
  return new Agent({ rejectUnauthorized: !insecure })
}

/** Discover + authenticate LCU credentials; `null` if no client is running. */
export function discoverCredentials(lockfilePath: string = defaultLockfilePath()): LcuCredentials | null {
  if (!existsSync(lockfilePath)) return null
  const parsed = parseLockfile(readFileSync(lockfilePath, 'utf8'))
  if (!parsed) return null
  const authHeader = 'Basic ' + Buffer.from(`riot:${parsed.password}`).toString('base64')
  return {
    port: parsed.port,
    password: parsed.password,
    protocol: parsed.protocol,
    authHeader,
    agent: buildAgent()
  }
}

export interface LcuResponse<T> {
  status: number
  body: T | null
}

/** Read-only GET against the LCU. Resolves `{ status, body }`; rejects only on
 *  transport/parse errors. 404 and non-2xx resolve with `body: null`. */
export function lcuGet<T>(creds: LcuCredentials, path: string): Promise<LcuResponse<T>> {
  return new Promise<LcuResponse<T>>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: '127.0.0.1',
        port: creds.port,
        path,
        method: 'GET',
        agent: creds.agent,
        headers: { Authorization: creds.authHeader, Accept: 'application/json' }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            resolve({ status, body: null })
            return
          }
          try {
            resolve({ status, body: data ? (JSON.parse(data) as T) : null })
          } catch (err) {
            reject(new Error(`LCU response parse error for ${path}: ${(err as Error).message}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}
