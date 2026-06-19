import { describe, it, expect } from 'vitest'
import { rankBans, type BanStatInput } from '@recommendation/banRanker'
import type { EloTier, Role } from '@shared/types'

const ELO: EloTier = 'emerald'

function stat(
  championId: number,
  role: Role,
  winRate: number,
  overrides: Partial<BanStatInput> = {}
): BanStatInput {
  return {
    championId,
    championName: `Champ ${championId}`,
    iconPath: `champ${championId}.png`,
    role,
    eloTier: ELO,
    winRate,
    pickRate: 10, // a "present" default so tests opt into low-presence explicitly
    gamesPlayed: 1000,
    ...overrides
  }
}

describe('rankBans (threat-score ban engine, Constitution VI)', () => {
  it('returns an empty list for an empty stats input (edge case)', () => {
    expect(rankBans({ stats: [], currentElo: ELO })).toEqual([])
  })

  it('returns an empty list when no rows match the requested Elo (FR-008/FR-009)', () => {
    const stats = [stat(1, 'TOP', 55), stat(2, 'MIDDLE', 53)]
    expect(rankBans({ stats, currentElo: 'challenger' })).toEqual([])
  })

  it('ranks a strong+popular champion above a stronger one-trick (the core fix)', () => {
    const stats = [
      stat(1, 'TOP', 54, { pickRate: 15 }), // score (54-50)*15 = 60
      stat(2, 'TOP', 57, { pickRate: 0.6 }) // score (57-50)*0.6 = 4.2 (above floor)
    ]
    const out = rankBans({ stats, currentElo: ELO })
    expect(out.map((b) => b.championId)).toEqual([1, 2])
    expect(out[0].banScore).toBeCloseTo(60, 5)
    expect(out[1].banScore).toBeCloseTo(4.2, 5)
  })

  it('computes banScore = (winRate − 50) × pickRate', () => {
    const out = rankBans({ stats: [stat(1, 'MIDDLE', 53, { pickRate: 8 })], currentElo: ELO })
    expect(out[0].banScore).toBeCloseTo(24, 5) // (53-50)*8
    expect(out[0].winRate).toBe(53)
    expect(out[0].pickRate).toBe(8)
  })

  it('filters out low-presence noise even when its win rate is higher', () => {
    const stats = [
      stat(1, 'JUNGLE', 52, { pickRate: 12 }), // kept
      stat(2, 'JUNGLE', 62, { pickRate: 0.2 }) // below 0.5% floor → dropped
    ]
    const out = rankBans({ stats, currentElo: ELO })
    expect(out.map((b) => b.championId)).toEqual([1])
  })

  it('never empties a role with the floor — falls back to all candidates', () => {
    const stats = [
      stat(1, 'SUPPORT', 55, { pickRate: 0.3 }),
      stat(2, 'SUPPORT', 51, { pickRate: 0.1 })
    ]
    const out = rankBans({ stats, currentElo: ELO })
    // Both are below the floor, but the role still surfaces them (ranked by score).
    expect(out.map((b) => b.championId)).toEqual([1, 2])
  })

  it('sinks sub-50% champions (negative threat) below positive ones', () => {
    const stats = [
      stat(1, 'BOTTOM', 48, { pickRate: 20 }), // negative score
      stat(2, 'BOTTOM', 51, { pickRate: 4 }) // positive score
    ]
    const out = rankBans({ stats, currentElo: ELO })
    expect(out.map((b) => b.championId)).toEqual([2, 1])
    expect(out[1].banScore).toBeLessThan(0)
  })

  it('estimates presence from games-share when pickRate is null (seed/offline)', () => {
    const stats = [
      stat(1, 'TOP', 55, { pickRate: null, gamesPlayed: 9000 }),
      stat(2, 'TOP', 55, { pickRate: null, gamesPlayed: 1000 })
    ]
    const out = rankBans({ stats, currentElo: ELO })
    // Equal win rate → the more-played champion wins on estimated presence.
    expect(out.map((b) => b.championId)).toEqual([1, 2])
    expect(out[0].pickRate).toBeCloseTo(90, 0) // 9000 / 10000
    expect(out[1].pickRate).toBeCloseTo(10, 0)
  })

  it('breaks ties deterministically: equal score → higher pick rate, then lower id', () => {
    const stats = [
      stat(30, 'MIDDLE', 52, { pickRate: 10 }), // score 20
      stat(10, 'MIDDLE', 54, { pickRate: 5 }), // score 20, lower pick rate
      stat(20, 'MIDDLE', 52, { pickRate: 10 }) // score 20, ties 30 on pick rate
    ]
    const out = rankBans({ stats, currentElo: ELO })
    // All score 20: higher pick rate first (30 & 20 over 10), then lower id (20 < 30).
    expect(out.map((b) => b.championId)).toEqual([20, 30, 10])
  })

  it('returns fewer than 3 when a role has fewer candidates (partial list)', () => {
    const stats = [stat(1, 'SUPPORT', 51), stat(2, 'SUPPORT', 54)]
    const out = rankBans({ stats, currentElo: ELO })
    expect(out).toHaveLength(2)
    expect(out.map((b) => b.rank)).toEqual([1, 2])
  })

  it('caps each role at 3 by default and covers all five roles', () => {
    const roles: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']
    const stats: BanStatInput[] = []
    let id = 1
    for (const role of roles) {
      for (let i = 0; i < 5; i++) stats.push(stat(id++, role, 51 + i, { pickRate: 5 + i }))
    }
    const out = rankBans({ stats, currentElo: ELO })
    expect(out).toHaveLength(15) // 3 per role × 5 roles (SC-002)
    for (const role of roles) {
      const inRole = out.filter((b) => b.role === role)
      expect(inRole).toHaveLength(3)
      // descending threat score within the role
      expect(inRole[0].banScore).toBeGreaterThanOrEqual(inRole[1].banScore)
      expect(inRole[1].banScore).toBeGreaterThanOrEqual(inRole[2].banScore)
      expect(inRole.map((b) => b.rank)).toEqual([1, 2, 3])
    }
  })

  it('honours a custom perRole count', () => {
    const stats = [
      stat(1, 'TOP', 51, { pickRate: 5 }),
      stat(2, 'TOP', 56, { pickRate: 8 }),
      stat(3, 'TOP', 53, { pickRate: 6 })
    ]
    const out = rankBans({ stats, currentElo: ELO, perRole: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].championId).toBe(2) // (56-50)*8 = 48, the highest threat
  })

  it('ignores rows for other Elo tiers', () => {
    const stats = [
      stat(1, 'TOP', 60, { eloTier: 'iron', pickRate: 20 }),
      stat(2, 'TOP', 51, { eloTier: ELO, pickRate: 5 })
    ]
    const out = rankBans({ stats, currentElo: ELO })
    expect(out.map((b) => b.championId)).toEqual([2])
  })
})
