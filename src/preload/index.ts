import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, INVOKE_CHANNELS, EVENT_CHANNELS, type IpcChannel } from '@shared/ipcChannels'
import type { Recommendation, ChampSelectSession, Role } from '@shared/types'

/** Whitelisted request/response invoke — rejects any non-allowlisted channel. */
function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  if (!INVOKE_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`Blocked IPC invoke on non-whitelisted channel: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

/** Whitelisted push-event subscription — returns an unsubscribe function. */
function subscribe<T>(channel: IpcChannel, callback: (payload: T) => void): () => void {
  if (!EVENT_CHANNELS.includes(channel)) {
    throw new Error(`Blocked IPC subscribe on non-whitelisted channel: ${channel}`)
  }
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  pool: {
    list: () => invoke(IPC.POOL_LIST),
    add: (championId: number, role: Role) => invoke<void>(IPC.POOL_ADD, championId, role),
    remove: (championId: number, role: Role) => invoke<void>(IPC.POOL_REMOVE, championId, role),
    removeAllRoles: (championId: number) => invoke<void>(IPC.POOL_REMOVE_ALL_ROLES, championId)
  },
  champions: {
    list: () => invoke(IPC.CHAMPIONS_LIST)
  },
  recommendation: {
    get: () => invoke<Recommendation>(IPC.RECOMMENDATION_GET),
    onUpdate: (callback: (rec: Recommendation) => void) =>
      subscribe<Recommendation>(IPC.RECOMMENDATION_UPDATED, callback)
  },
  champSelect: {
    getStatus: () => invoke<ChampSelectSession>(IPC.CHAMP_SELECT_GET_STATUS),
    onSessionUpdate: (callback: (session: ChampSelectSession) => void) =>
      subscribe<ChampSelectSession>(IPC.CHAMP_SELECT_SESSION_UPDATED, callback)
  },
  settings: {
    get: () => invoke(IPC.SETTINGS_GET),
    setManualRole: (role: Role | null) => invoke<void>(IPC.SETTINGS_SET_MANUAL_ROLE, role),
    setStatsFreshnessHours: (hours: number) =>
      invoke<void>(IPC.SETTINGS_SET_STATS_FRESHNESS_HOURS, hours)
  }
}

contextBridge.exposeInMainWorld('api', api)
