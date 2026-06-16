import type { StatsProvider } from './statsProvider'
import type { SynergyProvider, SynergyProviderTarget } from './synergyProvider'
import type { StatsRepository } from '../db/repositories/statsRepository'
import type { SynergyRepository } from '../db/repositories/synergyRepository'
import type { SettingsRepository } from '../db/repositories/settingsRepository'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface StatsRefreshDeps {
  /** The live provider, or null when no stats endpoint is configured (offline-only). */
  provider: StatsProvider | null
  stats: StatsRepository
  settings: SettingsRepository
  /** Ally-synergy provider, or null/omitted when synergy refresh is disabled. */
  synergyProvider?: SynergyProvider | null
  /** Persists fetched synergy rows; required when `synergyProvider` is set. */
  synergy?: SynergyRepository
  /** Supplies the current pool's (championKey, role) pairs to fetch synergy for. */
  getSynergyTargets?: () => SynergyProviderTarget[]
  /** Invoked after a successful refresh so the UI can re-render with fresh stats. */
  onRefreshed?: () => void
}

function isStale(lastFetchAt: string | null, freshnessHours: number, now: number): boolean {
  if (!lastFetchAt) return true
  const ageMs = now - new Date(lastFetchAt).getTime()
  return ageMs >= freshnessHours * 60 * 60 * 1000
}

/**
 * Background stats refresh scheduler (research.md §1). Runs once on start if the
 * cache is older than the freshness threshold, then on a 24h interval. A thrown
 * provider error downgrades freshness via `markFetchError()` without touching the
 * existing cached rows — the app keeps serving cached/stale recommendations.
 *
 * Returns a stop function (clears the interval).
 */
export function startStatsRefresh(deps: StatsRefreshDeps): () => void {
  const run = async (): Promise<void> => {
    if (!deps.provider) return // no endpoint configured → rely on bundled/cached stats
    const settings = deps.settings.get()
    if (!isStale(settings.lastStatsFetchAt, settings.statsFreshnessHours, Date.now())) return
    try {
      const rows = await deps.provider.fetchChampionStats()
      deps.stats.upsertStats(rows)
      // Refresh pool-scoped ally synergy in the same cycle (research.md §5). This is
      // best-effort: a synergy failure is logged but does not fail the overall
      // refresh — the engine falls back to overall WR for the ally component.
      await refreshSynergy(deps)
      deps.onRefreshed?.()
    } catch {
      deps.stats.markFetchError()
    }
  }

  void run()
  const interval = setInterval(() => void run(), REFRESH_INTERVAL_MS)
  return () => clearInterval(interval)
}

async function refreshSynergy(deps: StatsRefreshDeps): Promise<void> {
  if (!deps.synergyProvider || !deps.synergy || !deps.getSynergyTargets) return
  const targets = deps.getSynergyTargets()
  if (targets.length === 0) return
  try {
    const rows = await deps.synergyProvider.fetchSynergyStats(targets)
    if (rows.length > 0) deps.synergy.upsertSynergy(rows)
  } catch (err) {
    console.warn(`synergy refresh failed: ${(err as Error).message}`)
  }
}
