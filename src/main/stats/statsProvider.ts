import type { Role } from '@shared/types'

/**
 * A single normalized champion/role/(matchup|overall) win-rate row, keyed by
 * Data Dragon slugs (never a provider's internal ids). See contracts/stats-provider.md.
 */
export interface NormalizedChampionStat {
  /** Data Dragon `champion.key`, e.g. "Ahri". */
  championKey: string
  role: Role
  /** null = overall win rate for (championKey, role); non-null = matchup-specific. */
  opponentChampionKey: string | null
  /** 0.0–100.0 */
  winRate: number
  /** Sample size; 0 if unknown but the row is still meaningful. */
  gamesPlayed: number
  /** e.g. "14.12" */
  patch: string
}

/**
 * Source of champion/matchup win-rate statistics. Isolates the recommendation
 * engine and SQLite schema from the specific provider (u.gg today) — a future
 * swap only requires a new implementation, never an engine/schema change.
 */
export interface StatsProvider {
  /**
   * Fetch the full set of rows for the current patch. One logical refresh per
   * call (the scheduler owns cadence). MUST throw on network error, non-200,
   * malformed shape, or empty result rather than returning partial bad data.
   */
  fetchChampionStats(): Promise<NormalizedChampionStat[]>
}
