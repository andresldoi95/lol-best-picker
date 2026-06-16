import { describe, it, expect } from 'vitest'
import {
  normalizeChampSelectSession,
  inactiveSession,
  type RawLcuSession
} from '@main/lcu/normalize'
import type { LcuAdapter, LcuClient } from '@main/lcu/champSelectAdapter'
import type { ChampSelectSession } from '@shared/types'

const NOW = '2026-06-14T12:00:00.000Z'

// Recorded-style raw LCU `/lol-champ-select/v1/session` payloads.
function rawSession(opts: {
  assignedPosition?: string
  enemyChampionIds?: number[]
  phase?: string
}): RawLcuSession {
  return {
    localPlayerCellId: 0,
    timer: { phase: opts.phase ?? 'BAN_PICK' },
    myTeam: [{ cellId: 0, championId: 0, assignedPosition: opts.assignedPosition ?? 'middle' }],
    theirTeam: (opts.enemyChampionIds ?? []).map((championId, i) => ({
      cellId: 5 + i,
      championId,
      assignedPosition: ''
    }))
  }
}

describe('LCU normalization (contract)', () => {
  it('champ select with 0 enemies revealed → empty enemy list', () => {
    const raw = rawSession({ enemyChampionIds: [] })
    // theirTeam present but all not-yet-picked (championId 0)
    raw.theirTeam = [{ cellId: 5, championId: 0 }]
    const session = normalizeChampSelectSession(raw, NOW)
    expect(session.active).toBe(true)
    expect(session.enemyChampionIds).toEqual([])
    expect(session.assignedRole).toBe('MIDDLE')
  })

  it('champ select with 1–5 enemies revealed → only locked-in picks', () => {
    const raw = rawSession({ enemyChampionIds: [266, 103, 238] })
    // add a not-yet-picked enemy (championId 0) that must be excluded
    raw.theirTeam!.push({ cellId: 99, championId: 0 })
    const session = normalizeChampSelectSession(raw, NOW)
    expect(session.enemyChampionIds).toEqual([266, 103, 238])
  })

  it('assignedPosition "utility" maps to SUPPORT', () => {
    const session = normalizeChampSelectSession(rawSession({ assignedPosition: 'utility' }), NOW)
    expect(session.assignedRole).toBe('SUPPORT')
  })

  it('empty/unrecognized assignedPosition → null (triggers manual selection)', () => {
    expect(normalizeChampSelectSession(rawSession({ assignedPosition: '' }), NOW).assignedRole).toBeNull()
    expect(
      normalizeChampSelectSession(rawSession({ assignedPosition: 'sweeper' }), NOW).assignedRole
    ).toBeNull()
  })

  it('inactiveSession represents no live champ select', () => {
    const session = inactiveSession(NOW)
    expect(session.active).toBe(false)
    expect(session.enemyChampionIds).toEqual([])
    expect(session.assignedRole).toBeNull()
  })
})

// ---- FixtureLcuAdapter: a test double implementing the adapter contract ----

class FixtureLcuClient implements LcuClient {
  private readonly disconnectHandlers: Array<() => void> = []
  private updateHandler: ((s: ChampSelectSession | null) => void) | null = null
  lastEmitted: ChampSelectSession | null = null

  constructor(private session: ChampSelectSession | null) {}

  getChampSelectSession(): Promise<ChampSelectSession | null> {
    return Promise.resolve(this.session)
  }
  isRankedChampSelect(): Promise<boolean> {
    return Promise.resolve(true)
  }
  onChampSelectUpdate(handler: (s: ChampSelectSession | null) => void): () => void {
    this.updateHandler = handler
    return () => {
      this.updateHandler = null
    }
  }
  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler)
  }
  // test controls
  emit(session: ChampSelectSession | null): void {
    this.session = session
    this.lastEmitted = session
    this.updateHandler?.(session)
  }
  dropConnection(): void {
    for (const handler of this.disconnectHandlers) handler()
  }
}

class FixtureLcuAdapter implements LcuAdapter {
  constructor(private readonly client: FixtureLcuClient | null) {}
  connect(): Promise<LcuClient | null> {
    return Promise.resolve(this.client)
  }
}

describe('LcuAdapter contract (fixture-driven)', () => {
  it('connect() resolves null when no client is running', async () => {
    const adapter = new FixtureLcuAdapter(null)
    expect(await adapter.connect()).toBeNull()
  })

  it('connect() resolves a client that reports the current session', async () => {
    const session = normalizeChampSelectSession(rawSession({ enemyChampionIds: [266] }), NOW)
    const adapter = new FixtureLcuAdapter(new FixtureLcuClient(session))
    const client = await adapter.connect()
    expect(client).not.toBeNull()
    expect((await client!.getChampSelectSession())?.enemyChampionIds).toEqual([266])
  })

  it('disconnect mid-session fires onDisconnect and retains the last session', async () => {
    const sessionA = normalizeChampSelectSession(rawSession({ enemyChampionIds: [103] }), NOW)
    const client = new FixtureLcuClient(sessionA)
    const adapter = new FixtureLcuAdapter(client)
    const connected = (await adapter.connect()) as FixtureLcuClient

    let disconnected = false
    connected.onDisconnect(() => {
      disconnected = true
    })
    const received: Array<ChampSelectSession | null> = []
    connected.onChampSelectUpdate((s) => received.push(s))

    connected.emit(sessionA)
    connected.dropConnection()

    expect(disconnected).toBe(true)
    // The adapter never pushes a null on disconnect — last known session is retained.
    expect(connected.lastEmitted).toEqual(sessionA)
    expect(received.at(-1)).toEqual(sessionA)
  })
})
