import type { StatsProvider, NormalizedChampionStat } from './statsProvider'
import type { Role } from '@shared/types'

/**
 * lolalytics-backed `StatsProvider`.
 *
 * lolalytics exposes no documented JSON API (their internal `*.lolalytics.com`
 * feed is obfuscated and ToS-restricted, and u.gg/op.gg are Cloudflare-walled),
 * so this reads the **server-rendered tier-list page** for each lane and decodes
 * the embedded Qwik state payload. That payload is plain JSON: an `objs` array
 * where object fields hold base-36 string indices back into `objs`. We locate the
 * champion-id → stat-object map, resolve each champion's win rate, and emit one
 * overall row per (champion, role).
 *
 * This is best-effort/offline-first's live counterpart: it is inherently fragile
 * (it breaks if lolalytics drops Qwik or renames the `wr`/`games` fields) and is
 * intended for personal use only. On any failure the scheduler downgrades
 * freshness and keeps serving cached rows (see startStatsRefresh / research.md §5).
 */

const LANES: ReadonlyArray<{ readonly lane: string; readonly role: Role }> = [
  { lane: 'top', role: 'TOP' },
  { lane: 'jungle', role: 'JUNGLE' },
  { lane: 'middle', role: 'MIDDLE' },
  { lane: 'bottom', role: 'BOTTOM' },
  { lane: 'support', role: 'SUPPORT' }
]

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface LolalyticsStatsProviderOptions {
  /** Riot numeric champion id → Data Dragon slug (built from the champions table). */
  idToKey: Map<number, string>
  /** Ranked tier bucket, e.g. "emerald" (lolalytics default), "all", "diamond_plus". */
  tier?: string
  /** Drop rows below this sample size to avoid noisy off-role picks. */
  minGames?: number
  baseUrl?: string
  ddragonVersionsUrl?: string
  userAgent?: string
  fetchImpl?: typeof fetch
}

function isStatObject(o: unknown): o is Record<string, unknown> {
  return (
    typeof o === 'object' &&
    o !== null &&
    !Array.isArray(o) &&
    'wr' in (o as Record<string, unknown>) &&
    'games' in (o as Record<string, unknown>) &&
    'pr' in (o as Record<string, unknown>)
  )
}

/**
 * Pure decode of one lolalytics tier-list page → overall win-rate rows for `role`.
 * Exported so the Qwik-payload parsing is unit-testable without a network call.
 */
export function parseTierlistHtml(
  html: string,
  role: Role,
  patch: string,
  idToKey: Map<number, string>,
  minGames: number
): NormalizedChampionStat[] {
  const script = html.match(/<script\s+type="qwik\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!script) throw new Error('lolalytics: qwik/json payload not found (page layout changed?)')

  let objs: unknown[]
  try {
    objs = (JSON.parse(script[1]) as { objs?: unknown[] }).objs ?? []
  } catch (err) {
    throw new Error(`lolalytics: qwik payload parse error: ${(err as Error).message}`)
  }
  if (!Array.isArray(objs) || objs.length === 0) {
    throw new Error('lolalytics: qwik payload has no objs array')
  }

  // base-36 token → resolved value (one hop; sufficient for these scalar fields).
  const toIndex = (t: unknown): number =>
    typeof t === 'string' && /^[0-9a-z]+$/.test(t) ? parseInt(t, 36) : -1
  const resolve = (t: unknown): unknown => {
    const i = toIndex(t)
    return i >= 0 && i < objs.length ? objs[i] : t
  }

  // Index every stat-shaped object, then find the champion-id → stat map: the
  // object whose values are mostly references to those stat objects.
  const statIndices = new Set<number>()
  objs.forEach((o, i) => {
    if (isStatObject(o)) statIndices.add(i)
  })

  // The real map references (nearly) every stat object; require it to cover at
  // least half of them so we never latch onto an incidental small object.
  const minContainerHits = Math.max(3, Math.floor(statIndices.size / 2))
  let container: Record<string, unknown> | null = null
  let bestHits = 0
  for (const o of objs) {
    if (typeof o !== 'object' || o === null || Array.isArray(o)) continue
    const entries = Object.entries(o as Record<string, unknown>)
    const hits = entries.filter(([, v]) => statIndices.has(toIndex(v))).length
    if (hits > bestHits) {
      bestHits = hits
      container = o as Record<string, unknown>
    }
  }
  if (!container || bestHits < minContainerHits) {
    throw new Error('lolalytics: champion→stats map not found in payload')
  }

  const rows: NormalizedChampionStat[] = []
  for (const [cidStr, ref] of Object.entries(container)) {
    const championId = Number(cidStr)
    const championKey = idToKey.get(championId)
    if (!championKey) continue
    const stat = resolve(ref)
    if (!isStatObject(stat)) continue

    const winRate = Number(resolve(stat.wr))
    const gamesPlayed = Number(resolve(stat.games))
    if (!Number.isFinite(winRate) || winRate <= 0) continue
    if (Number.isFinite(gamesPlayed) && gamesPlayed < minGames) continue

    // Pick rate (presence) — carried for ban ranking; null if absent/malformed.
    const pickRateRaw = Number(resolve(stat.pr))
    const pickRate = Number.isFinite(pickRateRaw) ? Math.max(0, Math.min(100, pickRateRaw)) : null

    rows.push({
      championKey,
      role,
      opponentChampionKey: null,
      winRate: Math.max(0, Math.min(100, winRate)),
      pickRate,
      gamesPlayed: Number.isFinite(gamesPlayed) ? Math.floor(gamesPlayed) : 0,
      patch
    })
  }
  return rows
}

export class LolalyticsStatsProvider implements StatsProvider {
  private readonly fetchImpl: typeof fetch
  private readonly tier: string
  private readonly minGames: number
  private readonly baseUrl: string
  private readonly ddragonVersionsUrl: string
  private readonly userAgent: string

  constructor(private readonly options: LolalyticsStatsProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.tier = options.tier ?? 'emerald'
    this.minGames = options.minGames ?? 100
    this.baseUrl = options.baseUrl ?? 'https://lolalytics.com'
    this.ddragonVersionsUrl =
      options.ddragonVersionsUrl ?? 'https://ddragon.leagueoflegends.com/api/versions.json'
    this.userAgent = options.userAgent ?? DEFAULT_UA
  }

  async fetchChampionStats(): Promise<NormalizedChampionStat[]> {
    const patch = await this.resolvePatch()
    const out: NormalizedChampionStat[] = []
    for (const { lane, role } of LANES) {
      const html = await this.getPage(lane)
      out.push(...parseTierlistHtml(html, role, patch, this.options.idToKey, this.minGames))
    }
    if (out.length === 0) throw new Error('lolalytics returned no usable stat rows')
    return out
  }

  /** Current patch label (e.g. "16.12") from the official Data Dragon version list. */
  private async resolvePatch(): Promise<string> {
    const res = await this.fetchImpl(this.ddragonVersionsUrl, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`Data Dragon versions HTTP ${res.status}`)
    const versions = (await res.json()) as string[]
    const full = versions[0]
    if (typeof full !== 'string') throw new Error('Data Dragon returned no versions')
    return full.split('.').slice(0, 2).join('.')
  }

  private async getPage(lane: string): Promise<string> {
    const url = `${this.baseUrl}/lol/tierlist/?lane=${lane}&tier=${this.tier}`
    let res: Response
    try {
      res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent } })
    } catch (err) {
      throw new Error(`lolalytics request failed (${lane}): ${(err as Error).message}`)
    }
    if (!res.ok) throw new Error(`lolalytics returned HTTP ${res.status} for ${lane}`)
    return res.text()
  }
}
