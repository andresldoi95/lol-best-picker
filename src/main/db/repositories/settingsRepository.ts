import type { DB } from '../index'
import type { AppSettings, FetchStatus, Role } from '@shared/types'

interface SettingsRow {
  stats_freshness_hours: number
  manual_role: Role | null
  last_stats_fetch_at: string | null
  last_stats_fetch_status: FetchStatus | null
}

const DEFAULTS: AppSettings = {
  manualRole: null,
  statsFreshnessHours: 24,
  lastStatsFetchAt: null,
  lastStatsFetchStatus: null
}

/** Read/write the single-row `app_settings` table. */
export class SettingsRepository {
  constructor(private readonly db: DB) {}

  get(): AppSettings {
    const row = this.db
      .prepare(
        `SELECT stats_freshness_hours, manual_role, last_stats_fetch_at, last_stats_fetch_status
         FROM app_settings WHERE id = 1`
      )
      .get() as SettingsRow | undefined

    if (!row) return { ...DEFAULTS }

    return {
      manualRole: row.manual_role,
      statsFreshnessHours: row.stats_freshness_hours,
      lastStatsFetchAt: row.last_stats_fetch_at,
      lastStatsFetchStatus: row.last_stats_fetch_status
    }
  }

  /** Session-level manual role override (FR-007); pass null to clear. */
  setManualRole(role: Role | null): void {
    this.db.prepare('UPDATE app_settings SET manual_role = ? WHERE id = 1').run(role)
  }

  /** Configurable freshness threshold (research.md §5). */
  setStatsFreshnessHours(hours: number): void {
    this.db.prepare('UPDATE app_settings SET stats_freshness_hours = ? WHERE id = 1').run(hours)
  }
}
