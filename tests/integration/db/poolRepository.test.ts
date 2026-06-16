import { describe, it, expect, afterEach } from 'vitest'
import { PoolRepository } from '@main/db/repositories/poolRepository'
import { createTempDbFile, openSeededDb } from '../../helpers/db'
import type { DB } from '@main/db'

// Champion IDs present in the bundled seed snapshot.
const AHRI = 103
const AATROX = 266

describe('PoolRepository (integration against a temp SQLite file)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  it('supports add, idempotent duplicate, multi-role, scoped/all removal, and persistence', () => {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)
    const repo = new PoolRepository(db)

    // add + duplicate add is a no-op (FR-005)
    repo.add(AHRI, 'MIDDLE')
    repo.add(AHRI, 'MIDDLE')
    expect(repo.list().filter((e) => e.championId === AHRI)).toHaveLength(1)

    // a second role for the same champion is a distinct entry
    repo.add(AHRI, 'TOP')
    expect(
      repo
        .list()
        .filter((e) => e.championId === AHRI)
        .map((e) => e.role)
        .sort()
    ).toEqual(['MIDDLE', 'TOP'])

    // removing a single role leaves other roles intact
    repo.add(AATROX, 'TOP')
    repo.remove(AHRI, 'TOP')
    expect(repo.list().filter((e) => e.championId === AHRI).map((e) => e.role)).toEqual(['MIDDLE'])
    expect(repo.list().some((e) => e.championId === AATROX)).toBe(true)

    // removing a non-existent (champion, role) is a no-op
    expect(() => repo.remove(AHRI, 'JUNGLE')).not.toThrow()

    // removeAllRoles clears every row for a champion
    repo.removeAllRoles(AATROX)
    expect(repo.list().some((e) => e.championId === AATROX)).toBe(false)
    expect(() => repo.removeAllRoles(AATROX)).not.toThrow()

    // list() exposes joined champion metadata
    const ahri = repo.list().find((e) => e.championId === AHRI)
    expect(ahri).toMatchObject({ key: 'Ahri', name: 'Ahri', role: 'MIDDLE', isActive: true, isFlagged: false })
    expect(typeof ahri?.addedAt).toBe('string')

    // persistence across a fresh connection to the same file (FR-004)
    db.close()
    db = openSeededDb(file.path)
    const persisted = new PoolRepository(db).list().filter((e) => e.championId === AHRI)
    expect(persisted).toHaveLength(1)
    expect(persisted[0].role).toBe('MIDDLE')
  })
})
