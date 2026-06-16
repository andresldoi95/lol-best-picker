import type { StatsProvider } from './statsProvider'
import type { StatsRepository } from '../db/repositories/statsRepository'
import type { SettingsRepository } from '../db/repositories/settingsRepository'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface StatsRefreshDeps {
  /** The live provider, or null when no stats endpoint is configured (offline-only). */
  provider: StatsProvider | null
  stats: StatsRepository
  settings: SettingsRepository
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
      deps.onRefreshed?.()
    } catch {
      deps.stats.markFetchError()
    }
  }

  void run()
  const interval = setInterval(() => void run(), REFRESH_INTERVAL_MS)
  return () => clearInterval(interval)
}
