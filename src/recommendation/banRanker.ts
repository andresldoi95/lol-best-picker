import type { BanRecommendation, EloTier, Role } from '@shared/types'
import { ROLES } from '@shared/types'

/**
 * Pure ban-ranking engine (Constitution Principle IV — zero electron/vue imports,
 * no I/O, no wall-clock reads). Produces the "Recommended Bans" list: the top N
 * champions per role at the player's Elo, ranked by a **threat score** rather than
 * raw win rate (spec 007 US1, FR-002/FR-008).
 *
 *   threatScore = (winRate − 50) × pickRate
 *
 * Raw win rate alone surfaces "weird" bans: low-pick-rate one-tricks with inflated
 * win rates outrank genuinely dominant, commonly-picked champions. The threat score
 * weights a champion's win-rate *edge* by how often you'll actually face them, so a
 * 54% @ 15% pick (score 60) correctly beats a 57% @ 0.5% pick one-trick (score 3.5).
 * A sub-50% champion scores negative and sinks — you don't ban the weak.
 *
 * Bans are NOT pool-constrained (Constitution I is N/A for bans) — they span the
 * whole meta, unlike pick recommendations.
 */

/** One cached ban-stat row, already resolved to display fields (data-model.md). */
export interface BanStatInput {
  championId: number
  championName: string
  iconPath: string
  role: Role
  eloTier: EloTier
  /** Overall win rate at `eloTier`, 0–100. */
  winRate: number
  /** Pick rate (presence) %, 0–100. Null → estimated from games-share (seed/offline). */
  pickRate: number | null
  /** Sample size; used to estimate presence when `pickRate` is null. */
  gamesPlayed: number
}

export interface BanRankerInput {
  stats: BanStatInput[]
  /** Elo tier to rank for; only rows matching it are considered (FR-008). */
  currentElo: EloTier
  /** How many bans to surface per role (default 3 — "at least top 3", FR-002 / SC-002). */
  perRole?: number
  /** Drop champions below this pick rate (%) as noise; default 0.5. A role is never
   *  emptied by the floor — if every candidate is below it, the floor is ignored. */
  minPickRate?: number
}

/** SC-002: 3 per role × 5 roles = 15 bans on a single screen. */
const DEFAULT_PER_ROLE = 3
/** Champions seen in fewer than ~0.5% of games are noise for ban purposes. */
const DEFAULT_MIN_PICK_RATE = 0.5

interface ScoredBan {
  stat: BanStatInput
  /** Effective pick rate used for scoring/floor (real, or games-share estimate). */
  pickRate: number
  banScore: number
}

/**
 * Deterministic tie-break: descending threat score, then descending pick rate
 * (more-played first), then ascending champion id so equal rows are stable.
 */
function compareScored(a: ScoredBan, b: ScoredBan): number {
  if (b.banScore !== a.banScore) return b.banScore - a.banScore
  if (b.pickRate !== a.pickRate) return b.pickRate - a.pickRate
  return a.stat.championId - b.stat.championId
}

/**
 * Rank cached ban stats into per-role top-N recommendations for `currentElo` by
 * threat score. When a row's `pickRate` is null (e.g. bundled seed data), presence
 * is estimated as the champion's share of total games in its role — pick rates in a
 * role sum to ~100%, so games-share is a sound proxy and keeps one scoring model for
 * live and offline data. Roles with fewer than `perRole` candidates yield all
 * available; empty / no-matching-elo input yields `[]`. Output is flat, ordered by
 * `ROLES` then rank.
 */
export function rankBans(input: BanRankerInput): BanRecommendation[] {
  const perRole = input.perRole ?? DEFAULT_PER_ROLE
  const minPickRate = input.minPickRate ?? DEFAULT_MIN_PICK_RATE
  const forElo = input.stats.filter((s) => s.eloTier === input.currentElo)

  const out: BanRecommendation[] = []
  for (const role of ROLES) {
    const rows = forElo.filter((s) => s.role === role)
    if (rows.length === 0) continue

    // Estimate presence from games-share for rows missing a real pick rate.
    const totalGames = rows.reduce((sum, r) => sum + Math.max(0, r.gamesPlayed), 0)
    const scored: ScoredBan[] = rows.map((stat) => {
      const pickRate =
        stat.pickRate ?? (totalGames > 0 ? (100 * Math.max(0, stat.gamesPlayed)) / totalGames : 0)
      return { stat, pickRate, banScore: (stat.winRate - 50) * pickRate }
    })

    // Floor out low-presence noise, but never empty a role (fall back to all rows).
    const floored = scored.filter((s) => s.pickRate >= minPickRate)
    const pool = floored.length > 0 ? floored : scored

    pool.sort(compareScored)
    pool.slice(0, Math.max(0, perRole)).forEach((s, index) => {
      out.push({
        championId: s.stat.championId,
        championName: s.stat.championName,
        iconPath: s.stat.iconPath,
        role: s.stat.role,
        winRate: s.stat.winRate,
        pickRate: Number(s.pickRate.toFixed(2)),
        banScore: Number(s.banScore.toFixed(2)),
        rank: index + 1
      })
    })
  }
  return out
}
