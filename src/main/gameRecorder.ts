import type { EloTier, GameRecordedEvent, NewGameRecord, Role } from '@shared/types'
import type { GameRecordsRepository } from './db/repositories/gameRecordsRepository'
import type { SettingsRepository } from './db/repositories/settingsRepository'
import type { LcuClient } from './lcu/champSelectAdapter'
import { buildGameRecord, extractMatches } from './lcu/matchHistory'

/**
 * Non-blocking service that captures completed-game outcomes from LCU match history and
 * persists them to `game_records` (spec 008 US1). It owns no LCU connection of its own —
 * `getClient` hands it the main process's current client (or null when disconnected),
 * mirroring how `BanRecommendationService` receives the current Elo. All LCU access is
 * read-only (Constitution II); a fetch failure is swallowed (logged) and retried on the
 * next tick — it never throws away cached records (Constitution III).
 */
export interface GameRecorderDeps {
  gameRecords: GameRecordsRepository
  settings: SettingsRepository
  /** Champion id → Data Dragon key (shared with the stats pipeline). */
  idToKey: Map<number, string>
  /** The connected LCU client, or null when no client is available. */
  getClient: () => LcuClient | null
  /** Current Elo to stamp on captured games (LCU-resolved or default). */
  getCurrentElo: () => EloTier
  /** Champion-select role of the most recent session, preferred over match lane (FR-010). */
  getAssignedRole: () => Role | null
  /** Invoked once per newly-recorded game, to push a `game:record-outcome` event. */
  onRecorded: (event: GameRecordedEvent) => void
  /** How many recent matches to scan per poll (default 20). */
  matchScanCount?: number
  /** Poll cadence in ms (default 5 minutes — games are infrequent; FR-001). */
  pollIntervalMs?: number
}

export interface GameRecorderHandle {
  stop: () => void
  /** Run one capture pass now; resolves with the number of newly-recorded games. */
  capture: () => Promise<number>
}

const DEFAULT_MATCH_SCAN = 20
const DEFAULT_POLL_MS = 5 * 60 * 1000

/**
 * Start the background game recorder. Polls on an interval and exposes `capture()` so
 * the caller can also trigger a pass on demand (e.g. on app launch and when a champ
 * select ends / a game wraps up). Returns a handle to stop polling.
 */
export function startGameRecorder(deps: GameRecorderDeps): GameRecorderHandle {
  const matchScanCount = deps.matchScanCount ?? DEFAULT_MATCH_SCAN
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS
  let inFlight = false

  async function capture(): Promise<number> {
    // Guard against overlapping passes (a slow LCU response + the interval firing).
    if (inFlight) return 0
    const client = deps.getClient()
    if (!client) return 0

    inFlight = true
    try {
      const puuid = await client.getCurrentSummonerPuuid()
      if (!puuid) return 0

      const matches = extractMatches(await client.getRecentMatches(matchScanCount))
      const tier = deps.getCurrentElo()
      const assignedRole = deps.getAssignedRole()

      let recorded = 0
      for (const match of matches) {
        const record = buildGameRecord({ match, puuid, tier, idToKey: deps.idToKey, assignedRole })
        if (!record) continue
        if (deps.gameRecords.existsByTimestamp(record.timestamp)) continue

        const id = deps.gameRecords.insert(record)
        if (id === null) continue // lost a race; already recorded
        recorded++
        deps.onRecorded(toEvent(record))
      }

      // Mark the capture cycle's freshness regardless of whether new games appeared —
      // a successful poll means "data is current as of now" for the freshness chip.
      deps.settings.setLastGameRecord(new Date().toISOString(), tier)
      return recorded
    } catch (err) {
      console.warn('GameRecorder: capture failed:', (err as Error).message)
      return 0
    } finally {
      inFlight = false
    }
  }

  const timer = setInterval(() => void capture(), pollIntervalMs)
  return {
    stop: () => clearInterval(timer),
    capture
  }
}

function toEvent(record: NewGameRecord): GameRecordedEvent {
  return {
    championKey: record.playerChampion,
    role: record.playerRole,
    result: record.result,
    timestamp: record.timestamp,
    tier: record.playerTier
  }
}
