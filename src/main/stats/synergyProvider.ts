import type { Role } from '@shared/types'

/**
 * A single normalized ally-synergy win-rate row, keyed by Data Dragon slugs
 * (never a provider's internal ids). See contracts/synergy-provider.md.
 *
 * Interpretation: "when `championKey` plays `role` alongside `allyChampionKey`
 * on the same team, the historical win rate is `winRate`%".
 */
export interface NormalizedSynergyRow {
  /** Data Dragon slug of the pool champion (e.g. "Ahri"). */
  championKey: string
  /** Role the pool champion is playing. */
  role: Role
  /** Data Dragon slug of the ally champion (e.g. "MissFortune"). */
  allyChampionKey: string
  /** Win rate (0–100) of championKey in role when played with allyChampionKey. */
  winRate: number
  /** Number of games this statistic is based on. 0 when not reported by provider. */
  gamesPlayed: number
  /** Patch label this data applies to (e.g. "16.12"). */
  patch: string
}

/** A (champion, role) pair in the player's pool to fetch synergy data for. */
export interface SynergyProviderTarget {
  /** Data Dragon slug. */
  championKey: string
  /** Role this champion occupies in the player's pool. */
  role: Role
}

/**
 * Source of ally-synergy win-rate statistics. Isolates the recommendation engine
 * and SQLite schema from the specific provider (lolalytics today), mirroring the
 * `StatsProvider` contract — a future swap only requires a new implementation.
 */
export interface SynergyProvider {
  /**
   * Fetch ally synergy win-rate rows for the given pool champion-role pairs.
   * Only fetches data for the supplied targets (pool-scoped, not all champions).
   *
   * MAY return partial results: if fetching for one target fails, the provider
   * logs the error, skips that target, and returns results for all others. An
   * empty array for a given target is not an error — it signals "no synergy data
   * available", and callers apply the overall-WR fallback (research.md §3).
   *
   * @throws Only for unrecoverable initialisation failures (e.g. cannot resolve
   *   the current patch). Per-champion fetch errors are swallowed and logged.
   */
  fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]>
}
