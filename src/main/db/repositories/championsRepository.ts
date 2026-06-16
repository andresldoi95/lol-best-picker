import type { DB } from '../index'
import type { ChampionSummary } from '@shared/types'

interface ChampionRow {
  championId: number
  key: string
  name: string
  iconPath: string
  isActive: number
}

/** Read access to static champion metadata (`champions`). */
export class ChampionsRepository {
  constructor(private readonly db: DB) {}

  list(): ChampionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT champion_id AS championId,
                key          AS key,
                name         AS name,
                icon_path    AS iconPath,
                is_active    AS isActive
         FROM champions
         ORDER BY name ASC`
      )
      .all() as ChampionRow[]

    return rows.map((r) => ({
      championId: r.championId,
      key: r.key,
      name: r.name,
      iconPath: r.iconPath,
      isActive: r.isActive === 1
    }))
  }
}
