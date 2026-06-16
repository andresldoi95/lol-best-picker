import { ipcMain } from 'electron'
import { createHandlerMap, type IpcDependencies } from './handlerMap'

/**
 * Register every IPC handler from the pure handler map onto `ipcMain`. Only the
 * channels present in the map are exposed — no channel name is duplicated here
 * (they live in `src/shared/ipcChannels.ts`).
 */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const map = createHandlerMap(deps)
  for (const channel of Object.keys(map)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => map[channel](...args))
  }
}
