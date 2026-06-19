import { rankBans } from '@recommendation/banRanker'
import { deriveFreshness } from '@recommendation/freshness'
import type { BanRecommendationSet, EloTier } from '@shared/types'
import { DEFAULT_ELO_TIER } from '@shared/types'
import type { BanStatsRepository } from './db/repositories/banStatsRepository'
import type { SettingsRepository } from './db/repositories/settingsRepository'

/** The Elo the app is currently using, and whether it was resolved from the LCU. */
export interface CurrentElo {
  tier: EloTier
  /** True when resolved from the LCU (FR-008); false when it's the default (FR-009). */
  resolved: boolean
}

/**
 * Orchestrates a ban-recommendation set: resolves the Elo (explicit request →
 * current LCU tier → default), reads the cached ban stats for it, delegates ranking
 * to the pure `banRanker`, and annotates freshness — the ban-side analogue of
 * `RecommendationService`. No scraping or wall-clock logic lives in the engine.
 */
export class BanRecommendationService {
  constructor(
    private readonly banStats: BanStatsRepository,
    private readonly settings: SettingsRepository,
    /** Supplies the current Elo (LCU-derived, or default fallback). */
    private readonly getCurrentElo: () => CurrentElo
  ) {}

  /**
   * Compute the ban set for `requestedElo` (or the current Elo when omitted). If the
   * chosen tier has no cached rows yet (e.g. the LCU resolved Diamond but only the
   * seeded Emerald data exists), fall back to the default tier's data so bans still
   * render, reporting the tier actually used (FR-009).
   */
  get(requestedElo?: EloTier | null): BanRecommendationSet {
    const current = this.getCurrentElo()
    let eloTier: EloTier = requestedElo ?? current.tier
    let eloResolved = requestedElo ? true : current.resolved

    let stats = this.banStats.getBanStatsByElo(eloTier)
    if (stats.length === 0 && eloTier !== DEFAULT_ELO_TIER) {
      const fallback = this.banStats.getBanStatsByElo(DEFAULT_ELO_TIER)
      if (fallback.length > 0) {
        stats = fallback
        eloTier = DEFAULT_ELO_TIER
        eloResolved = false
      }
    }

    const recommendations = rankBans({ stats, currentElo: eloTier })

    const settings = this.settings.get()
    const now = new Date().toISOString()
    const freshness = deriveFreshness({
      lastFetchAt: settings.lastBanStatsFetchAt,
      lastFetchStatus: settings.lastBanStatsFetchStatus,
      thresholdHours: settings.statsFreshnessHours,
      now
    })

    return {
      eloTier,
      eloResolved,
      recommendations,
      freshness,
      lastUpdatedAt: settings.lastBanStatsFetchAt ?? now
    }
  }
}
