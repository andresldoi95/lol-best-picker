import type { DB } from '../db'
import championData from './seedData/champions.json'

/** Subset of a Data Dragon `champion.json` entry that we consume. */
interface DdragonChampion {
  id: string // slug, e.g. "Ahri" → our `key`
  key: string // numeric string, e.g. "103" → our `champion_id`
  name: string
  image: { full: string }
}

interface DdragonFile {
  version: string
  data: Record<string, DdragonChampion>
}

const CDN = 'https://ddragon.leagueoflegends.com/cdn'

export function buildIconPath(version: string, imageFull: string): string {
  return `${CDN}/${version}/img/champion/${imageFull}`
}

/**
 * Seed/refresh the `champions` table from the bundled Data Dragon snapshot.
 * Upserts when the table is empty or the cached `data_version` differs from the
 * snapshot's version (FR-018: rows are upserted/reactivated, never hard-deleted).
 *
 * Returns the number of rows upserted (0 if already current).
 */
export function seedChampions(db: DB): number {
  const file = championData as DdragonFile
  const champions = Object.values(file.data)

  const count = (db.prepare('SELECT COUNT(*) AS c FROM champions').get() as { c: number }).c
  const existingVersion = (
    db.prepare('SELECT data_version FROM champions LIMIT 1').get() as
      | { data_version: string }
      | undefined
  )?.data_version

  if (count > 0 && existingVersion === file.version) return 0

  const upsert = db.prepare(
    `INSERT INTO champions (champion_id, key, name, icon_path, is_active, data_version)
     VALUES (@championId, @key, @name, @iconPath, 1, @dataVersion)
     ON CONFLICT(champion_id) DO UPDATE SET
       key          = excluded.key,
       name         = excluded.name,
       icon_path    = excluded.icon_path,
       is_active    = 1,
       data_version = excluded.data_version`
  )

  const apply = db.transaction(() => {
    for (const champ of champions) {
      upsert.run({
        championId: Number(champ.key),
        key: champ.id,
        name: champ.name,
        iconPath: buildIconPath(file.version, champ.image.full),
        dataVersion: file.version
      })
    }
  })
  apply()

  return champions.length
}
