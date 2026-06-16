import type { DB } from '../index'
import type { NormalizedChampionStat } from '../../stats/statsProvider'
import type { StatRowInput } from '@recommendation/engine'

interface ChampionStatRow {
  championId: number
  role: StatRowInput['role']
  opponentChampionId: number | null
  winRate: number
  gamesPlayed: number
}

/**
 * Persists cached champion statistics and tracks fetch freshness in `app_settings`.
 * Resolves Data Dragon slugs → numeric champion ids via the `champions` table;
 * rows whose key can't be resolved are skipped (logged, not fatal).
 */
export class StatsRepository {
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
   * Upsert normalized rows for their patch and mark the fetch successful. On any
   * thrown error from the provider, the caller invokes `markFetchError()` instead,
   * leaving existing `champion_stats` untouched (cached/stale display depends on it).
   */
  upsertStats(rows: NormalizedChampionStat[]): { upserted: number; skipped: number } {
    const idOf = this.keyToId()
    const now = new Date().toISOString()
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO champion_stats
         (champion_id, role, opponent_champion_id, win_rate, games_played, patch, fetched_at)
       VALUES (@championId, @role, @opponentChampionId, @winRate, @gamesPlayed, @patch, @fetchedAt)`
    )
    const markSuccess = this.db.prepare(
      `UPDATE app_settings SET last_stats_fetch_at = @now, last_stats_fetch_status = 'success' WHERE id = 1`
    )

    let upserted = 0
    let skipped = 0
    const apply = this.db.transaction(() => {
      for (const row of rows) {
        const championId = idOf.get(row.championKey)
        if (championId === undefined) {
          skipped++
          continue
        }
        let opponentChampionId: number | null = null
        if (row.opponentChampionKey !== null) {
          const oppId = idOf.get(row.opponentChampionKey)
          if (oppId === undefined) {
            skipped++
            continue
          }
          opponentChampionId = oppId
        }
        insert.run({
          championId,
          role: row.role,
          opponentChampionId,
          winRate: row.winRate,
          gamesPlayed: row.gamesPlayed,
          patch: row.patch,
          fetchedAt: now
        })
        upserted++
      }
      markSuccess.run({ now })
    })
    apply()

    return { upserted, skipped }
  }

  /** Record a failed refresh without touching cached rows (research.md §5). */
  markFetchError(): void {
    this.db
      .prepare(`UPDATE app_settings SET last_stats_fetch_status = 'error' WHERE id = 1`)
      .run()
  }

  /**
   * Return all stat rows (overall + matchup) for the given champions at the most
   * recently fetched patch, plus that patch label. Shape matches the engine's
   * `StatRowInput`.
   */
  getStatRowsForChampions(championIds: number[]): { rows: StatRowInput[]; patch: string } {
    const patchRow = this.db
      .prepare('SELECT patch FROM champion_stats ORDER BY fetched_at DESC, id DESC LIMIT 1')
      .get() as { patch: string } | undefined
    const patch = patchRow?.patch ?? ''

    if (championIds.length === 0 || patch === '') return { rows: [], patch }

    const placeholders = championIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT champion_id          AS championId,
                role                  AS role,
                opponent_champion_id  AS opponentChampionId,
                win_rate              AS winRate,
                games_played          AS gamesPlayed
         FROM champion_stats
         WHERE patch = ? AND champion_id IN (${placeholders})`
      )
      .all(patch, ...championIds) as ChampionStatRow[]

    return { rows, patch }
  }
}
