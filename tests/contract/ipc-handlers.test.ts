import { describe, it, expect, afterEach } from 'vitest'
import { createHandlerMap, type IpcHandlerMap } from '@main/ipc/handlerMap'
import { IPC } from '@shared/ipcChannels'
import { PoolRepository } from '@main/db/repositories/poolRepository'
import { ChampionsRepository } from '@main/db/repositories/championsRepository'
import { SettingsRepository } from '@main/db/repositories/settingsRepository'
import { StatsRepository } from '@main/db/repositories/statsRepository'
import { SynergyRepository } from '@main/db/repositories/synergyRepository'
import { RecommendationService } from '@main/recommendationService'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'
import type {
  AppSettings,
  ChampSelectSession,
  ChampionSummary,
  PoolEntryView,
  Recommendation
} from '@shared/types'

const AHRI = 103

describe('IPC handler map (contract)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined
  let session: ChampSelectSession

  function setup(): IpcHandlerMap {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)

    const pool = new PoolRepository(db)
    const champions = new ChampionsRepository(db)
    const settings = new SettingsRepository(db)
    const stats = new StatsRepository(db)
    const synergy = new SynergyRepository(db)

    session = {
      active: true,
      phase: 'BAN_PICK',
      assignedRole: 'MIDDLE',
      localPlayerCellId: 0,
      enemyChampionIds: [],
      allyChampionIds: [],
      updatedAt: new Date().toISOString()
    }

    const recService = new RecommendationService(pool, stats, synergy, settings, () => session)

    return createHandlerMap({
      pool,
      champions,
      settings,
      getRecommendation: () => recService.getRecommendation(),
      getChampSelectStatus: () => session
    })
  }

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  // ---- US1: pool & champions ----
  it('champions:list returns the seeded champion catalogue', () => {
    const map = setup()
    const champs = map[IPC.CHAMPIONS_LIST]() as ChampionSummary[]
    expect(champs.length).toBeGreaterThan(40)
  })

  it('pool:add is idempotent (FR-005)', () => {
    const map = setup()
    map[IPC.POOL_ADD](AHRI, 'MIDDLE')
    map[IPC.POOL_ADD](AHRI, 'MIDDLE')
    expect((map[IPC.POOL_LIST]() as PoolEntryView[]).length).toBe(1)
  })

  it('pool:remove / pool:removeAllRoles on a missing entry are no-op successes', () => {
    const map = setup()
    map[IPC.POOL_ADD](AHRI, 'MIDDLE')
    expect(() => map[IPC.POOL_REMOVE](999999, 'TOP')).not.toThrow()
    map[IPC.POOL_REMOVE](AHRI, 'MIDDLE')
    expect((map[IPC.POOL_LIST]() as PoolEntryView[]).length).toBe(0)
    expect(() => map[IPC.POOL_REMOVE_ALL_ROLES](AHRI)).not.toThrow()
  })

  // ---- US2: recommendation, champ select, settings ----
  it('champSelect:getStatus returns the current session', () => {
    const map = setup()
    const status = map[IPC.CHAMP_SELECT_GET_STATUS]() as ChampSelectSession
    expect(status).toMatchObject({ active: true, assignedRole: 'MIDDLE' })
  })

  it('recommendation:get ranks role-eligible pool champions', () => {
    const map = setup()
    map[IPC.POOL_ADD](AHRI, 'MIDDLE')
    const rec = map[IPC.RECOMMENDATION_GET]() as Recommendation
    expect(rec.role).toBe('MIDDLE')
    expect(rec.entries.some((e) => e.championId === AHRI)).toBe(true)
    // Principle I: nothing outside the assigned role is ever surfaced.
    expect(rec.entries.every((e) => e.role === 'MIDDLE')).toBe(true)
  })

  it('settings:get reflects defaults; settings:setManualRole persists and overrides role precedence', () => {
    const map = setup()
    const initial = map[IPC.SETTINGS_GET]() as AppSettings
    expect(initial).toMatchObject({ manualRole: null, statsFreshnessHours: 24 })

    map[IPC.SETTINGS_SET_MANUAL_ROLE]('JUNGLE')
    expect((map[IPC.SETTINGS_GET]() as AppSettings).manualRole).toBe('JUNGLE')

    // manual override beats the live assigned MIDDLE role (data-model precedence)
    const rec = map[IPC.RECOMMENDATION_GET]() as Recommendation
    expect(rec.role).toBe('JUNGLE')
  })

  // ---- US3: configurable freshness threshold ----
  it('settings:setStatsFreshnessHours persists the threshold (research.md §5)', () => {
    const map = setup()
    map[IPC.SETTINGS_SET_STATS_FRESHNESS_HOURS](6)
    expect((map[IPC.SETTINGS_GET]() as AppSettings).statsFreshnessHours).toBe(6)
  })
})
