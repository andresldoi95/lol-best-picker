import type { DB } from '../index'
import type { BanStatInput } from '@recommendation/banRanker'
import type { EloTier, Role } from '@shared/types'

/**
 * Normalized ban-stat row keyed by Data Dragon slug (the provider's output, before
 * id resolution) — the ban-stats analogue of `NormalizedChampionStat`.
 */
export interface NormalizedBanStat {
  championKey: string
  role: Role
  eloTier: EloTier
  /** Overall win rate at `eloTier`, 0–100. */
  winRate: number
  /** Pick rate for context; null when unknown. */
  pickRate: number | null
  gamesPlayed: number
  patch: string
}

interface BanStatJoinRow {
  championId: number
  championName: string
  iconPath: string
  role: Role
  eloTier: EloTier
  winRate: number
  pickRate: number | null
  gamesPlayed: number
}

/**
 * Persists cached ban statistics in `ban_stats` and tracks ban-fetch freshness in
 * `app_settings` (last_ban_stats_fetch_at/_status). Resolves Data Dragon slugs →
 * numeric champion ids via the `champions` table; unresolved rows are skipped
 * (logged-not-fatal) — the same pattern as `StatsRepository`/`SynergyRepository`.
 */
export class BanStatsRepository {
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
   * Upsert normalized ban rows and mark the fetch successful. On any provider
   * error the caller invokes `markFetchError()` instead, leaving cached `ban_stats`
   * untouched (cached/stale display depends on it — Constitution III).
   */
  upsertBanStats(rows: NormalizedBanStat[]): { upserted: number; skipped: number } {
    const idOf = this.keyToId()
    const now = new Date().toISOString()
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO ban_stats
         (champion_id, role, elo_tier, win_rate, pick_rate, games_played, patch, data_source, fetched_at)
       VALUES (@championId, @role, @eloTier, @winRate, @pickRate, @gamesPlayed, @patch, 'lolalytics', @fetchedAt)`
    )
    const markSuccess = this.db.prepare(
      `UPDATE app_settings
         SET last_ban_stats_fetch_at = @now, last_ban_stats_fetch_status = 'success'
       WHERE id = 1`
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
        insert.run({
          championId,
          role: row.role,
          eloTier: row.eloTier,
          winRate: row.winRate,
          pickRate: row.pickRate,
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

  /** Record a failed refresh without touching cached rows or the success timestamp
   *  (so freshness still ages off the last *successful* fetch — research.md §5). */
  markFetchError(): void {
    this.db
      .prepare(`UPDATE app_settings SET last_ban_stats_fetch_status = 'error' WHERE id = 1`)
      .run()
  }

  /** True once any ban row is cached for the given elo (lets the scheduler avoid
   *  re-fetching an elo it already has while the cache is still fresh). */
  hasBanStatsForElo(eloTier: EloTier): boolean {
    return (
      this.db.prepare('SELECT 1 FROM ban_stats WHERE elo_tier = ? LIMIT 1').get(eloTier) !== undefined
    )
  }

  /**
   * Return display-ready ban-stat rows for `eloTier` at the most recently fetched
   * patch (JOINing `champions` for name + icon), shaped as the engine's
   * `BanStatInput`. Patch is resolved the same way as `StatsRepository`.
   */
  getBanStatsByElo(eloTier: EloTier): BanStatInput[] {
    const patchRow = this.db
      .prepare('SELECT patch FROM ban_stats WHERE elo_tier = ? ORDER BY fetched_at DESC, id DESC LIMIT 1')
      .get(eloTier) as { patch: string } | undefined
    const patch = patchRow?.patch
    if (patch === undefined) return []

    return this.db
      .prepare(
        `SELECT b.champion_id  AS championId,
                c.name         AS championName,
                c.icon_path    AS iconPath,
                b.role         AS role,
                b.elo_tier     AS eloTier,
                b.win_rate     AS winRate,
                b.pick_rate    AS pickRate,
                b.games_played AS gamesPlayed
         FROM ban_stats b
         JOIN champions c ON c.champion_id = b.champion_id
         WHERE b.elo_tier = ? AND b.patch = ?`
      )
      .all(eloTier, patch) as BanStatJoinRow[]
  }
}
