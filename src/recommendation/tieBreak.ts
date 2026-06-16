/**
 * Deterministic tie-break (FR-016). A `Scored` item carries the values needed to
 * order candidates with equal win-rate scores stably and repeatably.
 */
export interface Scored {
  /** Win-rate percentage used for ranking (higher is better). */
  score: number
  /** Sample size on the deciding stat row (higher breaks ties first). */
  gamesPlayed: number
  /** Riot champion id (ascending breaks fully-equal ties last). */
  championId: number
}

/**
 * Comparator for `Array.prototype.sort` producing: descending `score`, then
 * descending `gamesPlayed`, then ascending `championId`. Total and deterministic.
 */
export function compareScored(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed
  return a.championId - b.championId
}
