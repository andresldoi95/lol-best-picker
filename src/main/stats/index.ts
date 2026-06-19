import type { StatsProvider } from './statsProvider'
import type {
  BuildStatsProvider,
  SynergyProvider,
  SynergyProviderTarget
} from './synergyProvider'
import type { StatsRepository } from '../db/repositories/statsRepository'
import type { SynergyRepository } from '../db/repositories/synergyRepository'
import type { SettingsRepository } from '../db/repositories/settingsRepository'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface StatsRefreshDeps {
  /** The live provider, or null when no stats endpoint is configured (offline-only). */
  provider: StatsProvider | null
  stats: StatsRepository
  settings: SettingsRepository
  /** Build-page provider (enemy matchups + ally synergy), or null/omitted to disable. */
  synergyProvider?: (SynergyProvider & Partial<BuildStatsProvider>) | null
  /** Persists fetched synergy rows; required when `synergyProvider` is set. */
  synergy?: SynergyRepository
  /** Supplies the current pool's (championKey, role) pairs to fetch build stats for. */
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
    const now = Date.now()
    const stale = isStale(settings.lastStatsFetchAt, settings.statsFreshnessHours, now)
    // Backfill pool-scoped matchups even when the overall cache is fresh — otherwise
    // a recent overall-only fetch would block matchups from ever populating until the
    // 24h window elapses (the bug where enemy/ally scores stayed identical).
    const needMatchups = !deps.stats.hasMatchupRows()
    // Likewise, refresh synergy whenever it hasn't successfully rendered or has gone
    // stale. Synergy freshness is tracked independently (spec 004), so a fresh overall
    // stats cache must not pin synergy to a failed/empty state for 24h — note a failed
    // render still stamps last_synergy_fetch_at, so status (not age) is the signal.
    const needSynergy =
      !!deps.synergyProvider &&
      (settings.lastSynergyFetchStatus !== 'rendered' ||
        isStale(settings.lastSynergyFetchAt, settings.statsFreshnessHours, now))
    if (!stale && !needMatchups && !needSynergy) return

    let changed = false
    if (stale) {
      try {
        const rows = await deps.provider.fetchChampionStats()
        deps.stats.upsertStats(rows)
        changed = true
      } catch {
        deps.stats.markFetchError()
      }
    }
    // Pool-scoped enemy matchups + ally synergy (research.md §5). Best-effort: a
    // failure is logged but never fails the overall refresh — the engine falls back
    // to overall WR for whichever signal is absent.
    if (await refreshBuildStats(deps)) changed = true

    if (changed) deps.onRefreshed?.()
  }

  void run()
  const interval = setInterval(() => void run(), REFRESH_INTERVAL_MS)
  return () => clearInterval(interval)
}

/** Fetch the pool's build-page stats and persist enemy matchups + ally synergy.
 *  Returns true when anything was persisted. */
async function refreshBuildStats(deps: StatsRefreshDeps): Promise<boolean> {
  const provider = deps.synergyProvider
  if (!provider || !deps.getSynergyTargets) return false
  const targets = deps.getSynergyTargets()
  console.log(`[synergy] build-stats refresh: ${targets.length} pool target(s)`)
  if (targets.length === 0) return false
  try {
    if (typeof provider.fetchBuildStats === 'function') {
      const { matchups, synergy } = await provider.fetchBuildStats(targets)
      let changed = false
      if (matchups.length > 0) {
        deps.stats.upsertStats(matchups) // matchup-specific champion_stats rows
        changed = true
      }
      if (synergy.length > 0 && deps.synergy) {
        deps.synergy.upsertSynergy(synergy)
        deps.synergy.markSynergyFetchRendered() // spec 004 US2 — record live render success
        changed = true
      }
      return changed
    }
    // Fallback for a synergy-only provider (no build-page matchups available).
    const rows = await provider.fetchSynergyStats(targets)
    if (rows.length > 0 && deps.synergy) {
      deps.synergy.upsertSynergy(rows)
      deps.synergy.markSynergyFetchRendered() // spec 004 US2 — record live render success
      return true
    }
    return false
  } catch (err) {
    console.warn(`build-stats refresh failed: ${(err as Error).message}`)
    deps.synergy?.markSynergyFetchError() // spec 004 US2 — record failure; cache untouched
    return false
  }
}
