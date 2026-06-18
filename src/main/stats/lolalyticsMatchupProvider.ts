import type { Role } from '@shared/types'
import type { NormalizedChampionStat } from './statsProvider'
import type {
  BuildStats,
  NormalizedSynergyRow,
  SynergyProvider,
  SynergyProviderTarget
} from './synergyProvider'

/**
 * lolalytics-backed `SynergyProvider`.
 *
 * Reuses the exact Qwik-JSON decode technique as `LolalyticsStatsProvider`
 * (Principle VII), reading per-champion **build pages** instead of tier-list
 * pages.
 *
 * IMPORTANT — verified against a live payload (Ahri/middle, see research.md §2 /
 * tasks.md T012): a build page's server-rendered Qwik payload carries the
 * champion's **counter** matchups (under an `enemy` key, grouped per lane as
 * arrays of `[id, wr, d1, d2, pr, n]` tuples — the `enemy_h` header confirms that
 * order) but does NOT embed ally-synergy data. The on-page "Synergy" table is
 * lazy-loaded client-side from the internal (obfuscated, ToS-restricted) API the
 * project deliberately avoids.
 *
 * `parseSynergyHtml` therefore targets a synergy-labelled section *by name*
 * (never the sibling `enemy`/counter data, so counter win-rates can never be
 * mislabelled as synergy) and parses the verified tuple shape when one is
 * present. On current pages no such section exists, so it returns an empty set
 * and the engine falls back to the champion's overall win rate for the ally
 * component (research §3). If lolalytics ever server-renders synergy in the same
 * tuple shape as `enemy`, this picks it up with no further change.
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

/**
 * Keys under which lolalytics groups *ally-synergy* matchup data on a build page.
 * Deliberately excludes `enemy` (counters): targeting synergy by label is what
 * guarantees counter win-rates can never be emitted as synergy. Matched as a
 * whole word so `enemy`, and incidental keys like `width`, never qualify.
 */
const SYNERGY_KEY = /^(synergy|team|teammate|teammates|ally|allies|duo|with)$/i

/**
 * Key under which lolalytics groups the page champion's *counter* matchups: the
 * candidate's win rate against each revealed enemy (verified `enemy.middle[0] =
 * [id, wr, …, games]`, research.md §2). Matched as a whole word so `enemy_h` (the
 * column-order header) and similar never qualify. This is the enemy-matchup signal
 * source — the synergy parser deliberately never reads it (see `SYNERGY_KEY`).
 */
const ENEMY_KEY = /^enemy$/i

/** A decoded matchup tuple: champion id, win rate (%) and games sample size. */
interface MatchupTuple {
  id: number
  wr: number
  games: number
}

interface DecodedPayload {
  objs: unknown[]
  /** Resolve one base-36 reference token to the value it points at (one hop). */
  resolve: (t: unknown) => unknown
}

/**
 * Decode a lolalytics server-rendered Qwik payload into its flat `objs` array plus
 * a one-hop reference resolver. Returns null when the page carries no parseable
 * payload (layout changed / not a build page) — callers treat that as "no data".
 */
function decodeQwikPayload(html: string): DecodedPayload | null {
  const script = html.match(/<script\s+type="qwik\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!script) return null

  let objs: unknown[]
  try {
    objs = (JSON.parse(script[1]) as { objs?: unknown[] }).objs ?? []
  } catch {
    return null
  }
  if (!Array.isArray(objs) || objs.length === 0) return null

  const toIndex = (t: unknown): number =>
    typeof t === 'string' && /^[0-9a-z]+$/.test(t) ? parseInt(t, 36) : -1
  const resolve = (t: unknown): unknown => {
    const i = toIndex(t)
    return i >= 0 && i < objs.length ? objs[i] : t
  }
  return { objs, resolve }
}

/**
 * Gather every matchup tuple reachable through an object key matching `keyPattern`.
 * Because traversal only ever follows values reached through that label, sibling
 * sections (e.g. `enemy` while collecting synergy, or item builds) are structurally
 * unreachable and can never leak in.
 */
function collectLabelledTuples(
  { objs, resolve }: DecodedPayload,
  keyPattern: RegExp
): MatchupTuple[] {
  const tuples: MatchupTuple[] = []
  for (const o of objs) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue
    for (const [key, val] of Object.entries(o as Record<string, unknown>)) {
      if (keyPattern.test(key)) collectTuples(resolve(val), resolve, tuples)
    }
  }
  return tuples
}

/**
 * Reduce raw tuples to one row per champion: resolve ids → slugs, drop the page
 * champion itself, unknown ids, and sub-`minGames` samples, and keep the
 * highest-sample row when a champion appears in more than one lane section.
 */
function dedupeByChampion(
  tuples: MatchupTuple[],
  idToKey: Map<number, string>,
  selfKey: string,
  minGames: number
): Map<string, { wr: number; games: number }> {
  const best = new Map<string, { wr: number; games: number }>()
  for (const t of tuples) {
    const championKey = idToKey.get(t.id)
    if (!championKey || championKey === selfKey) continue
    if (Number.isFinite(t.games) && t.games < minGames) continue
    const games = Number.isFinite(t.games) ? t.games : 0
    const prev = best.get(championKey)
    if (!prev || games > prev.games) best.set(championKey, { wr: t.wr, games })
  }
  return best
}

const clampWinRate = (wr: number): number => Math.max(0, Math.min(100, wr))

/**
 * Decode one lolalytics matchup tuple. The live `enemy_h` header pins the column
 * order as `[id, wr, d1, d2, pr, n]` (research.md §2): champion id first, win rate
 * second, games (`n`) last. Returns null for anything that isn't a champion tuple
 * (id outside 1..999 rules out item ids ≥ 1000; wr outside (0,100] rules out the
 * delta/pick-rate columns), so a stray array can never become a synergy row.
 */
function matchupTuple(arr: unknown, resolve: (t: unknown) => unknown): MatchupTuple | null {
  if (!Array.isArray(arr) || arr.length < 2) return null
  const id = Number(resolve(arr[0]))
  const wr = Number(resolve(arr[1]))
  const games = Number(resolve(arr[arr.length - 1]))
  if (!Number.isInteger(id) || id <= 0 || id >= 1000) return null
  if (!Number.isFinite(wr) || wr <= 0 || wr > 100) return null
  return { id, wr, games }
}

/**
 * Collect matchup tuples reachable at depth ≤ 1 from a synergy-labelled value:
 * either a flat array of tuples, or a lane-keyed object (`{top, jungle, …}`) of
 * tuple arrays — mirroring the verified `enemy` shape.
 */
function collectTuples(
  value: unknown,
  resolve: (t: unknown) => unknown,
  out: MatchupTuple[]
): void {
  const pushFrom = (arr: unknown): void => {
    if (!Array.isArray(arr)) return
    for (const el of arr) {
      const t = matchupTuple(resolve(el), resolve)
      if (t) out.push(t)
    }
  }
  if (Array.isArray(value)) {
    pushFrom(value)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) pushFrom(resolve(v))
  }
}

/**
 * Pure decode of one lolalytics build page → ally synergy rows for `championKey`
 * in `role`. Exported so the Qwik-payload parsing is unit-testable without a
 * network call.
 *
 * Locates the synergy section *by label* (`SYNERGY_KEY`), explicitly never the
 * sibling `enemy` (counter) data, then reads the verified matchup-tuple shape.
 * Returns `[]` (never throws) when no synergy section is present — the caller
 * treats that as "no data" and applies the overall-WR fallback. NOTE: live build
 * pages do not currently embed synergy (research.md §2), so this returns `[]` in
 * practice today.
 */
export function parseSynergyHtml(
  html: string,
  championKey: string,
  role: Role,
  patch: string,
  idToKey: Map<number, string>,
  minGames: number
): NormalizedSynergyRow[] {
  const decoded = decodeQwikPayload(html)
  if (!decoded) return []

  // Only synergy-labelled sections are traversed, so the sibling `enemy`/counter
  // map and the item build stats are structurally unreachable and can never leak in.
  const best = dedupeByChampion(
    collectLabelledTuples(decoded, SYNERGY_KEY),
    idToKey,
    championKey,
    minGames
  )

  const rows: NormalizedSynergyRow[] = []
  for (const [allyChampionKey, s] of best) {
    rows.push({
      championKey,
      role,
      allyChampionKey,
      winRate: clampWinRate(s.wr),
      gamesPlayed: Math.floor(s.games),
      patch
    })
  }
  return rows
}

/**
 * Pure decode of one lolalytics build page → the page champion's **enemy-matchup**
 * rows: its win rate against each counter listed under `ENEMY_KEY` (the candidate's
 * own win rate vs that enemy, research.md §2). Each becomes a matchup-specific
 * `NormalizedChampionStat` (`opponentChampionKey` set), which the engine averages
 * over the revealed enemies (FR-017). Returns `[]` (never throws) when no payload /
 * no `enemy` section is present. Exported so the parsing is unit-testable offline.
 *
 * Targets `ENEMY_KEY` *only* — never the sibling `synergy` section — so the two
 * signals are decoded from the same page without cross-contaminating each other.
 */
export function parseEnemyMatchupsHtml(
  html: string,
  championKey: string,
  role: Role,
  patch: string,
  idToKey: Map<number, string>,
  minGames: number
): NormalizedChampionStat[] {
  const decoded = decodeQwikPayload(html)
  if (!decoded) return []

  const best = dedupeByChampion(
    collectLabelledTuples(decoded, ENEMY_KEY),
    idToKey,
    championKey,
    minGames
  )

  const rows: NormalizedChampionStat[] = []
  for (const [opponentChampionKey, s] of best) {
    rows.push({
      championKey,
      role,
      opponentChampionKey,
      winRate: clampWinRate(s.wr),
      gamesPlayed: Math.floor(s.games),
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

  /**
   * Fetch each target's build page **once** and decode both signals from it: the
   * page champion's enemy matchups (the data lolalytics actually server-renders)
   * and ally synergy (empty on current pages — see `parseSynergyHtml`). Fetching
   * once and parsing both avoids hitting the same URL twice per refresh cycle.
   *
   * Per-target error handling: a single failed/parse-less page is logged and
   * skipped — partial results are returned (contract §error handling, FR-014).
   */
  async fetchBuildStats(targets: SynergyProviderTarget[]): Promise<BuildStats> {
    if (targets.length === 0) return { matchups: [], synergy: [] }
    const patch = await this.resolvePatch()

    const matchups: NormalizedChampionStat[] = []
    const synergy: NormalizedSynergyRow[] = []
    for (const target of targets) {
      try {
        const html = await this.getBuildPage(target.championKey, target.role)
        const { championKey, role } = target
        matchups.push(
          ...parseEnemyMatchupsHtml(html, championKey, role, patch, this.options.idToKey, this.minGames)
        )
        synergy.push(
          ...parseSynergyHtml(html, championKey, role, patch, this.options.idToKey, this.minGames)
        )
      } catch (err) {
        console.warn(
          `lolalytics build-page fetch failed for ${target.championKey}/${target.role}: ${(err as Error).message}`
        )
      }
    }
    return { matchups, synergy }
  }

  async fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]> {
    return (await this.fetchBuildStats(targets)).synergy
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
