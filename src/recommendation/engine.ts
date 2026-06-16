import type {
  ActiveSignal,
  Recommendation,
  RecommendationEntry,
  Role,
  ScoreBasis,
  ScoreBreakdown
} from '@shared/types'
import { compareScored, type Scored } from './tieBreak'
import { deriveFreshness, type FreshnessInput } from './freshness'
import { scoreWithAllies, type AllyCandidateScore } from './synergy'

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

/** One ally-synergy win-rate row: championId in role played alongside allyChampionId (spec 002). */
export interface SynergyRowInput {
  championId: number
  role: Role
  allyChampionId: number
  winRate: number
  gamesPlayed: number
}

export interface RecommendationInput {
  poolEntries: PoolEntryInput[]
  statRows: StatRowInput[]
  /** Ally-synergy rows for the pool champions (spec 002); empty → overall-WR fallback. */
  synergyRows: SynergyRowInput[]
  /** Resolved per data-model.md role precedence; null → empty Recommendation. */
  role: Role | null
  enemyChampionIds: number[]
  /** Locked-in ally picks; excluded from candidates (FR-010) and used for synergy scoring. */
  allyChampionIds: number[]
  freshness: FreshnessInput
  statsAsOfPatch: string
}

interface ScoredCandidate extends Scored {
  entry: RecommendationEntry
}

interface EnemyCandidateScore {
  /** Enemy-matchup component (matchup avg, overall fallback, or 0). */
  enemyScore: number
  gamesPlayed: number
  /** `'matchup'` when scored vs revealed enemies; `'overall'` otherwise. */
  scoreBasis: 'matchup' | 'overall'
  /** Candidate's overall win rate (0 if no overall row) — used for ally fallback. */
  overallWinRate: number
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
): EnemyCandidateScore {
  const rowsForChamp = statRows.filter(
    (r) => r.championId === candidate.championId && r.role === candidate.role
  )
  const overall = rowsForChamp.find((r) => r.opponentChampionId === null)
  const overallWinRate = overall?.winRate ?? 0

  if (enemyChampionIds.length > 0) {
    const matchupRows = rowsForChamp.filter(
      (r) => r.opponentChampionId !== null && enemyChampionIds.includes(r.opponentChampionId)
    )
    if (matchupRows.length > 0) {
      const enemyScore = matchupRows.reduce((sum, r) => sum + r.winRate, 0) / matchupRows.length
      const gamesPlayed = matchupRows.reduce((sum, r) => sum + r.gamesPlayed, 0)
      return { enemyScore, gamesPlayed, scoreBasis: 'matchup', overallWinRate }
    }
  }

  if (overall) {
    return { enemyScore: overall.winRate, gamesPlayed: overall.gamesPlayed, scoreBasis: 'overall', overallWinRate }
  }

  return { enemyScore: 0, gamesPlayed: 0, scoreBasis: 'overall', overallWinRate: 0 }
}

interface CombinedScore {
  score: number
  gamesPlayed: number
  scoreBasis: ScoreBasis
  scoreBreakdown: ScoreBreakdown
}

/**
 * Combine the enemy-matchup and ally-synergy signals per research.md §3:
 *  - both enemies revealed AND allies locked → 50/50 weighted (scoreBasis 'combined');
 *  - enemies only → enemy score (scoreBasis from the enemy path);
 *  - allies only → ally score;
 *  - neither → overall win rate (the enemy path already folds to overall here).
 * `activeSignals` records which signals actually contributed, deduplicated.
 */
function combineScores(
  enemy: EnemyCandidateScore,
  ally: AllyCandidateScore,
  hasEnemies: boolean,
  hasAllies: boolean
): CombinedScore {
  const enemySignal: ActiveSignal = enemy.scoreBasis === 'matchup' ? 'enemy-matchup' : 'overall'
  const allySignal: ActiveSignal = ally.signal === 'ally-synergy' ? 'ally-synergy' : 'overall'

  let score: number
  let scoreBasis: ScoreBasis
  const signals: ActiveSignal[] = []

  if (hasEnemies && hasAllies) {
    score = 0.5 * enemy.enemyScore + 0.5 * ally.score
    scoreBasis = 'combined'
    signals.push(enemySignal, allySignal)
  } else if (hasAllies) {
    score = ally.score
    // ally-only path has no 'matchup' basis; the precise signal is in activeSignals.
    scoreBasis = 'overall'
    signals.push(allySignal)
  } else {
    // enemies-only, or neither (the enemy path already returns the overall row).
    score = enemy.enemyScore
    scoreBasis = enemy.scoreBasis
    signals.push(enemySignal)
  }

  return {
    score,
    gamesPlayed: enemy.gamesPlayed + ally.gamesPlayed,
    scoreBasis,
    scoreBreakdown: {
      enemyMatchupScore: enemy.enemyScore,
      allysSynergyScore: ally.score,
      combinedScore: score,
      activeSignals: [...new Set(signals)]
    }
  }
}

/**
 * Pure recommendation function (Constitution Principle IV). Filters the pool to
 * the active role FIRST (Principle I, FR-008), scores/ranks the survivors by
 * win rate, and annotates freshness. No I/O, no wall-clock reads, no side effects.
 */
export function computeRecommendation(input: RecommendationInput): Recommendation {
  const { role, enemyChampionIds, allyChampionIds, statRows, synergyRows, freshness, statsAsOfPatch, poolEntries } =
    input

  const result: Recommendation = {
    role,
    entries: [],
    enemyChampionIds: [...enemyChampionIds],
    allyChampionIds: [...allyChampionIds],
    freshness: deriveFreshness(freshness),
    statsAsOfPatch,
    lastUpdatedAt: freshness.lastFetchAt ?? freshness.now
  }

  // role === null → caller shows the role-selection prompt (FR-007).
  if (role === null) return result

  // Pool + role is the ONLY filter (Principle I). Exclude champions already locked
  // by either team — enemy picks we'd never mirror, and allies already taken (FR-010).
  // Empty survivors → FR-013 empty state.
  const enemyChampionIdSet = new Set(enemyChampionIds)
  const allyChampionIdSet = new Set(allyChampionIds)
  const candidates = poolEntries.filter(
    (entry) =>
      entry.role === role &&
      !enemyChampionIdSet.has(entry.championId) &&
      !allyChampionIdSet.has(entry.championId)
  )
  if (candidates.length === 0) return result

  const hasEnemies = enemyChampionIds.length > 0
  const hasAllies = allyChampionIds.length > 0

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const enemy = scoreCandidate(candidate, statRows, enemyChampionIds)
    const ally = scoreWithAllies(candidate, synergyRows, allyChampionIds, enemy.overallWinRate)
    const { score, gamesPlayed, scoreBasis, scoreBreakdown } = combineScores(
      enemy,
      ally,
      hasEnemies,
      hasAllies
    )
    const entry: RecommendationEntry = {
      championId: candidate.championId,
      championKey: candidate.championKey,
      championName: candidate.championName,
      iconPath: candidate.iconPath,
      role: candidate.role,
      score,
      scoreBasis,
      isFlagged: !candidate.isActive,
      scoreBreakdown
    }
    return { entry, score, gamesPlayed, championId: candidate.championId }
  })

  scored.sort(compareScored)
  result.entries = scored.map((s) => s.entry)
  return result
}
