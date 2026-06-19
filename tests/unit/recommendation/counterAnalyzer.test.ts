import { describe, it, expect } from 'vitest'
import {
  assignConfidenceTier,
  calculateThreatScore,
  filterByRole,
  rankCounters,
  type CounterGameInput
} from '@recommendation/counterAnalyzer'
import type { GameResult, Role } from '@shared/types'

let clock = 1_000
/** Build a single game observation; each call advances a synthetic clock so
 *  `lastEncountered`/recency assertions are deterministic. */
function game(
  enemies: string[],
  result: GameResult,
  role: Role = 'MIDDLE',
  timestamp: number = clock++
): CounterGameInput {
  return { enemyChampions: enemies, result, playerRole: role, timestamp }
}

/** N games vs a single opponent with a given win count (rest losses). */
function gamesVs(opponent: string, total: number, wins: number, role: Role = 'MIDDLE'): CounterGameInput[] {
  return Array.from({ length: total }, (_, i) => game([opponent], i < wins ? 'win' : 'loss', role))
}

describe('calculateThreatScore (FR-004)', () => {
  it('is zero at a 50% win rate regardless of sample size', () => {
    expect(calculateThreatScore(50, 10)).toBe(0)
    expect(calculateThreatScore(50, 1)).toBe(0)
  })

  it('rises as win rate falls, saturating the frequency weight at 5 games', () => {
    expect(calculateThreatScore(0, 10)).toBe(50) // (50-0)*1
    expect(calculateThreatScore(20, 5)).toBe(30) // (50-20)*1
    expect(calculateThreatScore(20, 10)).toBe(30) // weight capped at 1.0
  })

  it('discounts thin samples below 5 games (low-sample bias, edge case)', () => {
    expect(calculateThreatScore(0, 1)).toBeCloseTo(10, 5) // (50-0)*0.2
    expect(calculateThreatScore(30, 1)).toBeCloseTo(4, 5) // (50-30)*0.2
    expect(calculateThreatScore(50, 0)).toBe(0) // no games → no weight
  })

  it('goes negative for win rates above 50% (not a threat)', () => {
    expect(calculateThreatScore(100, 10)).toBe(-50)
    expect(calculateThreatScore(60, 5)).toBe(-10)
  })
})

describe('assignConfidenceTier (FR-007 / US4 boundaries)', () => {
  it('labels 1–2 games "Potential"', () => {
    expect(assignConfidenceTier(0)).toBe('Potential')
    expect(assignConfidenceTier(1)).toBe('Potential')
    expect(assignConfidenceTier(2)).toBe('Potential')
  })
  it('labels 3–9 games "Likely"', () => {
    expect(assignConfidenceTier(3)).toBe('Likely')
    expect(assignConfidenceTier(9)).toBe('Likely')
  })
  it('labels 10+ games "Confirmed"', () => {
    expect(assignConfidenceTier(10)).toBe('Confirmed')
    expect(assignConfidenceTier(50)).toBe('Confirmed')
  })
})

describe('filterByRole (FR-006 / US3)', () => {
  it('returns all games when role is null/undefined', () => {
    const games = [...gamesVs('Ahri', 2, 0, 'MIDDLE'), ...gamesVs('Darius', 2, 0, 'TOP')]
    expect(filterByRole(games, null)).toHaveLength(4)
    expect(filterByRole(games, undefined)).toHaveLength(4)
  })

  it('keeps only games played in the requested role', () => {
    const games = [...gamesVs('Ahri', 10, 4, 'MIDDLE'), ...gamesVs('Darius', 10, 4, 'TOP')]
    const mid = filterByRole(games, 'MIDDLE')
    expect(mid).toHaveLength(10)
    expect(mid.every((g) => g.playerRole === 'MIDDLE')).toBe(true)
  })
})

describe('rankCounters (FR-003/FR-005, Constitution VI)', () => {
  it('returns an empty list for empty input (edge case / FR-009)', () => {
    expect(rankCounters([])).toEqual([])
  })

  it('ranks by threat score, surfacing frequent losses over rare ones (T022/SC-002)', () => {
    // Ahri: 10 games, 2 wins → 20% WR, threat (50-20)*1 = 30, Confirmed
    // LeBlanc: 5 games, 1 win → 20% WR, threat 30, Likely (ties Ahri on threat)
    // Zed: 1 game, 0 wins → 0% WR, threat (50-0)*0.2 = 10, Potential
    const games = [...gamesVs('Ahri', 10, 2), ...gamesVs('LeBlanc', 5, 1), ...gamesVs('Zed', 1, 0)]
    const out = rankCounters(games)

    expect(out.map((c) => c.opponentChampion)).toEqual(['Ahri', 'LeBlanc', 'Zed'])
    // Tie on threat (30 each) broken by games played: Ahri (10) before LeBlanc (5).
    expect(out[0].threatScore).toBe(30)
    expect(out[1].threatScore).toBe(30)
    expect(out[2].threatScore).toBe(10)
    expect(out.map((c) => c.confidenceTier)).toEqual(['Confirmed', 'Likely', 'Potential'])
  })

  it('ranks 20% in 10 games above a higher win rate in 1 game (SC-002 explicit)', () => {
    // Ahri: 20% over 10 games → threat 30. Fizz: a single loss (0%/1g) → threat 10,
    // the strongest a 1-game sample can score, yet still well below frequent Ahri.
    const out = rankCounters([...gamesVs('Ahri', 10, 2), ...gamesVs('Fizz', 1, 0)])
    expect(out[0].opponentChampion).toBe('Ahri')
    expect(out[0].threatScore).toBeGreaterThan(out[1].threatScore)
  })

  it('computes win rate as wins / gamesPlayed × 100', () => {
    const out = rankCounters(gamesVs('Ahri', 4, 1)) // 1 win of 4 → 25%
    expect(out[0].gamesPlayed).toBe(4)
    expect(out[0].wins).toBe(1)
    expect(out[0].winRate).toBe(25)
  })

  it('aggregates every enemy across multi-enemy games', () => {
    const games = [
      game(['Ahri', 'Thresh', 'Jinx', 'LeeSin', 'Ornn'], 'loss'),
      game(['Ahri', 'Braum', 'Caitlyn', 'Sejuani', 'Sett'], 'loss')
    ]
    const out = rankCounters(games)
    const ahri = out.find((c) => c.opponentChampion === 'Ahri')
    expect(ahri?.gamesPlayed).toBe(2)
    expect(ahri?.wins).toBe(0)
    // Each other enemy seen once; Ahri (2 games) outranks them on the games tie-break.
    expect(out[0].opponentChampion).toBe('Ahri')
  })

  it('sinks beaten champions (win rate > 50%) below genuine threats', () => {
    const games = [...gamesVs('Ahri', 6, 1), ...gamesVs('Garen', 6, 5)] // Ahri ~17%, Garen ~83%
    const out = rankCounters(games)
    expect(out[0].opponentChampion).toBe('Ahri')
    expect(out[1].opponentChampion).toBe('Garen')
    expect(out[1].threatScore).toBeLessThan(0)
  })

  it('breaks ties deterministically: equal threat → more games → champion key asc', () => {
    // All three: 0 wins, but Carry/Brand share games count; key asc decides.
    const games = [...gamesVs('Zed', 1, 0), ...gamesVs('Brand', 1, 0), ...gamesVs('Akali', 1, 0)]
    const out = rankCounters(games)
    // Identical threat (10) and games (1) → alphabetical by key.
    expect(out.map((c) => c.opponentChampion)).toEqual(['Akali', 'Brand', 'Zed'])
  })

  it('records the most recent encounter timestamp', () => {
    const games = [game(['Ahri'], 'loss', 'MIDDLE', 100), game(['Ahri'], 'loss', 'MIDDLE', 500)]
    expect(rankCounters(games)[0].lastEncountered).toBe(500)
  })

  it('caps the result at the default top 20', () => {
    const games = Array.from({ length: 25 }, (_, i) => game([`Champ${i}`], 'loss'))
    expect(rankCounters(games)).toHaveLength(20)
  })

  it('honours an explicit limit', () => {
    const games = Array.from({ length: 25 }, (_, i) => game([`Champ${i}`], 'loss'))
    expect(rankCounters(games, { limit: 3 })).toHaveLength(3)
  })

  it('scopes ranking to a role and recalculates win rate for that role only (US3)', () => {
    // Ahri faced in MID (loss-heavy) and TOP (win-heavy). MID-filtered → MID stats only.
    const games = [...gamesVs('Ahri', 4, 0, 'MIDDLE'), ...gamesVs('Ahri', 4, 4, 'TOP')]
    const mid = rankCounters(games, { role: 'MIDDLE' })
    expect(mid).toHaveLength(1)
    expect(mid[0].playerRole).toBe('MIDDLE')
    expect(mid[0].gamesPlayed).toBe(4)
    expect(mid[0].winRate).toBe(0) // only the MID losses count
  })

  it('returns an empty list when no games match the role filter (US3 AC2)', () => {
    const games = gamesVs('Ahri', 5, 1, 'MIDDLE')
    expect(rankCounters(games, { role: 'TOP' })).toEqual([])
  })

  it('tags counters with null role when no role filter is applied', () => {
    const out = rankCounters(gamesVs('Ahri', 3, 0))
    expect(out[0].playerRole).toBeNull()
  })
})
