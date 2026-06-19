import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameRecordsRepository } from '@main/db/repositories/gameRecordsRepository'
import { createTempDbFile, openSeededDb } from '../../helpers/db'
import type { DB } from '@main/db'
import type { NewGameRecord } from '@shared/types'

let db: DB
let cleanup: () => void
let repo: GameRecordsRepository

function record(overrides: Partial<NewGameRecord> = {}): NewGameRecord {
  return {
    timestamp: 1_000,
    playerChampion: 'Akali',
    playerRole: 'MIDDLE',
    alliedChampions: ['Alistar', 'Jinx', 'LeeSin', 'Thresh'],
    enemyChampions: ['Ahri', 'Braum', 'Ornn', 'Syndra', 'Zeri'],
    result: 'loss',
    playerTier: 'emerald',
    ...overrides
  }
}

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

describe('migration 006 — game_records schema', () => {
  it('creates the game_records table with the expected columns', () => {
    const cols = (db.prepare('PRAGMA table_info(game_records)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'timestamp',
        'player_champion',
        'player_role',
        'allied_champions',
        'enemy_champions',
        'result',
        'player_tier',
        'created_at'
      ])
    )
  })

  it('creates the role/tier/timestamp indices', () => {
    const indices = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='game_records'").all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    expect(indices).toEqual(
      expect.arrayContaining([
        'idx_game_records_player_role',
        'idx_game_records_player_tier',
        'idx_game_records_timestamp'
      ])
    )
  })

  it('adds the game-record freshness columns to app_settings', () => {
    const cols = (db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(cols).toEqual(
      expect.arrayContaining(['last_game_record_fetch_at', 'last_game_record_tier'])
    )
  })

  it('enforces the role and result CHECK constraints', () => {
    // Raw INSERT (not the repo's INSERT OR IGNORE, which silently skips CHECK
    // violations) so the migration's constraints are actually exercised.
    const rawInsert = (role: string, result: string): void => {
      db.prepare(
        `INSERT INTO game_records
           (timestamp, player_champion, player_role, allied_champions, enemy_champions, result, player_tier)
         VALUES (?, 'Akali', ?, '[]', '[]', ?, 'emerald')`
      ).run(Date.now() + Math.random(), role, result)
    }
    expect(() => rawInsert('MID', 'loss')).toThrow() // 'MID' is not the canonical 'MIDDLE'
    expect(() => rawInsert('MIDDLE', 'draw')).toThrow() // result must be win|loss
    expect(() => rawInsert('MIDDLE', 'win')).not.toThrow() // valid row is accepted
  })
})

describe('GameRecordsRepository', () => {
  it('inserts a record and reads it back with parsed champion arrays', () => {
    const id = repo.insert(record())
    expect(id).toBeTypeOf('number')

    const all = repo.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      timestamp: 1_000,
      playerChampion: 'Akali',
      playerRole: 'MIDDLE',
      alliedChampions: ['Alistar', 'Jinx', 'LeeSin', 'Thresh'],
      enemyChampions: ['Ahri', 'Braum', 'Ornn', 'Syndra', 'Zeri'],
      result: 'loss',
      playerTier: 'emerald'
    })
    expect(all[0].createdAt).toBeTypeOf('number')
  })

  it('dedupes on timestamp (INSERT OR IGNORE) and reports the no-op', () => {
    expect(repo.insert(record({ timestamp: 42 }))).not.toBeNull()
    expect(repo.insert(record({ timestamp: 42, playerChampion: 'Zed' }))).toBeNull()
    expect(repo.count()).toBe(1)
    expect(repo.getAll()[0].playerChampion).toBe('Akali') // first write wins
  })

  it('existsByTimestamp reflects what has been recorded', () => {
    expect(repo.existsByTimestamp(7)).toBe(false)
    repo.insert(record({ timestamp: 7 }))
    expect(repo.existsByTimestamp(7)).toBe(true)
  })

  it('getByTier returns only the requested tier, newest first', () => {
    repo.insert(record({ timestamp: 1, playerTier: 'emerald' }))
    repo.insert(record({ timestamp: 2, playerTier: 'diamond' }))
    repo.insert(record({ timestamp: 3, playerTier: 'emerald' }))

    const emerald = repo.getByTier('emerald')
    expect(emerald.map((r) => r.timestamp)).toEqual([3, 1])
    expect(repo.getByTier('diamond')).toHaveLength(1)
    expect(repo.getByTier('iron')).toEqual([])
  })

  it('getByRole filters by player role', () => {
    repo.insert(record({ timestamp: 1, playerRole: 'MIDDLE' }))
    repo.insert(record({ timestamp: 2, playerRole: 'TOP' }))
    expect(repo.getByRole('MIDDLE')).toHaveLength(1)
    expect(repo.getByRole('TOP')).toHaveLength(1)
    expect(repo.getByRole('SUPPORT')).toEqual([])
  })

  it('countByTier groups games per tier', () => {
    repo.insert(record({ timestamp: 1, playerTier: 'emerald' }))
    repo.insert(record({ timestamp: 2, playerTier: 'emerald' }))
    repo.insert(record({ timestamp: 3, playerTier: 'diamond' }))

    const counts = repo.countByTier()
    expect(counts).toEqual(
      expect.arrayContaining([
        { tier: 'emerald', games: 2 },
        { tier: 'diamond', games: 1 }
      ])
    )
    expect(repo.count()).toBe(3)
  })
})
