import type { Role } from '@shared/types'
import type {
  NormalizedSynergyRow,
  SynergyProvider,
  SynergyProviderTarget
} from './synergyProvider'

/**
 * lolalytics-backed `SynergyProvider`.
 *
 * Reuses the exact Qwik-JSON decode technique as `LolalyticsStatsProvider`
 * (Principle VII), but reads per-champion **build pages** instead of tier-list
 * pages. A build page embeds a champion-id → {win-rate, games} map for the
 * champion's ally synergies; we resolve those ids to Data Dragon slugs and emit
 * one `NormalizedSynergyRow` per ally.
 *
 * IMPORTANT (research.md §2 / tasks.md T012): the field name for the games count
 * on champion build pages may be `n` rather than `games`, and a build page can
 * contain more than one champion-id-keyed stat map (e.g. counters vs synergy).
 * `parseSynergyHtml` is therefore tolerant of both field names and selects the
 * densest champion-id-keyed stat map; the exact map MUST be confirmed against a
 * live payload dump before relying on the data. On any miss the provider returns
 * an empty set for that target and the engine falls back to overall WR (research §3).
 *
 * Like the stats provider this is best-effort/fragile and intended for personal
 * use only; a failed fetch downgrades freshness and the app keeps serving cached
 * recommendations (startStatsRefresh / research.md §5).
 */

const LANE_BY_ROLE: Readonly<Record<Role, string>> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'middle',
  BOTTOM: 'bottom',
  SUPPORT: 'support'
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface LolalyticsMatchupProviderOptions {
  /** Riot numeric champion id → Data Dragon slug (built from the champions table). */
  idToKey: Map<number, string>
  /** Data Dragon slug → numeric id (reverse map, kept for symmetry / future use). */
  keyToId: Map<string, number>
  /** Ranked tier bucket, e.g. "emerald" (lolalytics default). */
  tier?: string
  /** Drop synergy rows below this sample size to avoid noise. */
  minGames?: number
  baseUrl?: string
  ddragonVersionsUrl?: string
  userAgent?: string
  fetchImpl?: typeof fetch
}

/** A stat-shaped object on a build page: has a win rate and a games count.
 *  The games field may be `games` (tier-list naming) or `n` (build-page naming). */
function gamesCountField(o: Record<string, unknown>): 'games' | 'n' | null {
  if ('games' in o) return 'games'
  if ('n' in o) return 'n'
  return null
}

function isSynergyStatObject(o: unknown): o is Record<string, unknown> {
  return (
    typeof o === 'object' &&
    o !== null &&
    !Array.isArray(o) &&
    'wr' in (o as Record<string, unknown>) &&
    gamesCountField(o as Record<string, unknown>) !== null
  )
}

/**
 * Pure decode of one lolalytics build page → ally synergy rows for `championKey`
 * in `role`. Exported so the Qwik-payload parsing is unit-testable without a
 * network call. Returns `[]` (never throws) when no synergy map can be located —
 * the caller treats that as "no data" and applies the overall-WR fallback.
 */
export function parseSynergyHtml(
  html: string,
  championKey: string,
  role: Role,
  patch: string,
  idToKey: Map<number, string>,
  minGames: number
): NormalizedSynergyRow[] {
  const script = html.match(/<script\s+type="qwik\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!script) return []

  let objs: unknown[]
  try {
    objs = (JSON.parse(script[1]) as { objs?: unknown[] }).objs ?? []
  } catch {
    return []
  }
  if (!Array.isArray(objs) || objs.length === 0) return []

  // base-36 token → resolved value (one hop; sufficient for these scalar fields).
  const toIndex = (t: unknown): number =>
    typeof t === 'string' && /^[0-9a-z]+$/.test(t) ? parseInt(t, 36) : -1
  const resolve = (t: unknown): unknown => {
    const i = toIndex(t)
    return i >= 0 && i < objs.length ? objs[i] : t
  }

  // Index every synergy-stat-shaped object, then find the champion-id → stat map:
  // the object whose keys are numeric champion ids and whose values reference those
  // stat objects. We pick the densest such map (most stat references).
  const statIndices = new Set<number>()
  objs.forEach((o, i) => {
    if (isSynergyStatObject(o)) statIndices.add(i)
  })
  if (statIndices.size === 0) return []

  const minContainerHits = Math.max(3, Math.floor(statIndices.size / 2))
  let container: Record<string, unknown> | null = null
  let bestHits = 0
  for (const o of objs) {
    if (typeof o !== 'object' || o === null || Array.isArray(o)) continue
    const entries = Object.entries(o as Record<string, unknown>)
    // A synergy map is keyed by numeric champion ids that resolve to stat objects.
    const hits = entries.filter(
      ([k, v]) => /^\d+$/.test(k) && statIndices.has(toIndex(v))
    ).length
    if (hits > bestHits) {
      bestHits = hits
      container = o as Record<string, unknown>
    }
  }
  if (!container || bestHits < minContainerHits) return []

  const rows: NormalizedSynergyRow[] = []
  for (const [cidStr, ref] of Object.entries(container)) {
    if (!/^\d+$/.test(cidStr)) continue
    const allyChampionId = Number(cidStr)
    const allyChampionKey = idToKey.get(allyChampionId)
    if (!allyChampionKey || allyChampionKey === championKey) continue // skip self / unknown

    const stat = resolve(ref)
    if (!isSynergyStatObject(stat)) continue
    const gamesField = gamesCountField(stat)
    if (!gamesField) continue

    const winRate = Number(resolve(stat.wr))
    const gamesPlayed = Number(resolve(stat[gamesField]))
    if (!Number.isFinite(winRate) || winRate <= 0) continue
    if (Number.isFinite(gamesPlayed) && gamesPlayed < minGames) continue

    rows.push({
      championKey,
      role,
      allyChampionKey,
      winRate: Math.max(0, Math.min(100, winRate)),
      gamesPlayed: Number.isFinite(gamesPlayed) ? Math.floor(gamesPlayed) : 0,
      patch
    })
  }
  return rows
}

export class LolalyticsMatchupProvider implements SynergyProvider {
  private readonly fetchImpl: typeof fetch
  private readonly tier: string
  private readonly minGames: number
  private readonly baseUrl: string
  private readonly ddragonVersionsUrl: string
  private readonly userAgent: string

  constructor(private readonly options: LolalyticsMatchupProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.tier = options.tier ?? 'emerald'
    this.minGames = options.minGames ?? 100
    this.baseUrl = options.baseUrl ?? 'https://lolalytics.com'
    this.ddragonVersionsUrl =
      options.ddragonVersionsUrl ?? 'https://ddragon.leagueoflegends.com/api/versions.json'
    this.userAgent = options.userAgent ?? DEFAULT_UA
  }

  async fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]> {
    if (targets.length === 0) return []
    const patch = await this.resolvePatch()

    const out: NormalizedSynergyRow[] = []
    for (const target of targets) {
      // Per-target error handling: a single failed/parse-less page is logged and
      // skipped — partial results are returned (contract §error handling, FR-014).
      try {
        const html = await this.getBuildPage(target.championKey, target.role)
        out.push(
          ...parseSynergyHtml(
            html,
            target.championKey,
            target.role,
            patch,
            this.options.idToKey,
            this.minGames
          )
        )
      } catch (err) {
        console.warn(
          `lolalytics synergy fetch failed for ${target.championKey}/${target.role}: ${(err as Error).message}`
        )
      }
    }
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

  private async getBuildPage(championKey: string, role: Role): Promise<string> {
    const lane = LANE_BY_ROLE[role]
    const url = `${this.baseUrl}/lol/${championKey.toLowerCase()}/build/?lane=${lane}&tier=${this.tier}`
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent } })
    if (!res.ok) throw new Error(`lolalytics returned HTTP ${res.status} for ${championKey}/${lane}`)
    return res.text()
  }
}
