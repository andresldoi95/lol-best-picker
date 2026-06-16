/**
 * Single source of truth for IPC channel names. Imported by `src/preload`
 * (for whitelisting) and `src/main/ipc/handlers.ts` (for registration) so no
 * channel name is ever duplicated as a string literal (contracts/ipc-api.md).
 */
export const IPC = {
  // Pool (US1)
  POOL_LIST: 'pool:list',
  POOL_ADD: 'pool:add',
  POOL_REMOVE: 'pool:remove',
  POOL_REMOVE_ALL_ROLES: 'pool:removeAllRoles',
  CHAMPIONS_LIST: 'champions:list',

  // Recommendation (US2/US3)
  RECOMMENDATION_GET: 'recommendation:get',
  RECOMMENDATION_UPDATED: 'recommendation:updated',

  // Champ select (US2/US3)
  CHAMP_SELECT_GET_STATUS: 'champSelect:getStatus',
  CHAMP_SELECT_SESSION_UPDATED: 'champSelect:sessionUpdated',

  // Settings (US2/US3)
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_MANUAL_ROLE: 'settings:setManualRole',
  SETTINGS_SET_STATS_FRESHNESS_HOURS: 'settings:setStatsFreshnessHours'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Channels the renderer may `invoke` (request/response). */
export const INVOKE_CHANNELS: readonly IpcChannel[] = [
  IPC.POOL_LIST,
  IPC.POOL_ADD,
  IPC.POOL_REMOVE,
  IPC.POOL_REMOVE_ALL_ROLES,
  IPC.CHAMPIONS_LIST,
  IPC.RECOMMENDATION_GET,
  IPC.CHAMP_SELECT_GET_STATUS,
  IPC.SETTINGS_GET,
  IPC.SETTINGS_SET_MANUAL_ROLE,
  IPC.SETTINGS_SET_STATS_FRESHNESS_HOURS
]

/** Push-event channels the renderer may subscribe to (main → renderer). */
export const EVENT_CHANNELS: readonly IpcChannel[] = [
  IPC.RECOMMENDATION_UPDATED,
  IPC.CHAMP_SELECT_SESSION_UPDATED
]
