import { describe, it, expect, afterEach } from 'vitest'
import { createHandlerMap, type IpcHandlerMap } from '@main/ipc/handlerMap'
import { IPC } from '@shared/ipcChannels'
import { PoolRepository } from '@main/db/repositories/poolRepository'
import { ChampionsRepository } from '@main/db/repositories/championsRepository'
import { SettingsRepository } from '@main/db/repositories/settingsRepository'
import { StatsRepository } from '@main/db/repositories/statsRepository'
import { SynergyRepository } from '@main/db/repositories/synergyRepository'
import { BanStatsRepository } from '@main/db/repositories/banStatsRepository'
import { RecommendationService } from '@main/recommendationService'
import { BanRecommendationService, type CurrentElo } from '@main/banRecommendationService'
import { seedBanStats } from '@main/stats/seedData'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'
import { ROLES, type BanRecommendationSet, type ChampSelectSession } from '@shared/types'

describe('ban:fetch-recommendations (IPC contract, spec 007 US1)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  /** Build the handler map over a temp DB. `seedBans` controls whether the bundled
   *  baseline ban rows (Emerald) are present; `elo` is the main-process current Elo. */
  function setup(opts: { seedBans?: boolean; elo?: CurrentElo } = {}): IpcHandlerMap {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)
    if (opts.seedBans !== false) seedBanStats(db)

    const pool = new PoolRepository(db)
    const champions = new ChampionsRepository(db)
    const settings = new SettingsRepository(db)
    const stats = new StatsRepository(db)
    const synergy = new SynergyRepository(db)
    const banStats = new BanStatsRepository(db)

    const session: ChampSelectSession = {
      active: false,
      phase: 'NONE',
      assignedRole: null,
      localPlayerCellId: null,
      enemyChampionIds: [],
      allyChampionIds: [],
      updatedAt: new Date().toISOString()
    }

    const recService = new RecommendationService(pool, stats, synergy, settings, () => session)
    const elo: CurrentElo = opts.elo ?? { tier: 'emerald', resolved: false }
    const banService = new BanRecommendationService(banStats, settings, () => elo)

    return createHandlerMap({
      pool,
      champions,
      settings,
      getRecommendation: () => recService.getRecommendation(),
      getChampSelectStatus: () => session,
      getBanRecommendations: (e) => banService.get(e)
    })
  }

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  it('returns ranked bans for the current Elo from the seeded baseline', () => {
    const map = setup()
    const result = map[IPC.BAN_FETCH_RECOMMENDATIONS](null) as BanRecommendationSet

    expect(result.eloTier).toBe('emerald')
    expect(result.recommendations.length).toBeGreaterThan(0)

    // Each role present in the data shows at most 3, ranked descending by threat
    // score (winRate edge × pick rate), not raw win rate.
    for (const role of ROLES) {
      const inRole = result.recommendations.filter((b) => b.role === role)
      expect(inRole.length).toBeLessThanOrEqual(3)
      for (let i = 1; i < inRole.length; i++) {
        expect(inRole[i - 1].banScore).toBeGreaterThanOrEqual(inRole[i].banScore)
        expect(inRole[i].rank).toBe(i + 1)
      }
    }
  })

  it('carries a freshness label and last-updated timestamp (US3)', () => {
    const map = setup()
    const result = map[IPC.BAN_FETCH_RECOMMENDATIONS](null) as BanRecommendationSet
    // Bundled seed data is not a live fetch → "stale" until a real fetch succeeds.
    expect(['live', 'cached', 'stale']).toContain(result.freshness)
    expect(result.freshness).toBe('stale')
    expect(typeof result.lastUpdatedAt).toBe('string')
  })

  it('falls back to the default tier data when the resolved Elo has none yet (FR-009)', () => {
    const map = setup({ elo: { tier: 'challenger', resolved: true } })
    const result = map[IPC.BAN_FETCH_RECOMMENDATIONS](null) as BanRecommendationSet
    // No Challenger rows seeded → serve the default Emerald baseline, reporting it.
    expect(result.eloTier).toBe('emerald')
    expect(result.recommendations.length).toBeGreaterThan(0)
  })

  it('returns an empty set when no ban data exists at all', () => {
    const map = setup({ seedBans: false })
    const result = map[IPC.BAN_FETCH_RECOMMENDATIONS](null) as BanRecommendationSet
    expect(result.recommendations).toEqual([])
  })
})
