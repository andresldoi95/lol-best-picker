import { IPC } from '@shared/ipcChannels'
import type { ChampSelectSession, Recommendation, Role } from '@shared/types'
import type { PoolRepository } from '../db/repositories/poolRepository'
import type { ChampionsRepository } from '../db/repositories/championsRepository'
import type { SettingsRepository } from '../db/repositories/settingsRepository'

/**
 * Dependencies injected into the IPC handlers. Kept as an interface (not a hard
 * import of concrete singletons) so contract tests can supply repositories/
 * adapters backed by a temp DB or fixtures.
 */
export interface IpcDependencies {
  pool: PoolRepository
  champions: ChampionsRepository
  settings: SettingsRepository
  /** Computes the current recommendation (role precedence resolved inside). */
  getRecommendation: () => Recommendation
  /** Current champ-select status (live LCU, or snapshot fallback). */
  getChampSelectStatus: () => ChampSelectSession
}

// The IPC boundary is inherently dynamic — args are erased across the contextBridge.
// Each handler body below is still fully type-checked against `deps`.
export type IpcHandler = (...args: any[]) => unknown
export type IpcHandlerMap = Record<string, IpcHandler>

/**
 * Build the channel → handler map. Pure (no `electron` import) so it can be
 * exercised directly in `tests/contract/ipc-handlers.test.ts` without an
 * Electron runtime; `registerIpcHandlers` (handlers.ts) wires it to `ipcMain`.
 */
export function createHandlerMap(deps: IpcDependencies): IpcHandlerMap {
  return {
    // Pool (US1)
    [IPC.POOL_LIST]: () => deps.pool.list(),
    [IPC.POOL_ADD]: (championId: number, role: Role) => deps.pool.add(championId, role),
    [IPC.POOL_REMOVE]: (championId: number, role: Role) => deps.pool.remove(championId, role),
    [IPC.POOL_REMOVE_ALL_ROLES]: (championId: number) => deps.pool.removeAllRoles(championId),
    [IPC.CHAMPIONS_LIST]: () => deps.champions.list(),

    // Recommendation / champ select (US2)
    [IPC.RECOMMENDATION_GET]: () => deps.getRecommendation(),
    [IPC.CHAMP_SELECT_GET_STATUS]: () => deps.getChampSelectStatus(),

    // Settings (US2)
    [IPC.SETTINGS_GET]: () => deps.settings.get(),
    [IPC.SETTINGS_SET_MANUAL_ROLE]: (role: Role | null) => deps.settings.setManualRole(role),

    // Settings (US3)
    [IPC.SETTINGS_SET_STATS_FRESHNESS_HOURS]: (hours: number) =>
      deps.settings.setStatsFreshnessHours(hours)
  }
}
