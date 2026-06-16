import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase, type DB } from '@main/db'
import { seedChampions } from '@main/dataDragon/championRepository'
import { seedChampionStats } from '@main/stats/seedData'

export interface TempDbFile {
  dir: string
  path: string
  cleanup: () => void
}

/** Allocate a temp directory + db file path, with a cleanup that removes the dir. */
export function createTempDbFile(): TempDbFile {
  const dir = mkdtempSync(join(tmpdir(), 'lbp-test-'))
  return {
    dir,
    path: join(dir, 'test.db'),
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

/** Open (migrate) the db at `path` and seed champions (+ baseline stats by default). */
export function openSeededDb(path: string, options: { stats?: boolean } = {}): DB {
  const db = createDatabase(path)
  seedChampions(db)
  if (options.stats !== false) seedChampionStats(db)
  return db
}
