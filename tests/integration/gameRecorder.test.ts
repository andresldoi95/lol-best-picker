import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildGameRecord,
  extractMatches,
  isSupportedQueue,
  normalizeMatchPosition,
  type RawMatch
} from '@main/lcu/matchHistory'
import { GameRecordsRepository } from '@main/db/repositories/gameRecordsRepository'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'

const PUUID = 'PLAYER-PUUID'

const ID_TO_KEY = new Map<number, string>([
  [266, 'Aatrox'], // player
  [103, 'Ahri'],
  [64, 'LeeSin'],
  [412, 'Thresh'],
  [222, 'Jinx'], // allies
  [1, 'Annie'],
  [12, 'Alistar'],
  [22, 'Ashe'],
  [50, 'Swain'],
  [81, 'Ezreal'] // enemies
])

/** A complete, supported (ranked solo) 5v5 match with the player on team 100, MID. */
function fixtureMatch(overrides: Partial<RawMatch> = {}): RawMatch {
  return {
    gameId: 5001,
    gameCreation: 1_719_849_300_000,
    queueId: 420,
    participants: [
      { participantId: 1, teamId: 100, championId: 266, stats: { win: false }, timeline: { lane: 'MIDDLE', role: 'SOLO' } },
      { participantId: 2, teamId: 100, championId: 103, stats: { win: false } },
      { participantId: 3, teamId: 100, championId: 64, stats: { win: false } },
      { participantId: 4, teamId: 100, championId: 412, stats: { win: false } },
      { participantId: 5, teamId: 100, championId: 222, stats: { win: false } },
      { participantId: 6, teamId: 200, championId: 1, stats: { win: true } },
      { participantId: 7, teamId: 200, championId: 12, stats: { win: true } },
      { participantId: 8, teamId: 200, championId: 22, stats: { win: true } },
      { participantId: 9, teamId: 200, championId: 50, stats: { win: true } },
      { participantId: 10, teamId: 200, championId: 81, stats: { win: true } }
    ],
    participantIdentities: [
      { participantId: 1, player: { puuid: PUUID } },
      ...Array.from({ length: 9 }, (_, i) => ({ participantId: i + 2, player: { puuid: `OTHER-${i}` } }))
    ],
    ...overrides
  }
}

describe('matchHistory pure helpers', () => {
  it('isSupportedQueue allows ranked + normal, rejects ARAM/URF/custom', () => {
    expect(isSupportedQueue(420)).toBe(true) // ranked solo
    expect(isSupportedQueue(440)).toBe(true) // flex
    expect(isSupportedQueue(400)).toBe(true) // normal draft
    expect(isSupportedQueue(450)).toBe(false) // ARAM
    expect(isSupportedQueue(undefined)).toBe(false)
  })

  it('normalizeMatchPosition maps lanes and splits bottom by role', () => {
    expect(normalizeMatchPosition('TOP', 'SOLO')).toBe('TOP')
    expect(normalizeMatchPosition('MIDDLE', 'SOLO')).toBe('MIDDLE')
    expect(normalizeMatchPosition('JUNGLE', 'NONE')).toBe('JUNGLE')
    expect(normalizeMatchPosition('BOTTOM', 'DUO_CARRY')).toBe('BOTTOM')
    expect(normalizeMatchPosition('BOTTOM', 'DUO_SUPPORT')).toBe('SUPPORT')
    expect(normalizeMatchPosition('NONE', 'NONE')).toBeNull()
  })

  it('extractMatches unwraps the games.games envelope safely', () => {
    expect(extractMatches(null)).toEqual([])
    expect(extractMatches({ games: { games: [fixtureMatch()] } })).toHaveLength(1)
  })
})

describe('buildGameRecord', () => {
  it('builds a record splitting allies/enemies by team, sorted, from the player POV', () => {
    const record = buildGameRecord({ match: fixtureMatch(), puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })
    expect(record).not.toBeNull()
    expect(record).toMatchObject({
      timestamp: 1_719_849_300_000,
      playerChampion: 'Aatrox',
      playerRole: 'MIDDLE',
      alliedChampions: ['Ahri', 'Jinx', 'LeeSin', 'Thresh'],
      enemyChampions: ['Alistar', 'Annie', 'Ashe', 'Ezreal', 'Swain'],
      result: 'loss',
      playerTier: 'emerald'
    })
  })

  it('prefers the champion-select assignedRole over the match lane (FR-010)', () => {
    const record = buildGameRecord({
      match: fixtureMatch(),
      puuid: PUUID,
      tier: 'emerald',
      idToKey: ID_TO_KEY,
      assignedRole: 'SUPPORT'
    })
    expect(record?.playerRole).toBe('SUPPORT')
  })

  it('reads the win flag as either a boolean or the "Win"/"Fail" string', () => {
    const match = fixtureMatch()
    match.participants[0].stats = { win: 'Win' } // player won, string variant
    expect(
      buildGameRecord({ match, puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })?.result
    ).toBe('win')
    match.participants[0].stats = { win: 'Fail' }
    expect(
      buildGameRecord({ match, puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })?.result
    ).toBe('loss')
  })

  it('returns null for an unsupported queue (ARAM)', () => {
    expect(
      buildGameRecord({ match: fixtureMatch({ queueId: 450 }), puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })
    ).toBeNull()
  })

  it('returns null when the player is not in the match', () => {
    expect(
      buildGameRecord({ match: fixtureMatch(), puuid: 'SOMEONE-ELSE', tier: 'emerald', idToKey: ID_TO_KEY })
    ).toBeNull()
  })

  it('returns null when a champion id cannot be resolved to a key', () => {
    const partial = new Map(ID_TO_KEY)
    partial.delete(81) // an enemy's champion is unknown
    expect(
      buildGameRecord({ match: fixtureMatch(), puuid: PUUID, tier: 'emerald', idToKey: partial })
    ).toBeNull()
  })
})

describe('capture flow: parse → persist → query', () => {
  let db: DB
  let cleanup: () => void
  let repo: GameRecordsRepository

  beforeEach(() => {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)
    repo = new GameRecordsRepository(db)
  })
  afterEach(() => {
    db.close()
    cleanup()
  })

  it('persists a parsed match and reads it back by tier (US1 end-to-end)', () => {
    const record = buildGameRecord({ match: fixtureMatch(), puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })!
    const id = repo.insert(record)
    expect(id).not.toBeNull()

    const stored = repo.getByTier('emerald')
    expect(stored).toHaveLength(1)
    expect(stored[0].enemyChampions).toEqual(['Alistar', 'Annie', 'Ashe', 'Ezreal', 'Swain'])
    expect(stored[0].result).toBe('loss')
  })

  it('does not double-record the same match (dedupe by timestamp / SC-006)', () => {
    const record = buildGameRecord({ match: fixtureMatch(), puuid: PUUID, tier: 'emerald', idToKey: ID_TO_KEY })!
    expect(repo.insert(record)).not.toBeNull()
    expect(repo.insert(record)).toBeNull() // second capture of the same game is a no-op
    expect(repo.count()).toBe(1)
  })
})
