import { describe, it, expect, afterEach } from 'vitest'
import { createHandlerMap, type IpcHandlerMap } from '@main/ipc/handlerMap'
import { IPC } from '@shared/ipcChannels'
import { PoolRepository } from '@main/db/repositories/poolRepository'
import { ChampionsRepository } from '@main/db/repositories/championsRepository'
import { SettingsRepository } from '@main/db/repositories/settingsRepository'
import { StatsRepository } from '@main/db/repositories/statsRepository'
import { SynergyRepository } from '@main/db/repositories/synergyRepository'
import { BanStatsRepository } from '@main/db/repositories/banStatsRepository'
import { GameRecordsRepository } from '@main/db/repositories/gameRecordsRepository'
import { RecommendationService } from '@main/recommendationService'
import { BanRecommendationService } from '@main/banRecommendationService'
import { GameAnalyticsService } from '@main/gameAnalyticsService'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'
import type {
  ChampSelectSession,
  CounterFilter,
  GameResult,
  PersonalCounterSet,
  Role
} from '@shared/types'

describe('game:fetch-counters (IPC contract, spec 008 US2/US3)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined
  let gameRecords: GameRecordsRepository
  /** Distinct, real seeded champion keys to use as opponents. */
  let keys: string[]

  function setup(): IpcHandlerMap {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)

    const pool = new PoolRepository(db)
    const champions = new ChampionsRepository(db)
    const settings = new SettingsRepository(db)
    const stats = new StatsRepository(db)
    const synergy = new SynergyRepository(db)
    const banStats = new BanStatsRepository(db)
    gameRecords = new GameRecordsRepository(db)
    keys = champions.list().slice(0, 3).map((c) => c.key)

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
    const banService = new BanRecommendationService(banStats, settings, () => ({
      tier: 'emerald',
      resolved: false
    }))
    const gameAnalytics = new GameAnalyticsService(gameRecords, champions, settings, () => ({
      tier: 'emerald',
      resolved: true
    }))

    return createHandlerMap({
      pool,
      champions,
      settings,
      getRecommendation: () => recService.getRecommendation(),
      getChampSelectStatus: () => session,
      getBanRecommendations: (elo) => banService.get(elo),
      getCounters: (filter) => gameAnalytics.getCounters(filter)
    })
  }

  let ts = 1_000
  function insertGame(
    enemy: string,
    result: GameResult,
    opts: { role?: Role; tier?: string } = {}
  ): void {
    gameRecords.insert({
      timestamp: ts++,
      playerChampion: 'Aatrox',
      playerRole: opts.role ?? 'MIDDLE',
      alliedChampions: [],
      enemyChampions: [enemy],
      result,
      // cast: player_tier is free-form TEXT; tests exercise multiple tiers
      playerTier: (opts.tier ?? 'emerald') as PersonalCounterSet['eloTier']
    })
  }

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  it('returns an empty set when no games are recorded (FR-009)', () => {
    const map = setup()
    const res = map[IPC.GAME_FETCH_COUNTERS]({}) as PersonalCounterSet
    expect(res.counters).toEqual([])
    expect(res.totalGamesRecorded).toBe(0)
    expect(res.eloTier).toBe('emerald')
  })

  it('ranks counters for the current tier, enriched with champion display data', () => {
    const map = setup()
    const [enemyA, enemyB] = keys
    // enemyA: 10 games, 2 wins → 20% WR, threat 30, Confirmed (top threat).
    for (let i = 0; i < 10; i++) insertGame(enemyA, i < 2 ? 'win' : 'loss')
    // enemyB: 4 games, all wins → 100% WR, negative threat (not a real counter).
    for (let i = 0; i < 4; i++) insertGame(enemyB, 'win')

    const res = map[IPC.GAME_FETCH_COUNTERS]({}) as PersonalCounterSet
    expect(res.counters[0].opponentChampion).toBe(enemyA)
    expect(res.counters[0].confidenceTier).toBe('Confirmed')
    expect(res.counters[0].championName.length).toBeGreaterThan(0) // resolved, not blank
    expect(res.counters[0].threatScore).toBeGreaterThan(res.counters[1].threatScore)
    expect(res.totalGamesRecorded).toBe(14)
    expect(res.gamesInTier).toBe(14)
  })

  it('scopes counters to the current tier and reports games from other tiers (Q1 badge)', () => {
    const map = setup()
    const [enemyA] = keys
    for (let i = 0; i < 5; i++) insertGame(enemyA, 'loss') // emerald
    insertGame(enemyA, 'loss', { tier: 'diamond' }) // other tier

    const res = map[IPC.GAME_FETCH_COUNTERS]({}) as PersonalCounterSet
    expect(res.gamesInTier).toBe(5)
    expect(res.otherTierGames).toBe(1)
    expect(res.totalGamesRecorded).toBe(6)
    expect(res.counters[0].gamesPlayed).toBe(5) // diamond game excluded from the ranking
  })

  it('filters by role and returns empty when no games match (US3 AC2)', () => {
    const map = setup()
    const [enemyA] = keys
    for (let i = 0; i < 5; i++) insertGame(enemyA, 'loss', { role: 'MIDDLE' })

    const mid = map[IPC.GAME_FETCH_COUNTERS]({ role: 'MIDDLE' } as CounterFilter) as PersonalCounterSet
    expect(mid.role).toBe('MIDDLE')
    expect(mid.counters).toHaveLength(1)

    const top = map[IPC.GAME_FETCH_COUNTERS]({ role: 'TOP' } as CounterFilter) as PersonalCounterSet
    expect(top.counters).toEqual([])
  })

  it('carries a freshness label and last-updated timestamp', () => {
    const map = setup()
    const res = map[IPC.GAME_FETCH_COUNTERS]({}) as PersonalCounterSet
    // No recorder capture cycle has stamped freshness → "stale" until one does.
    expect(['live', 'cached', 'stale']).toContain(res.freshness)
    expect(res.freshness).toBe('stale')
    expect(typeof res.lastUpdatedAt).toBe('string')
  })
})
