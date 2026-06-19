import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { createDatabase, type DB } from './db'
import { seedChampions } from './dataDragon/championRepository'
import { seedChampionStats, seedBanStats } from './stats/seedData'
import { PoolRepository } from './db/repositories/poolRepository'
import { ChampionsRepository } from './db/repositories/championsRepository'
import { SettingsRepository } from './db/repositories/settingsRepository'
import { StatsRepository } from './db/repositories/statsRepository'
import { SynergyRepository } from './db/repositories/synergyRepository'
import { BanStatsRepository } from './db/repositories/banStatsRepository'
import { SnapshotRepository } from './db/repositories/snapshotRepository'
import { RecommendationService } from './recommendationService'
import { BanRecommendationService, type CurrentElo } from './banRecommendationService'
import { registerIpcHandlers } from './ipc/handlers'
import { createLcuAdapter, type LcuClient } from './lcu/champSelectAdapter'
import { inactiveSession } from './lcu/normalize'
import { LolalyticsStatsProvider } from './stats/lolalyticsStatsProvider'
import { LolalyticsPageRendererProvider } from './stats/lolalyticsPageRendererProvider'
import { startStatsRefresh } from './stats'
import { startBanStatsRefresh } from './stats/banStatsProvider'
import { initializeInstallerConfig } from './installer'
import { IPC } from '@shared/ipcChannels'
import { DEFAULT_ELO_TIER, type ChampSelectSession } from '@shared/types'

let db: DB | null = null
let mainWindow: BrowserWindow | null = null
let recommendationService: RecommendationService | null = null
let banRecommendationService: BanRecommendationService | null = null
let settingsRepository: SettingsRepository | null = null
let snapshotRepository: SnapshotRepository | null = null
let banRefresh: { stop: () => void; refresh: () => Promise<boolean> } | null = null
let currentSession: ChampSelectSession = inactiveSession(new Date().toISOString())
/** Current Elo for ban recommendations — LCU-resolved (FR-008) or the default (FR-009). */
let currentElo: CurrentElo = { tier: DEFAULT_ELO_TIER, resolved: false }

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
  seedBanStats(database) // spec 007 T019 — baseline ban stats (SC-001 offline-first)
  initLanguageFromOsLocale(database) // spec 003 US3 — first-launch default
  return database
}

/** First launch only: seed the interface language from the OS display locale
 *  (spec 003 US3). `app.getLocale()` returns e.g. "es-ES"/"es-MX"/"en-US"; we map
 *  any "es*" to Spanish and everything else to English. `initLanguageIfUnset`'s
 *  NULL guard means an explicit user choice is never overwritten on later launches. */
function initLanguageFromOsLocale(database: DB): void {
  const detected: 'en' | 'es' = app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en'
  new SettingsRepository(database).initLanguageIfUnset(detected)
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

/** Push fresh ban recommendations to the renderer (spec 007 US1/US3). Fired on a
 *  ban-stats refresh and when the LCU resolves a (new) ranked tier — not on every
 *  champ-select poll, since bans don't depend on the session. */
function pushBanUpdates(): void {
  if (banRecommendationService) {
    broadcast(IPC.BAN_STATS_UPDATED, banRecommendationService.get(null))
  }
}

/** Persist the current session to the snapshot table (US3). */
function persistSnapshot(): void {
  snapshotRepository?.update({
    assignedRole: currentSession.assignedRole,
    enemyChampionIds: currentSession.enemyChampionIds,
    allyChampionIds: currentSession.allyChampionIds,
    sessionActive: currentSession.active
  })
}

// How often to retry discovering the League Client when none is connected. The
// client may be launched after the app, or restarted mid-session (new port), so
// connection has to be continuously (re)attempted rather than one-shot at startup.
const LCU_RECONNECT_MS = 3000
let lcuStopPolling: (() => void) | null = null
let lcuReconnectTimer: ReturnType<typeof setTimeout> | null = null

function scheduleLcuReconnect(): void {
  if (lcuReconnectTimer) return
  lcuReconnectTimer = setTimeout(() => {
    lcuReconnectTimer = null
    void connectLcu()
  }, LCU_RECONNECT_MS)
}

function wireLcuClient(client: LcuClient): void {
  lcuStopPolling = client.onChampSelectUpdate((nextSession) => {
    // null = left champ select: retain last role/enemies but mark inactive (US3).
    currentSession = nextSession ?? { ...currentSession, active: false }
    persistSnapshot()
    pushUpdates()
  })

  client.onDisconnect(() => {
    console.log('LCU: Disconnected — will attempt to reconnect')
    lcuStopPolling?.()
    lcuStopPolling = null
    currentSession = { ...currentSession, active: false }
    persistSnapshot()
    pushUpdates()
    scheduleLcuReconnect() // pick the client back up when it returns
  })
}

/** Resolve the player's ranked tier from the LCU (FR-008) and apply it to the ban
 *  pipeline. Unranked/unavailable keeps the current (default or last-known) tier
 *  (FR-009). A *new* tier triggers an immediate ban refetch so the right Elo's bans
 *  load without waiting for the 24h interval. Read-only LCU access (Principle II). */
async function resolveCurrentElo(client: LcuClient): Promise<void> {
  try {
    const tier = await client.getCurrentRankedTier()
    if (!tier) return
    const changed = tier !== currentElo.tier
    currentElo = { tier, resolved: true }
    settingsRepository?.setCurrentEloTier(tier)
    if (changed) void banRefresh?.refresh()
    pushBanUpdates() // reflect the resolved tier/flag even when the data is unchanged
  } catch (err) {
    console.warn('LCU: ranked tier lookup failed:', (err as Error).message)
  }
}

async function connectLcu(): Promise<void> {
  const adapter = createLcuAdapter()
  const client = await adapter.connect()
  if (!client) {
    // No client running yet — snapshot/default session already hydrated (US3).
    // Keep retrying so the app connects whether League starts before or after it.
    scheduleLcuReconnect()
    return
  }

  console.log('LCU: Connected to League Client')
  void resolveCurrentElo(client) // spec 007 FR-008 — current ranked tier for bans
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
  settingsRepository = settings
  const stats = new StatsRepository(database)
  const synergy = new SynergyRepository(database)
  const banStats = new BanStatsRepository(database)
  snapshotRepository = new SnapshotRepository(database)

  // Initial Elo for bans: the last LCU-resolved tier persisted across launches, or
  // the default fallback until the live client reports one (FR-008/FR-009).
  const persistedElo = settings.get().currentEloTier
  currentElo = persistedElo
    ? { tier: persistedElo, resolved: true }
    : { tier: DEFAULT_ELO_TIER, resolved: false }

  // Hydrate the initial session from the last-known snapshot so a recommendation
  // can render immediately on launch, before/without a live LCU connection (US3 AC3).
  const snapshot = snapshotRepository.get()
  currentSession = {
    active: false,
    phase: 'NONE',
    assignedRole: snapshot.assignedRole,
    localPlayerCellId: null,
    enemyChampionIds: snapshot.enemyChampionIds,
    allyChampionIds: snapshot.allyChampionIds,
    updatedAt: snapshot.updatedAt
  }

  recommendationService = new RecommendationService(pool, stats, synergy, settings, () => currentSession)
  banRecommendationService = new BanRecommendationService(banStats, settings, () => currentElo)

  registerIpcHandlers({
    pool,
    champions,
    settings,
    getRecommendation: () => recommendationService!.getRecommendation(),
    getChampSelectStatus: () => currentSession,
    getBanRecommendations: (elo) => banRecommendationService!.get(elo)
  })

  // Background stats refresh (research.md §1). Live win rates come from lolalytics'
  // server-rendered tier-list pages (no documented JSON API exists; u.gg is
  // Cloudflare-walled). It's best-effort/fragile, so a failed fetch just downgrades
  // freshness and the app keeps serving the bundled/cached rows (offline-first).
  const idToKey = new Map<number, string>()
  const keyToId = new Map<string, number>()
  const slugToKey = new Map<string, string>()
  for (const champion of champions.list()) {
    idToKey.set(champion.championId, champion.key)
    keyToId.set(champion.key, champion.championId)
    // lolalytics portrait URLs/build slugs are lowercase Data Dragon keys (spec 004).
    slugToKey.set(champion.key.toLowerCase(), champion.key)
  }
  const provider = new LolalyticsStatsProvider({ idToKey })
  // Pool-scoped ally synergy via hidden-BrowserWindow page rendering (spec 004,
  // research.md §2–4). Drop-in for LolalyticsMatchupProvider: enemy matchups are
  // still decoded from the static Qwik JSON (delegated), synergy from the rendered DOM.
  const synergyProvider = new LolalyticsPageRendererProvider({ idToKey, keyToId, slugToKey })
  startStatsRefresh({
    provider,
    stats,
    settings,
    synergyProvider,
    synergy,
    getSynergyTargets: () => pool.list().map((entry) => ({ championKey: entry.key, role: entry.role })),
    onRefreshed: pushUpdates
  })

  // Background ban-stats refresh (spec 007 T010/T018). Fetches the current Elo's
  // tier-list win rates from lolalytics (reusing the pick scraper), falling back to
  // the bundled/cached rows on failure. `refresh` is re-triggered when the LCU
  // resolves a new ranked tier (see resolveCurrentElo).
  banRefresh = startBanStatsRefresh({
    banStats,
    settings,
    getCurrentElo: () => currentElo.tier,
    idToKey,
    onRefreshed: pushBanUpdates
  })

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
  // spec 005: consolidate all user data under %LOCALAPPDATA%\LolBestPicker and
  // apply any installer-provided env overrides (.env.local) to process.env
  // before anything — the DB path, LCU adapter, stats providers — reads them.
  const { dataDir, appliedKeys } = initializeInstallerConfig()
  app.setPath('userData', dataDir)
  if (appliedKeys.length > 0) {
    // Names only — never values (Constitution II).
    console.log(`Installer config: applied ${appliedKeys.length} override(s):`, appliedKeys.join(', '))
  }

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
    banRefresh?.stop()
    banRefresh = null
    db?.close()
    db = null
    app.quit()
  }
})
