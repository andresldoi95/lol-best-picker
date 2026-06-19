import type { EloTier } from '@shared/types'
import { LolalyticsStatsProvider } from './lolalyticsStatsProvider'
import type { BanStatsRepository, NormalizedBanStat } from '../db/repositories/banStatsRepository'
import type { SettingsRepository } from '../db/repositories/settingsRepository'

/**
 * Ban-stats fetch + refresh orchestration (spec 007, FR-006). Ban recommendations
 * are the top win-rate champions per role at a given Elo — which is exactly the
 * overall-win-rate data the pick pipeline already scrapes from lolalytics'
 * tier-list pages. So instead of a second scraper we **reuse `LolalyticsStatsProvider`**
 * (Constitution VII / FR-006): it fetches the five lane pages at a configurable
 * `tier` and decodes overall win rates. `EloTier` values are lolalytics' own tier
 * slugs ('emerald', 'diamond', …), so the tier passes straight through.
 *
 * The reused parser now also surfaces pick rate (presence), which ban ranking needs
 * for its threat score `(winRate − 50) × pickRate` (spec 007).
 */

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface FetchBanStatsOptions {
  /** Riot numeric champion id → Data Dragon slug (built from the champions table). */
  idToKey: Map<number, string>
  /** Drop rows below this sample size; forwarded to the reused provider. */
  minGames?: number
  /** Injectable for tests; defaults to the real lolalytics scrape. */
  fetchImpl?: typeof fetch
}

/**
 * Fetch normalized ban rows for a single Elo tier from lolalytics (T007). Throws on
 * network/parse error or empty result (same contract as `fetchChampionStats`), so
 * the caller can downgrade freshness without poisoning the cache.
 */
export async function fetchBanStatsForElo(
  elo: EloTier,
  options: FetchBanStatsOptions
): Promise<NormalizedBanStat[]> {
  const provider = new LolalyticsStatsProvider({
    idToKey: options.idToKey,
    tier: elo, // EloTier === lolalytics tier slug
    minGames: options.minGames,
    fetchImpl: options.fetchImpl
  })
  const rows = await provider.fetchChampionStats()
  return rows.map((r) => ({
    championKey: r.championKey,
    role: r.role,
    eloTier: elo,
    winRate: r.winRate,
    pickRate: r.pickRate ?? null,
    gamesPlayed: r.gamesPlayed,
    patch: r.patch
  }))
}

export interface BanStatsRefreshDeps {
  banStats: BanStatsRepository
  settings: SettingsRepository
  /** Resolves the Elo to fetch bans for — the LCU-derived current tier, or the
   *  default fallback (FR-009). Read on every run so a mid-session tier change is
   *  picked up by the next `refresh()`. */
  getCurrentElo: () => EloTier
  /** Riot id → slug map for the default lolalytics fetch. */
  idToKey: Map<number, string>
  /** Override the fetch (tests / alternate providers); defaults to lolalytics. */
  fetchBanStats?: (elo: EloTier) => Promise<NormalizedBanStat[]>
  /** Invoked after a successful refresh so the renderer can re-render fresh bans. */
  onRefreshed?: () => void
}

function isStale(lastFetchAt: string | null, freshnessHours: number, now: number): boolean {
  if (!lastFetchAt) return true
  return now - new Date(lastFetchAt).getTime() >= freshnessHours * 60 * 60 * 1000
}

/**
 * One-shot ban-stats refresh (T008). Fetches when the cache is stale OR the current
 * Elo has no cached rows yet (so a tier change to a never-seen Elo refetches even
 * while the overall cache is fresh). Best-effort: a thrown fetch error downgrades
 * freshness via `markFetchError()` and keeps the cached/seeded rows. Returns true
 * when rows were upserted.
 */
export async function refreshBanStats(deps: BanStatsRefreshDeps): Promise<boolean> {
  const elo = deps.getCurrentElo()
  const settings = deps.settings.get()
  const stale = isStale(settings.lastBanStatsFetchAt, settings.statsFreshnessHours, Date.now())
  const missing = !deps.banStats.hasBanStatsForElo(elo)
  if (!stale && !missing) return false

  try {
    const fetchFn =
      deps.fetchBanStats ?? ((e: EloTier) => fetchBanStatsForElo(e, { idToKey: deps.idToKey }))
    const rows = await fetchFn(elo)
    deps.banStats.upsertBanStats(rows)
    deps.onRefreshed?.()
    return true
  } catch (err) {
    console.warn(`[bans] stats refresh failed: ${(err as Error).message}`)
    deps.banStats.markFetchError()
    return false
  }
}

/**
 * Background ban-stats scheduler (T010), paralleling `startStatsRefresh`. Runs once
 * on start, then every 24h. Returns `stop` (clears the interval) and `refresh` (a
 * manual trigger the caller fires when the LCU resolves a new ranked tier so the
 * new Elo's bans load immediately rather than at the next interval).
 */
export function startBanStatsRefresh(deps: BanStatsRefreshDeps): {
  stop: () => void
  refresh: () => Promise<boolean>
} {
  const refresh = (): Promise<boolean> => refreshBanStats(deps)
  void refresh()
  const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
  return { stop: () => clearInterval(interval), refresh }
}
