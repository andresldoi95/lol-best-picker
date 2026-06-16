import type { DB } from '../../db'
import seedStats from './championStats.json'

interface SeedStatsRow {
  championKey: string
  role: string
  winRate: number
  gamesPlayed: number
}

interface SeedStatsFile {
  patch: string
  rows: SeedStatsRow[]
}

/**
 * Seed/backfill baseline `champion_stats` (overall rows only,
 * `opponent_champion_id IS NULL`) from the bundled snapshot so a recommendation can
 * be shown before any live u.gg fetch (SC-006). Idempotent via INSERT OR IGNORE:
 * never overwrites existing/live rows, but DOES backfill champions introduced by a
 * newer bundled roster on an already-populated database.
 *
 * Does NOT touch `app_settings.last_stats_fetch_at`: this is bundled baseline
 * data, not a live fetch, so freshness derivation treats it accordingly.
 *
 * Returns the number of rows actually inserted.
 */
export function seedChampionStats(db: DB): number {
  const file = seedStats as SeedStatsFile

  const keyToId = new Map<string, number>(
    (db.prepare('SELECT champion_id, key FROM champions').all() as Array<{
      champion_id: number
      key: string
    }>).map((r) => [r.key, r.champion_id])
  )

  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO champion_stats
       (champion_id, role, opponent_champion_id, win_rate, games_played, patch, fetched_at)
     VALUES (@championId, @role, NULL, @winRate, @gamesPlayed, @patch, @fetchedAt)`
  )

  let inserted = 0
  const apply = db.transaction(() => {
    for (const row of file.rows) {
      const championId = keyToId.get(row.championKey)
      if (championId === undefined) continue // skip unresolved keys (logged by caller if needed)
      const info = insert.run({
        championId,
        role: row.role,
        winRate: row.winRate,
        gamesPlayed: row.gamesPlayed,
        patch: file.patch,
        fetchedAt: now
      })
      inserted += info.changes
    }
  })
  apply()

  return inserted
}

/** The patch the bundled baseline stats correspond to. */
export const SEED_STATS_PATCH = (seedStats as SeedStatsFile).patch
