import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { createDatabase, type DB } from './db'
import { seedChampions } from './dataDragon/championRepository'
import { seedChampionStats, SEED_STATS_PATCH } from './stats/seedData'
import { PoolRepository } from './db/repositories/poolRepository'
import { ChampionsRepository } from './db/repositories/championsRepository'
import { SettingsRepository } from './db/repositories/settingsRepository'
import { StatsRepository } from './db/repositories/statsRepository'
import { SnapshotRepository } from './db/repositories/snapshotRepository'
import { RecommendationService } from './recommendationService'
import { registerIpcHandlers } from './ipc/handlers'
import { createLcuAdapter, type LcuClient } from './lcu/champSelectAdapter'
import { inactiveSession } from './lcu/normalize'
import { UggStatsProvider } from './stats/uggStatsProvider'
import { startStatsRefresh } from './stats'
import { IPC } from '@shared/ipcChannels'
import type { ChampSelectSession } from '@shared/types'

let db: DB | null = null
let mainWindow: BrowserWindow | null = null
let recommendationService: RecommendationService | null = null
let snapshotRepository: SnapshotRepository | null = null
let currentSession: ChampSelectSession = inactiveSession(new Date().toISOString())

export function getDb(): DB {
  if (!db) throw new Error('Database has not been initialized yet')
  return db
}

function initDatabase(): DB {
  const dbPath = join(app.getPath('userData'), 'lol-best-picker.db')
  // createDatabase runs pending migrations (T007/T008) before returning.
  const database = createDatabase(dbPath)
  seedChampions(database) // T009 — Data Dragon champion metadata
  seedChampionStats(database) // T010 — baseline win-rate stats (SC-006 offline-first)
  return database
}

function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

/** Push fresh champ-select + recommendation state to the renderer (Principle V). */
function pushUpdates(): void {
  broadcast(IPC.CHAMP_SELECT_SESSION_UPDATED, currentSession)
  if (recommendationService) {
    broadcast(IPC.RECOMMENDATION_UPDATED, recommendationService.getRecommendation())
  }
}

/** Persist the current session to the snapshot table (US3). */
function persistSnapshot(): void {
  snapshotRepository?.update({
    assignedRole: currentSession.assignedRole,
    enemyChampionIds: currentSession.enemyChampionIds,
    sessionActive: currentSession.active
  })
}

function wireLcuClient(client: LcuClient): void {
  client.onChampSelectUpdate((nextSession) => {
    // null = left champ select: retain last role/enemies but mark inactive (US3).
    currentSession = nextSession ?? { ...currentSession, active: false }
    persistSnapshot()
    pushUpdates()
  })

  client.onDisconnect(() => {
    currentSession = { ...currentSession, active: false }
    persistSnapshot()
    pushUpdates()
  })
}

async function connectLcu(): Promise<void> {
  const adapter = createLcuAdapter()
  const client = await adapter.connect()
  if (!client) {
    console.log('LCU: No League Client running')
    return // no client running — snapshot/default session already hydrated (US3)
  }

  console.log('LCU: Connected to League Client')
  const initial = await client.getChampSelectSession()
  if (initial) {
    console.log('LCU: Initial session detected:', { active: initial.active, phase: initial.phase })
    currentSession = initial
    persistSnapshot()
    pushUpdates()
  } else {
    console.log('LCU: No active champ select session')
  }

  wireLcuClient(client)
}

function wireServices(database: DB): void {
  const pool = new PoolRepository(database)
  const champions = new ChampionsRepository(database)
  const settings = new SettingsRepository(database)
  const stats = new StatsRepository(database)
  snapshotRepository = new SnapshotRepository(database)

  // Hydrate the initial session from the last-known snapshot so a recommendation
  // can render immediately on launch, before/without a live LCU connection (US3 AC3).
  const snapshot = snapshotRepository.get()
  currentSession = {
    active: false,
    phase: 'NONE',
    assignedRole: snapshot.assignedRole,
    localPlayerCellId: null,
    enemyChampionIds: snapshot.enemyChampionIds,
    updatedAt: snapshot.updatedAt
  }

  recommendationService = new RecommendationService(pool, stats, settings, () => currentSession)

  registerIpcHandlers({
    pool,
    champions,
    settings,
    getRecommendation: () => recommendationService!.getRecommendation(),
    getChampSelectStatus: () => currentSession
  })

  // Background stats refresh (research.md §1). The u.gg data-feed endpoint must be
  // provided (env-configured) since it is undocumented/patch-dependent; absent one,
  // the app runs offline-first on bundled/cached stats.
  const idToKey = new Map<number, string>()
  for (const champion of champions.list()) idToKey.set(champion.championId, champion.key)
  const endpoint = process.env['LBP_UGG_ENDPOINT']
  const provider = endpoint
    ? new UggStatsProvider({ idToKey, patch: SEED_STATS_PATCH, endpoint })
    : null
  startStatsRefresh({ provider, stats, settings })

  void connectLcu()
}

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; img-src 'self' data: https://ddragon.leagueoflegends.com; " +
  "connect-src 'self' ws:"

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

void app.whenReady().then(() => {
  db = initDatabase()
  applyContentSecurityPolicy()
  mainWindow = createMainWindow()
  wireServices(db)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db?.close()
    db = null
    app.quit()
  }
})
