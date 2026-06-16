import { describe, it, expect, afterEach } from 'vitest'
import { SynergyRepository } from '@main/db/repositories/synergyRepository'
import type { NormalizedSynergyRow } from '@main/stats/synergyProvider'
import { createTempDbFile, openSeededDb } from '../../helpers/db'
import type { DB } from '@main/db'

const PATCH = '16.12'
const AHRI = 103
const ZED = 238

function row(
  championKey: string,
  allyChampionKey: string,
  winRate: number,
  gamesPlayed: number,
  patch = PATCH
): NormalizedSynergyRow {
  return { championKey, role: 'MIDDLE', allyChampionKey, winRate, gamesPlayed, patch }
}

describe('SynergyRepository (integration against a temp SQLite file)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  function freshDb(): DB {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path) // champions seeded so key → id resolves
    return db
  }

  it('resolves keys → ids on upsert and reads them back for the given champions', () => {
    const repo = new SynergyRepository(freshDb())
    const result = repo.upsertSynergy([row('Ahri', 'Zed', 55, 300)])
    expect(result.upserted).toBe(1)

    const rows = repo.getSynergyRowsForChampions([AHRI])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      championId: AHRI,
      role: 'MIDDLE',
      allyChampionId: ZED,
      winRate: 55,
      gamesPlayed: 300
    })
  })

  it('skips rows whose champion or ally key cannot be resolved', () => {
    const repo = new SynergyRepository(freshDb())
    const result = repo.upsertSynergy([row('Ahri', 'NotARealChampion', 55, 300)])
    expect(result).toEqual({ upserted: 0, skipped: 1 })
    expect(repo.getSynergyRowsForChampions([AHRI])).toHaveLength(0)
  })

  it('REPLACEs on the (champion, role, ally, patch) unique conflict', () => {
    const repo = new SynergyRepository(freshDb())
    repo.upsertSynergy([row('Ahri', 'Zed', 50, 100)])
    repo.upsertSynergy([row('Ahri', 'Zed', 58, 400)]) // same key+patch → replace

    const rows = repo.getSynergyRowsForChampions([AHRI])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ winRate: 58, gamesPlayed: 400 })
  })

  it('returns an empty array when no rows exist or no ids are requested', () => {
    const repo = new SynergyRepository(freshDb())
    expect(repo.getSynergyRowsForChampions([AHRI])).toEqual([])
    repo.upsertSynergy([row('Ahri', 'Zed', 55, 300)])
    expect(repo.getSynergyRowsForChampions([])).toEqual([])
  })
})
