import type { DB } from '../index'
import type { Role } from '@shared/types'

export interface ChampSelectSnapshot {
  assignedRole: Role | null
  enemyChampionIds: number[]
  allyChampionIds: number[]
  sessionActive: boolean
  /** ISO-8601 timestamp of the last update. */
  updatedAt: string
}

interface SnapshotRow {
  assigned_role: Role | null
  enemy_champion_ids: string
  ally_champion_ids: string
  session_active: number
  updated_at: string
}

const EMPTY: ChampSelectSnapshot = {
  assignedRole: null,
  enemyChampionIds: [],
  allyChampionIds: [],
  sessionActive: false,
  updatedAt: '1970-01-01T00:00:00.000Z'
}

/**
 * Persists the last-known champ-select context (single-row `champ_select_snapshot`)
 * so the app can render a recommendation immediately on launch even when the
 * League Client isn't running (US3 AC3).
 */
export class SnapshotRepository {
  constructor(private readonly db: DB) {}

  get(): ChampSelectSnapshot {
    const row = this.db
      .prepare(
        `SELECT assigned_role, enemy_champion_ids, ally_champion_ids, session_active, updated_at
         FROM champ_select_snapshot WHERE id = 1`
      )
      .get() as SnapshotRow | undefined

    if (!row) return { ...EMPTY }

    return {
      assignedRole: row.assigned_role,
      enemyChampionIds: parseIdArray(row.enemy_champion_ids),
      allyChampionIds: parseIdArray(row.ally_champion_ids),
      sessionActive: row.session_active === 1,
      updatedAt: row.updated_at
    }
  }

  update(partial: Partial<ChampSelectSnapshot>): void {
    const current = this.get()
    const next: ChampSelectSnapshot = {
      ...current,
      ...partial,
      updatedAt: partial.updatedAt ?? new Date().toISOString()
    }
    this.db
      .prepare(
        `UPDATE champ_select_snapshot
         SET assigned_role = @assignedRole,
             enemy_champion_ids = @enemyChampionIds,
             ally_champion_ids = @allyChampionIds,
             session_active = @sessionActive,
             updated_at = @updatedAt
         WHERE id = 1`
      )
      .run({
        assignedRole: next.assignedRole,
        enemyChampionIds: JSON.stringify(next.enemyChampionIds),
        allyChampionIds: JSON.stringify(next.allyChampionIds),
        sessionActive: next.sessionActive ? 1 : 0,
        updatedAt: next.updatedAt
      })
  }
}

/** Parse a JSON champion-id array column, tolerating malformed/non-array values. */
function parseIdArray(json: string): number[] {
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

/**
 * Role-resolution precedence (data-model.md): manual override → live LCU assigned
 * role → last-known snapshot role → none.
 */
export function resolveRole(
  manualRole: Role | null,
  liveRole: Role | null,
  snapshotRole: Role | null
): Role | null {
  return manualRole ?? liveRole ?? snapshotRole ?? null
}
