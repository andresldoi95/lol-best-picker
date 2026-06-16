import { computeRecommendation } from '@recommendation/engine'
import type { ChampSelectSession, Recommendation } from '@shared/types'
import type { PoolRepository } from './db/repositories/poolRepository'
import type { StatsRepository } from './db/repositories/statsRepository'
import type { SettingsRepository } from './db/repositories/settingsRepository'
import type { SynergyRepository } from './db/repositories/synergyRepository'

/**
 * Orchestrates a recommendation: resolves the active role (manual override →
 * live LCU assignment → none), gathers pool + cached stats + synergy + freshness
 * from the repositories, and delegates the actual ranking to the pure engine.
 */
export class RecommendationService {
  constructor(
    private readonly pool: PoolRepository,
    private readonly stats: StatsRepository,
    private readonly synergy: SynergyRepository,
    private readonly settings: SettingsRepository,
    /** Supplies the current champ-select session (live LCU, or snapshot fallback). */
    private readonly getSession: () => ChampSelectSession
  ) {}

  getRecommendation(): Recommendation {
    const settings = this.settings.get()
    const session = this.getSession()

    // Role precedence: manual override → live assigned role → none (data-model.md).
    const role = settings.manualRole ?? session.assignedRole ?? null

    const poolEntries = this.pool.list().map((entry) => ({
      championId: entry.championId,
      championKey: entry.key,
      championName: entry.name,
      iconPath: entry.iconPath,
      role: entry.role,
      isActive: entry.isActive
    }))

    const championIds = poolEntries.map((entry) => entry.championId)
    const { rows: statRows, patch } = this.stats.getStatRowsForChampions(championIds)
    const synergyRows = this.synergy.getSynergyRowsForChampions(championIds)

    return computeRecommendation({
      poolEntries,
      statRows,
      synergyRows,
      role,
      enemyChampionIds: session.enemyChampionIds,
      allyChampionIds: session.allyChampionIds,
      statsAsOfPatch: patch,
      freshness: {
        lastFetchAt: settings.lastStatsFetchAt,
        lastFetchStatus: settings.lastStatsFetchStatus,
        thresholdHours: settings.statsFreshnessHours,
        now: new Date().toISOString()
      }
    })
  }
}
