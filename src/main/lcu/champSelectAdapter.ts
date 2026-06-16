import type { ChampSelectSession } from '@shared/types'
import { discoverCredentials, lcuGet, type LcuCredentials } from './connection'
import { normalizeChampSelectSession, type RawLcuSession } from './normalize'

export interface LcuClient {
  /** GET /lol-champ-select/v1/session, normalized; `null` when not in champ select. */
  getChampSelectSession(): Promise<ChampSelectSession | null>
  /** Confirms ranked Solo/Duo or Flex (gameflow-phase + lobby queue). */
  isRankedChampSelect(): Promise<boolean>
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

interface GameflowLobby {
  gameConfig?: { queueId?: number }
}

/** Stable identity of a session for change detection (ignores the timestamp). */
function sessionKey(session: ChampSelectSession | null): string {
  if (!session) return 'null'
  return JSON.stringify({
    active: session.active,
    phase: session.phase,
    assignedRole: session.assignedRole,
    enemies: session.enemyChampionIds
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

  /**
   * Poll the session every second and invoke `handler` only when the meaningful
   * state changes. A 1s cadence satisfies Principle V's refresh budget without a
   * WAMP WebSocket dependency; a WS subscription is the future optimization
   * (research.md §2). On a transport error the connection is treated as dropped.
   */
  onChampSelectUpdate(handler: (session: ChampSelectSession | null) => void): () => void {
    let lastKey: string | null = null
    let stopped = false
    let wasConnected = true
    let pollCount = 0

    const tick = async (): Promise<void> => {
      if (stopped) return
      try {
        const session = await this.getChampSelectSession()
        wasConnected = true
        const key = sessionKey(session)
        pollCount++
        if (pollCount % 10 === 0) console.log(`LCU: Poll #${pollCount}, active=${session?.active}`)
        if (key !== lastKey) {
          console.log('LCU: Session changed, invoking handler')
          lastKey = key
          handler(session)
        }
      } catch (err) {
        console.error('LCU: Poll error:', err)
        if (wasConnected) {
          wasConnected = false
          this.fireDisconnect()
        }
      }
    }

    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS)
    void tick()

    return () => {
      stopped = true
      clearInterval(interval)
    }
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
