import type { DB } from '../index'
import type { Role } from '@shared/types'
import type { NormalizedSynergyRow } from '../../stats/synergyProvider'

/** Numeric-id synergy row, matching the engine's `SynergyRowInput` shape (data-model §5). */
export interface SynergyRow {
  championId: number
  role: Role
  allyChampionId: number
  winRate: number
  gamesPlayed: number
}

interface ChampionSynergyRow {
  championId: number
  role: Role
  allyChampionId: number
  winRate: number
  gamesPlayed: number
}

/**
 * Persists cached ally-synergy statistics in `champion_synergy`. Resolves Data
 * Dragon slugs → numeric champion ids via the `champions` table (rows whose key
 * can't be resolved are skipped, logged-not-fatal) — the same pattern as
 * `StatsRepository`. Pool-scoped: only the (champion, role) pairs in the player's
 * pool are ever written.
 */
export class SynergyRepository {
  constructor(private readonly db: DB) {}

  private keyToId(): Map<string, number> {
    return new Map(
      (this.db.prepare('SELECT champion_id, key FROM champions').all() as Array<{
        champion_id: number
        key: string
      }>).map((r) => [r.key, r.champion_id])
    )
  }

  /**
   * Upsert normalized synergy rows (REPLACE on the UNIQUE
   * (champion_id, role, ally_champion_id, patch) conflict). Rows whose champion
   * or ally key can't be resolved to an id are skipped. Synergy refresh shares
   * the stats refresh cycle, so freshness bookkeeping lives in `StatsRepository`.
   */
  upsertSynergy(rows: NormalizedSynergyRow[]): { upserted: number; skipped: number } {
    const idOf = this.keyToId()
    const now = new Date().toISOString()
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO champion_synergy
         (champion_id, role, ally_champion_id, win_rate, games_played, patch, fetched_at)
       VALUES (@championId, @role, @allyChampionId, @winRate, @gamesPlayed, @patch, @fetchedAt)`
    )

    let upserted = 0
    let skipped = 0
    const apply = this.db.transaction(() => {
      for (const row of rows) {
        const championId = idOf.get(row.championKey)
        const allyChampionId = idOf.get(row.allyChampionKey)
        if (championId === undefined || allyChampionId === undefined) {
          skipped++
          continue
        }
        insert.run({
          championId,
          role: row.role,
          allyChampionId,
          winRate: row.winRate,
          gamesPlayed: row.gamesPlayed,
          patch: row.patch,
          fetchedAt: now
        })
        upserted++
      }
    })
    apply()

    return { upserted, skipped }
  }

  /**
   * Return the latest-patch synergy rows for the given pool champion ids, shaped
   * as the engine's `SynergyRowInput`. Patch is resolved the same way as
   * `StatsRepository.getStatRowsForChampions` (most recent `fetched_at`).
   */
  getSynergyRowsForChampions(championIds: number[]): SynergyRow[] {
    const patchRow = this.db
      .prepare('SELECT patch FROM champion_synergy ORDER BY fetched_at DESC, id DESC LIMIT 1')
      .get() as { patch: string } | undefined
    const patch = patchRow?.patch
    if (championIds.length === 0 || patch === undefined) return []

    const placeholders = championIds.map(() => '?').join(',')
    return this.db
      .prepare(
        `SELECT champion_id      AS championId,
                role             AS role,
                ally_champion_id AS allyChampionId,
                win_rate         AS winRate,
                games_played     AS gamesPlayed
         FROM champion_synergy
         WHERE patch = ? AND champion_id IN (${placeholders})`
      )
      .all(patch, ...championIds) as ChampionSynergyRow[]
  }
}
