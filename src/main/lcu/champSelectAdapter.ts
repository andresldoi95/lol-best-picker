import type { ChampSelectSession, EloTier } from '@shared/types'
import { discoverCredentials, lcuGet, type LcuCredentials } from './connection'
import { normalizeChampSelectSession, type RawLcuSession } from './normalize'
import type { RawMatchList } from './matchHistory'
import { normalizeLcuTier } from '@recommendation/types'

export interface LcuClient {
  /** GET /lol-champ-select/v1/session, normalized; `null` when not in champ select. */
  getChampSelectSession(): Promise<ChampSelectSession | null>
  /** Confirms ranked Solo/Duo or Flex (gameflow-phase + lobby queue). */
  isRankedChampSelect(): Promise<boolean>
  /** Current ranked tier (Solo/Duo preferred), normalized; `null` when unranked or
   *  unavailable → caller uses the default tier (FR-008/FR-009). Read-only (Principle II). */
  getCurrentRankedTier(): Promise<EloTier | null>
  /** PUUID of the logged-in summoner; `null` when unavailable. Used to locate the
   *  player within match-history payloads (spec 008). Read-only (Principle II). */
  getCurrentSummonerPuuid(): Promise<string | null>
  /** Recent completed matches for the current summoner (newest first), capped at
   *  `count`. Returns the raw list envelope for the pure parser. Read-only (spec 008). */
  getRecentMatches(count: number): Promise<RawMatchList | null>
  /** Subscribe to champ-select changes; returns an unsubscribe function. */
  onChampSelectUpdate(handler: (session: ChampSelectSession | null) => void): () => void
  /** Fires when the LCU connection drops (client closed / lockfile removed). */
  onDisconnect(handler: () => void): void
}

export interface LcuAdapter {
  /** Resolves to an authenticated client, or `null` if no client is running. */
  connect(): Promise<LcuClient | null>
}

// Ranked Solo/Duo (420) and Flex (440).
const RANKED_QUEUE_IDS = new Set<number>([420, 440])
const POLL_INTERVAL_MS = 1000
// The LCU routinely returns transient transport errors while champ select is busy
// (phase transitions, the client briefly stalling). Tolerate a few in a row before
// declaring the connection dropped, so a single hiccup doesn't freeze the session.
const MAX_CONSECUTIVE_ERRORS = 5

interface GameflowLobby {
  gameConfig?: { queueId?: number }
}

/** Subset of GET /lol-ranked/v1/current-ranked-stats we consume (tier strings only). */
interface RawRankedStats {
  highestRankedEntry?: { tier?: string }
  queueMap?: Record<string, { tier?: string } | undefined>
}

/** Stable identity of a session for change detection (ignores the timestamp).
 *  Ally picks are part of the fingerprint so an ally lock-in is treated as a
 *  meaningful change and triggers a refresh within 1 second (spec 002 SC-001,
 *  ipc-api.md). Ids are sorted so reordering between polls is not a false change. */
function sessionKey(session: ChampSelectSession | null): string {
  if (!session) return 'null'
  return JSON.stringify({
    active: session.active,
    phase: session.phase,
    assignedRole: session.assignedRole,
    enemies: [...session.enemyChampionIds].sort((a, b) => a - b),
    allies: [...session.allyChampionIds].sort((a, b) => a - b)
  })
}

class LcuClientImpl implements LcuClient {
  private readonly disconnectHandlers: Array<() => void> = []

  constructor(private readonly creds: LcuCredentials) {}

  async getChampSelectSession(): Promise<ChampSelectSession | null> {
    const { body } = await lcuGet<RawLcuSession>(this.creds, '/lol-champ-select/v1/session')
    if (!body) return null
    return normalizeChampSelectSession(body, new Date().toISOString())
  }

  async isRankedChampSelect(): Promise<boolean> {
    const phase = await lcuGet<string>(this.creds, '/lol-gameflow/v1/gameflow-phase')
    if (phase.body !== 'ChampSelect') return false
    const lobby = await lcuGet<GameflowLobby>(this.creds, '/lol-lobby/v2/lobby')
    const queueId = lobby.body?.gameConfig?.queueId
    return typeof queueId === 'number' && RANKED_QUEUE_IDS.has(queueId)
  }

  async getCurrentRankedTier(): Promise<EloTier | null> {
    const { body } = await lcuGet<RawRankedStats>(
      this.creds,
      '/lol-ranked/v1/current-ranked-stats'
    )
    if (!body) return null
    // Prefer Solo/Duo; fall back to the player's highest ranked entry across queues.
    const solo = body.queueMap?.['RANKED_SOLO_5x5']?.tier
    return normalizeLcuTier(solo ?? body.highestRankedEntry?.tier ?? null)
  }

  async getCurrentSummonerPuuid(): Promise<string | null> {
    const { body } = await lcuGet<{ puuid?: string }>(this.creds, '/lol-summoner/v1/current-summoner')
    return body?.puuid ?? null
  }

  async getRecentMatches(count: number): Promise<RawMatchList | null> {
    // begIndex/endIndex are inclusive; endIndex = count-1 yields `count` newest games.
    const endIndex = Math.max(0, count - 1)
    const { body } = await lcuGet<RawMatchList>(
      this.creds,
      `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${endIndex}`
    )
    return body
  }

  /**
   * Poll the session every second and invoke `handler` only when the meaningful
   * state changes. A 1s cadence satisfies Principle V's refresh budget without a
   * WAMP WebSocket dependency; a WS subscription is the future optimization
   * (research.md §2). On a transport error the connection is treated as dropped.
   */
  onChampSelectUpdate(handler: (session: ChampSelectSession | null) => void): () => void {
    let lastKey: string | null = null
    let stopped = false
    let consecutiveErrors = 0

    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS)

    function stop(): void {
      stopped = true
      clearInterval(interval)
    }

    const tick = async (): Promise<void> => {
      if (stopped) return
      try {
        const session = await this.getChampSelectSession()
        // A successful poll after an error blip re-establishes the connection.
        // Reset lastKey so the current state is re-pushed even if it is unchanged,
        // recovering from a transient disconnect that may have marked us inactive.
        if (consecutiveErrors > 0) lastKey = null
        consecutiveErrors = 0
        const key = sessionKey(session)
        if (key !== lastKey) {
          lastKey = key
          handler(session)
        }
      } catch (err) {
        consecutiveErrors++
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          // Sustained failure: the client likely closed. Stop polling these now-stale
          // credentials and let the caller reconnect (and rediscover fresh creds).
          console.error('LCU: Connection lost after repeated poll errors:', err)
          stop()
          this.fireDisconnect()
        }
      }
    }

    void tick()

    return stop
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler)
  }

  private fireDisconnect(): void {
    for (const handler of this.disconnectHandlers) handler()
  }
}

class LcuAdapterImpl implements LcuAdapter {
  async connect(): Promise<LcuClient | null> {
    const creds = discoverCredentials()
    if (!creds) return null
    return new LcuClientImpl(creds)
  }
}

export function createLcuAdapter(): LcuAdapter {
  return new LcuAdapterImpl()
}
