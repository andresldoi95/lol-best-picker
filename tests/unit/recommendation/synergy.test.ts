import { describe, it, expect } from 'vitest'
import { scoreWithAllies } from '@recommendation/synergy'
import type { PoolEntryInput, SynergyRowInput } from '@recommendation/engine'
import type { Role } from '@shared/types'

function poolEntry(championId: number, role: Role): PoolEntryInput {
  return {
    championId,
    championKey: `Champ${championId}`,
    championName: `Champ ${championId}`,
    iconPath: `champ${championId}.png`,
    role,
    isActive: true
  }
}

function synergy(
  championId: number,
  role: Role,
  allyChampionId: number,
  winRate: number,
  gamesPlayed: number
): SynergyRowInput {
  return { championId, role, allyChampionId, winRate, gamesPlayed }
}

describe('scoreWithAllies — pure ally-synergy scoring (data-model §6)', () => {
  const candidate = poolEntry(1, 'MIDDLE')
  const OVERALL = 50

  // (a) no allies locked in → overall WR, signal 'overall'
  it('returns overall win rate with signal "overall" when allyChampionIds is empty', () => {
    const result = scoreWithAllies(candidate, [], [], OVERALL)
    expect(result).toEqual({ score: OVERALL, gamesPlayed: 0, signal: 'overall' })
  })

  // (b) a matching synergy row exists → that row's WR, signal 'ally-synergy'
  it('returns the synergy win rate when a matching row exists', () => {
    const rows = [synergy(1, 'MIDDLE', 21, 60, 300)]
    const result = scoreWithAllies(candidate, rows, [21], OVERALL)
    expect(result).toEqual({ score: 60, gamesPlayed: 300, signal: 'ally-synergy' })
  })

  // (c) ally with no matching synergy row → fall back to overall WR for that ally
  it('falls back to overall win rate for an ally with no matching synergy row', () => {
    const rows = [synergy(1, 'MIDDLE', 21, 60, 300)] // only ally 21 present
    const result = scoreWithAllies(candidate, rows, [99], OVERALL)
    expect(result).toEqual({ score: OVERALL, gamesPlayed: 0, signal: 'overall' })
  })

  // (d) multiple allies, mix of synergy rows + fallbacks → average across all
  it('averages win rate across multiple allies, mixing synergy rows and fallbacks', () => {
    const rows = [synergy(1, 'MIDDLE', 21, 60, 300)] // ally 21 has data; ally 99 does not
    const result = scoreWithAllies(candidate, rows, [21, 99], OVERALL)
    // (60 + 50) / 2 = 55; games = 300 (fallback contributes 0); at least one synergy hit
    expect(result.score).toBeCloseTo(55)
    expect(result.gamesPlayed).toBe(300)
    expect(result.signal).toBe('ally-synergy')
  })

  // synergy rows for a different role must not leak into the average
  it('ignores synergy rows whose role differs from the candidate role', () => {
    const rows = [synergy(1, 'TOP', 21, 90, 300)] // wrong role
    const result = scoreWithAllies(candidate, rows, [21], OVERALL)
    expect(result).toEqual({ score: OVERALL, gamesPlayed: 0, signal: 'overall' })
  })
})
