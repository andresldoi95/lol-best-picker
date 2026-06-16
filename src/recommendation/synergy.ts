import type { PoolEntryInput, SynergyRowInput } from './engine'

/**
 * Result of scoring a pool candidate against the locked-in allies.
 * `signal` is `'ally-synergy'` when at least one ally contributed a real synergy
 * row, `'overall'` when every ally fell back to the candidate's overall win rate.
 */
export interface AllyCandidateScore {
  score: number
  gamesPlayed: number
  signal: 'ally-synergy' | 'overall'
}

/**
 * Pure ally-synergy scoring (Constitution Principle IV — no I/O, no framework
 * imports). For each locked-in ally, use the candidate's synergy win rate with
 * that ally when a matching row exists, otherwise fall back to the candidate's
 * overall win rate (research.md §3). The result is the average across all allies.
 *
 * With no allies locked in, returns the overall win rate (`signal: 'overall'`) so
 * the caller can treat "no ally signal" uniformly.
 */
export function scoreWithAllies(
  candidate: PoolEntryInput,
  synergyRows: SynergyRowInput[],
  allyChampionIds: number[],
  overallWinRate: number
): AllyCandidateScore {
  if (allyChampionIds.length === 0) {
    return { score: overallWinRate, gamesPlayed: 0, signal: 'overall' }
  }

  const rowsForChamp = synergyRows.filter(
    (r) => r.championId === candidate.championId && r.role === candidate.role
  )

  let sum = 0
  let gamesPlayed = 0
  let anySynergy = false
  for (const allyId of allyChampionIds) {
    const row = rowsForChamp.find((r) => r.allyChampionId === allyId)
    if (row) {
      sum += row.winRate
      gamesPlayed += row.gamesPlayed
      anySynergy = true
    } else {
      sum += overallWinRate
    }
  }

  return {
    score: sum / allyChampionIds.length,
    gamesPlayed,
    signal: anySynergy ? 'ally-synergy' : 'overall'
  }
}
