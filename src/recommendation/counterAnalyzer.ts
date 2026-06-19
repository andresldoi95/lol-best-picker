import type { ConfidenceTier, GameResult, Role } from '@shared/types'

/**
 * Pure personal-counter engine (Constitution Principle IV — zero electron/vue imports,
 * no I/O, no wall-clock reads). Identifies the opponent champions a player loses to
 * most, from their *own* recorded game history — independent of official statistics
 * and of the player's champion pool (spec 008 US2, FR-003…FR-007).
 *
 *   threatScore = (50 − winRate%) × frequencyWeight
 *   frequencyWeight = min(1, gamesPlayed / 5)
 *
 * Win rate alone surfaces low-sample noise: a 0% win rate in 1 game would outrank a
 * 30% win rate in 20 games. The frequency weight discounts thin samples so a champion
 * you've genuinely lost to repeatedly ranks above a one-off blowout, while the separate
 * confidence tier (Potential/Likely/Confirmed) labels the sample size for the UI.
 * A win rate above 50% yields a negative score (a champion you beat is not a threat).
 */

/** The slice of a {@link GameRecord} the engine needs — keeps it decoupled from the
 *  full persisted shape (id/tier/etc. are irrelevant to ranking). */
export interface CounterGameInput {
  /** Enemy champion keys faced in this game. */
  enemyChampions: string[]
  playerRole: Role
  result: GameResult
  /** Unix epoch ms (drives `lastEncountered`). */
  timestamp: number
}

/** One opponent champion scored as a personal threat (engine output, key-only — the
 *  service enriches it with display name/icon, mirroring the ban pipeline). */
export interface RankedCounter {
  opponentChampion: string
  playerRole: Role | null
  gamesPlayed: number
  wins: number
  winRate: number
  threatScore: number
  confidenceTier: ConfidenceTier
  lastEncountered: number
}

export interface RankCountersOptions {
  /** Restrict to games the player played in this role (FR-006); null/undefined = all. */
  role?: Role | null
  /** Max counters to return (default 20). */
  limit?: number
}

/** Games at or below this count get a proportionally smaller threat weight. */
const FREQUENCY_FULL_WEIGHT_AT = 5
const DEFAULT_LIMIT = 20
/** Round to 2 decimals without trailing float noise. */
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Threat score for an opponent (FR-004). `winRate` is a percentage (0–100). The
 * frequency weight saturates at {@link FREQUENCY_FULL_WEIGHT_AT} games, so beyond that
 * only the win-rate edge moves the score.
 */
export function calculateThreatScore(winRate: number, gamesPlayed: number): number {
  const frequencyWeight = Math.min(1, Math.max(0, gamesPlayed) / FREQUENCY_FULL_WEIGHT_AT)
  return (50 - winRate) * frequencyWeight
}

/** Sample-size confidence label (FR-007): 1–2 → Potential, 3–9 → Likely, 10+ → Confirmed. */
export function assignConfidenceTier(gamesPlayed: number): ConfidenceTier {
  if (gamesPlayed >= 10) return 'Confirmed'
  if (gamesPlayed >= 3) return 'Likely'
  return 'Potential'
}

/** Keep only games the player played in `role`; null/undefined `role` returns all
 *  games unchanged (FR-006 — "all roles"). */
export function filterByRole<T extends { playerRole: Role }>(
  games: readonly T[],
  role: Role | null | undefined
): T[] {
  if (!role) return [...games]
  return games.filter((g) => g.playerRole === role)
}

interface Aggregate {
  games: number
  wins: number
  lastEncountered: number
}

/**
 * Aggregate recorded games into a ranked personal-counter list (FR-005). Each enemy in
 * each game contributes one observation; win/loss is taken from the player's
 * perspective. Optionally scoped to a role first (FR-006). Ordered by threat score
 * descending, then games descending, then champion key ascending (deterministic, so
 * tied threats are stable). Empty input → `[]` (FR-009 empty state).
 */
export function rankCounters(
  games: readonly CounterGameInput[],
  options: RankCountersOptions = {}
): RankedCounter[] {
  const role = options.role ?? null
  const limit = options.limit ?? DEFAULT_LIMIT
  const scoped = filterByRole(games, role)

  const byOpponent = new Map<string, Aggregate>()
  for (const game of scoped) {
    const won = game.result === 'win'
    // A champion that appears twice in one game's enemy list (shouldn't happen, but be
    // safe) is counted once per game so win rate stays per-game, not per-appearance.
    for (const enemy of new Set(game.enemyChampions)) {
      const agg = byOpponent.get(enemy) ?? { games: 0, wins: 0, lastEncountered: 0 }
      agg.games += 1
      if (won) agg.wins += 1
      agg.lastEncountered = Math.max(agg.lastEncountered, game.timestamp)
      byOpponent.set(enemy, agg)
    }
  }

  const counters: RankedCounter[] = [...byOpponent.entries()].map(([opponentChampion, agg]) => {
    const winRate = agg.games > 0 ? (agg.wins / agg.games) * 100 : 0
    return {
      opponentChampion,
      playerRole: role,
      gamesPlayed: agg.games,
      wins: agg.wins,
      winRate: round2(winRate),
      threatScore: round2(calculateThreatScore(winRate, agg.games)),
      confidenceTier: assignConfidenceTier(agg.games),
      lastEncountered: agg.lastEncountered
    }
  })

  counters.sort((a, b) => {
    if (b.threatScore !== a.threatScore) return b.threatScore - a.threatScore
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed
    return a.opponentChampion.localeCompare(b.opponentChampion)
  })

  return counters.slice(0, Math.max(0, limit))
}
