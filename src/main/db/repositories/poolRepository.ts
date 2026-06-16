import type { DB } from '../index'
import type { PoolEntryView, Role } from '@shared/types'

interface PoolRow {
  championId: number
  key: string
  name: string
  iconPath: string
  isActive: number
  role: Role
  addedAt: string
}

/**
 * CRUD for the player's champion pool (`pool_entries`). All mutations are
 * idempotent no-ops on already-present / already-absent rows (FR-005,
 * contracts/ipc-api.md Error Handling).
 */
export class PoolRepository {
  constructor(private readonly db: DB) {}

  list(): PoolEntryView[] {
    const rows = this.db
      .prepare(
        `SELECT c.champion_id AS championId,
                c.key         AS key,
                c.name        AS name,
                c.icon_path   AS iconPath,
                c.is_active   AS isActive,
                pe.role       AS role,
                pe.added_at   AS addedAt
         FROM pool_entries pe
         JOIN champions c ON c.champion_id = pe.champion_id
         ORDER BY pe.role ASC, c.name ASC`
      )
      .all() as PoolRow[]

    return rows.map((r) => ({
      championId: r.championId,
      key: r.key,
      name: r.name,
      iconPath: r.iconPath,
      isActive: r.isActive === 1,
      role: r.role,
      isFlagged: r.isActive !== 1,
      addedAt: r.addedAt
    }))
  }

  /** Idempotent: a duplicate (championId, role) is a no-op success (FR-005). */
  add(championId: number, role: Role): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO pool_entries (champion_id, role, added_at)
         VALUES (?, ?, ?)`
      )
      .run(championId, role, new Date().toISOString())
  }

  /** Removes a single (champion, role) row. No-op if absent. */
  remove(championId: number, role: Role): void {
    this.db
      .prepare(`DELETE FROM pool_entries WHERE champion_id = ? AND role = ?`)
      .run(championId, role)
  }

  /** Removes every role row for a champion. No-op if none exist. */
  removeAllRoles(championId: number): void {
    this.db.prepare(`DELETE FROM pool_entries WHERE champion_id = ?`).run(championId)
  }
}
