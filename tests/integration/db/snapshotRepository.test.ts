import { describe, it, expect, afterEach } from 'vitest'
import { SnapshotRepository, resolveRole } from '@main/db/repositories/snapshotRepository'
import { createTempDbFile, openSeededDb } from '../../helpers/db'
import type { DB } from '@main/db'

describe('SnapshotRepository (integration against a temp SQLite file)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  it('returns defaults initially, persists updates, and survives reconnection', () => {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)

    // defaults on a fresh DB (the migration seeds an empty singleton row)
    const initial = new SnapshotRepository(db).get()
    expect(initial).toMatchObject({
      assignedRole: null,
      enemyChampionIds: [],
      allyChampionIds: [],
      sessionActive: false
    })

    new SnapshotRepository(db).update({
      assignedRole: 'TOP',
      enemyChampionIds: [266, 103],
      allyChampionIds: [21, 412],
      sessionActive: true
    })

    const afterUpdate = new SnapshotRepository(db).get()
    expect(afterUpdate).toMatchObject({
      assignedRole: 'TOP',
      enemyChampionIds: [266, 103],
      allyChampionIds: [21, 412],
      sessionActive: true
    })
    expect(typeof afterUpdate.updatedAt).toBe('string')

    // a partial update preserves untouched fields (incl. allyChampionIds)
    new SnapshotRepository(db).update({ sessionActive: false })
    expect(new SnapshotRepository(db).get()).toMatchObject({
      assignedRole: 'TOP',
      enemyChampionIds: [266, 103],
      allyChampionIds: [21, 412],
      sessionActive: false
    })

    // persistence across a fresh connection (app opened before champ select / LCU disconnected)
    db.close()
    db = openSeededDb(file.path)
    expect(new SnapshotRepository(db).get()).toMatchObject({
      assignedRole: 'TOP',
      enemyChampionIds: [266, 103],
      allyChampionIds: [21, 412]
    })
  })

  it('resolveRole applies manual → live → snapshot → null precedence', () => {
    expect(resolveRole('JUNGLE', 'MIDDLE', 'TOP')).toBe('JUNGLE')
    expect(resolveRole(null, 'MIDDLE', 'TOP')).toBe('MIDDLE')
    expect(resolveRole(null, null, 'TOP')).toBe('TOP')
    expect(resolveRole(null, null, null)).toBeNull()
  })
})
