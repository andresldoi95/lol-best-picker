import type { DB } from '../index'
import type { EloTier, GameRecord, NewGameRecord, Role } from '@shared/types'

interface GameRecordRow {
  id: number
  timestamp: number
  player_champion: string
  player_role: Role
  allied_champions: string
  enemy_champions: string
  result: 'win' | 'loss'
  player_tier: EloTier
  created_at: number
}

/**
 * Persists and queries captured game outcomes in `game_records` (spec 008 US1).
 * Champion lists are JSON-serialized on write and parsed on read, so callers always
 * deal in `string[]` of Data Dragon keys. The `timestamp` UNIQUE constraint makes
 * inserts idempotent (`INSERT OR IGNORE`) — re-polling the same LCU match history
 * never duplicates a game (FR-002 / SC-006). No champion-pool coupling here:
 * counters are pool-independent (Constitution I is N/A for this feature).
 */
export class GameRecordsRepository {
  constructor(private readonly db: DB) {}

  private static toRecord(row: GameRecordRow): GameRecord {
    return {
      id: row.id,
      timestamp: row.timestamp,
      playerChampion: row.player_champion,
      playerRole: row.player_role,
      alliedChampions: JSON.parse(row.allied_champions) as string[],
      enemyChampions: JSON.parse(row.enemy_champions) as string[],
      result: row.result,
      playerTier: row.player_tier,
      createdAt: row.created_at
    }
  }

  /**
   * Insert one game record, ignoring it if a row with the same `timestamp` already
   * exists (dedupe). Returns the new row id, or `null` when the insert was a no-op
   * (already recorded) — lets the recorder fire the "new game" event only for genuinely
   * new games.
   */
  insert(record: NewGameRecord): number | null {
    const info = this.db
      .prepare(
        `INSERT OR IGNORE INTO game_records
           (timestamp, player_champion, player_role, allied_champions, enemy_champions, result, player_tier)
         VALUES (@timestamp, @playerChampion, @playerRole, @alliedChampions, @enemyChampions, @result, @playerTier)`
      )
      .run({
        timestamp: record.timestamp,
        playerChampion: record.playerChampion,
        playerRole: record.playerRole,
        alliedChampions: JSON.stringify(record.alliedChampions),
        enemyChampions: JSON.stringify(record.enemyChampions),
        result: record.result,
        playerTier: record.playerTier
      })
    return info.changes > 0 ? Number(info.lastInsertRowid) : null
  }

  /** True if a game with this end timestamp is already recorded (cheap dedupe check). */
  existsByTimestamp(timestamp: number): boolean {
    return (
      this.db.prepare('SELECT 1 FROM game_records WHERE timestamp = ? LIMIT 1').get(timestamp) !==
      undefined
    )
  }

  /** All records at a tier, newest first (the counter view's current-tier scope). */
  getByTier(tier: EloTier): GameRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM game_records WHERE player_tier = ? ORDER BY timestamp DESC')
        .all(tier) as GameRecordRow[]
    ).map(GameRecordsRepository.toRecord)
  }

  /** All records for a role, newest first (used by role-scoped queries/tests). */
  getByRole(role: Role): GameRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM game_records WHERE player_role = ? ORDER BY timestamp DESC')
        .all(role) as GameRecordRow[]
    ).map(GameRecordsRepository.toRecord)
  }

  /** Every record, newest first (US1 AC2 — reverse-chronological history). */
  getAll(): GameRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM game_records ORDER BY timestamp DESC')
        .all() as GameRecordRow[]
    ).map(GameRecordsRepository.toRecord)
  }

  /** Total number of recorded games across all tiers (empty-state context). */
  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM game_records').get() as { n: number }).n
  }

  /** Games recorded per tier — backs the "X games from other tiers" badge without
   *  loading every row (clarification Q1). */
  countByTier(): Array<{ tier: EloTier; games: number }> {
    return this.db
      .prepare(
        'SELECT player_tier AS tier, COUNT(*) AS games FROM game_records GROUP BY player_tier'
      )
      .all() as Array<{ tier: EloTier; games: number }>
  }
}
