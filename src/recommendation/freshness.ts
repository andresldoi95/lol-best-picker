import type { FetchStatus, Freshness } from '@shared/types'

export interface FreshnessInput {
  /** ISO-8601 timestamp of the last *attempted* stats fetch, or null if never. */
  lastFetchAt: string | null
  lastFetchStatus: FetchStatus | null
  thresholdHours: number
  /** Injected "current time" — the engine never reads the wall clock (Principle IV). */
  now: string
}

const MS_PER_HOUR = 60 * 60 * 1000

/**
 * Derive the freshness label per research.md §5:
 *  - `stale`  — never fetched, or last successful fetch older than the threshold
 *               (takes precedence over `cached`, regardless of current status).
 *  - `cached` — fetched within the threshold but the latest attempt errored.
 *  - `live`   — fetched successfully within the threshold.
 */
export function deriveFreshness(input: FreshnessInput): Freshness {
  const { lastFetchAt, lastFetchStatus, thresholdHours, now } = input

  if (!lastFetchAt) return 'stale'

  const ageMs = new Date(now).getTime() - new Date(lastFetchAt).getTime()
  const withinThreshold = ageMs <= thresholdHours * MS_PER_HOUR

  if (!withinThreshold) return 'stale'
  return lastFetchStatus === 'success' ? 'live' : 'cached'
}
