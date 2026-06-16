import type { Recommendation, RecommendationEntry, Role, ScoreBasis } from '@shared/types'
import { compareScored, type Scored } from './tieBreak'
import { deriveFreshness, type FreshnessInput } from './freshness'

export interface PoolEntryInput {
  championId: number
  championKey: string
  championName: string
  iconPath: string
  role: Role
  /** from champions.is_active (FR-018). */
  isActive: boolean
}

export interface StatRowInput {
  championId: number
  role: Role
  /** null = overall win rate for (champion, role); non-null = matchup-specific. */
  opponentChampionId: number | null
  winRate: number
  gamesPlayed: number
}

export interface RecommendationInput {
  poolEntries: PoolEntryInput[]
  statRows: StatRowInput[]
  /** Resolved per data-model.md role precedence; null → empty Recommendation. */
  role: Role | null
  enemyChampionIds: number[]
  freshness: FreshnessInput
  statsAsOfPatch: string
}

interface ScoredCandidate extends Scored {
  entry: RecommendationEntry
}

interface CandidateScore {
  score: number
  gamesPlayed: number
  scoreBasis: ScoreBasis
}

/**
 * Score a single candidate against the revealed enemies:
 *  - enemies revealed + matchup rows present → average those matchup win rates
 *    (scoreBasis 'matchup');
 *  - enemies revealed but no matchup row for any of them → fall back to the
 *    overall row (FR-017, scoreBasis 'overall');
 *  - no enemies revealed → use the overall row directly (FR-011);
 *  - no stat rows at all → score 0 / 0 games, never throws (lowest rank).
 */
function scoreCandidate(
  candidate: PoolEntryInput,
  statRows: StatRowInput[],
  enemyChampionIds: number[]
): CandidateScore {
  const rowsForChamp = statRows.filter(
    (r) => r.championId === candidate.championId && r.role === candidate.role
  )
  const overall = rowsForChamp.find((r) => r.opponentChampionId === null)

  if (enemyChampionIds.length > 0) {
    const matchupRows = rowsForChamp.filter(
      (r) => r.opponentChampionId !== null && enemyChampionIds.includes(r.opponentChampionId)
    )
    if (matchupRows.length > 0) {
      const score = matchupRows.reduce((sum, r) => sum + r.winRate, 0) / matchupRows.length
      const gamesPlayed = matchupRows.reduce((sum, r) => sum + r.gamesPlayed, 0)
      return { score, gamesPlayed, scoreBasis: 'matchup' }
    }
  }

  if (overall) {
    return { score: overall.winRate, gamesPlayed: overall.gamesPlayed, scoreBasis: 'overall' }
  }

  return { score: 0, gamesPlayed: 0, scoreBasis: 'overall' }
}

/**
 * Pure recommendation function (Constitution Principle IV). Filters the pool to
 * the active role FIRST (Principle I, FR-008), scores/ranks the survivors by
 * win rate, and annotates freshness. No I/O, no wall-clock reads, no side effects.
 */
export function computeRecommendation(input: RecommendationInput): Recommendation {
  const { role, enemyChampionIds, statRows, freshness, statsAsOfPatch, poolEntries } = input

  const result: Recommendation = {
    role,
    entries: [],
    enemyChampionIds: [...enemyChampionIds],
    freshness: deriveFreshness(freshness),
    statsAsOfPatch,
    lastUpdatedAt: freshness.lastFetchAt ?? freshness.now
  }

  // role === null → caller shows the role-selection prompt (FR-007).
  if (role === null) return result

  // Pool + role is the ONLY filter (Principle I). Exclude enemy picks so we never
  // recommend a champion your opponent already locked. Empty → FR-013 empty state.
  const enemyChampionIdSet = new Set(enemyChampionIds)
  const candidates = poolEntries.filter(
    (entry) => entry.role === role && !enemyChampionIdSet.has(entry.championId)
  )
  if (candidates.length === 0) return result

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const { score, gamesPlayed, scoreBasis } = scoreCandidate(candidate, statRows, enemyChampionIds)
    const entry: RecommendationEntry = {
      championId: candidate.championId,
      championKey: candidate.championKey,
      championName: candidate.championName,
      iconPath: candidate.iconPath,
      role: candidate.role,
      score,
      scoreBasis,
      isFlagged: !candidate.isActive
    }
    return { entry, score, gamesPlayed, championId: candidate.championId }
  })

  scored.sort(compareScored)
  result.entries = scored.map((s) => s.entry)
  return result
}
