import { describe, it, expect } from 'vitest'
import {
  computeRecommendation,
  type PoolEntryInput,
  type RecommendationInput,
  type StatRowInput
} from '@recommendation/engine'
import type { Role } from '@shared/types'

const NOW = '2026-06-14T12:00:00.000Z'

function poolEntry(championId: number, role: Role, isActive = true): PoolEntryInput {
  return {
    championId,
    championKey: `Champ${championId}`,
    championName: `Champ ${championId}`,
    iconPath: `champ${championId}.png`,
    role,
    isActive
  }
}

function overall(championId: number, role: Role, winRate: number, gamesPlayed: number): StatRowInput {
  return { championId, role, opponentChampionId: null, winRate, gamesPlayed }
}

function matchup(
  championId: number,
  role: Role,
  opponentChampionId: number,
  winRate: number,
  gamesPlayed: number
): StatRowInput {
  return { championId, role, opponentChampionId, winRate, gamesPlayed }
}

function input(overrides: Partial<RecommendationInput>): RecommendationInput {
  return {
    poolEntries: [],
    statRows: [],
    role: 'MIDDLE',
    enemyChampionIds: [],
    statsAsOfPatch: '14.12',
    freshness: {
      lastFetchAt: NOW,
      lastFetchStatus: 'success',
      thresholdHours: 24,
      now: NOW
    },
    ...overrides
  }
}

describe('computeRecommendation — required fixtures (Principle VI)', () => {
  // Fixture 1 — empty role-filtered pool → entries: []
  it('returns an empty list when no pool champion matches the role', () => {
    const rec = computeRecommendation(
      input({ role: 'TOP', poolEntries: [poolEntry(1, 'MIDDLE'), poolEntry(2, 'BOTTOM')] })
    )
    expect(rec.entries).toEqual([])
    expect(rec.role).toBe('TOP')
  })

  it('returns an empty list when role is null', () => {
    const rec = computeRecommendation(input({ role: null, poolEntries: [poolEntry(1, 'MIDDLE')] }))
    expect(rec.entries).toEqual([])
    expect(rec.role).toBeNull()
  })

  // Fixture 2 — pool champion with zero statRows → still appears, lowest score, no throw
  it('includes a champion with no stat rows at all, scored 0, without throwing', () => {
    let rec!: ReturnType<typeof computeRecommendation>
    expect(() => {
      rec = computeRecommendation(
        input({ role: 'MIDDLE', poolEntries: [poolEntry(7, 'MIDDLE')], statRows: [] })
      )
    }).not.toThrow()
    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]).toMatchObject({ championId: 7, score: 0, scoreBasis: 'overall' })
  })

  it('ranks a champion with stats above one with none', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        poolEntries: [poolEntry(7, 'MIDDLE'), poolEntry(9, 'MIDDLE')],
        statRows: [overall(9, 'MIDDLE', 52, 1000)]
      })
    )
    expect(rec.entries.map((e) => e.championId)).toEqual([9, 7])
  })

  // Fixture 3 — tied scores → deterministic order (higher gamesPlayed, then ascending championId)
  it('breaks tied scores by higher gamesPlayed, then ascending championId', () => {
    const tieByGames = computeRecommendation(
      input({
        role: 'MIDDLE',
        poolEntries: [poolEntry(10, 'MIDDLE'), poolEntry(20, 'MIDDLE')],
        statRows: [overall(10, 'MIDDLE', 50, 100), overall(20, 'MIDDLE', 50, 200)]
      })
    )
    expect(tieByGames.entries.map((e) => e.championId)).toEqual([20, 10])

    const tieByChampionId = computeRecommendation(
      input({
        role: 'MIDDLE',
        poolEntries: [poolEntry(8, 'MIDDLE'), poolEntry(5, 'MIDDLE')],
        statRows: [overall(8, 'MIDDLE', 50, 100), overall(5, 'MIDDLE', 50, 100)]
      })
    )
    expect(tieByChampionId.entries.map((e) => e.championId)).toEqual([5, 8])
  })

  // Fixture 4 — every candidate's matchup winRate < 50 → highest of those shown first
  it('still ranks all-unfavorable candidates, least-unfavorable first', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        poolEntries: [poolEntry(1, 'MIDDLE'), poolEntry(2, 'MIDDLE')],
        statRows: [matchup(1, 'MIDDLE', 99, 45, 50), matchup(2, 'MIDDLE', 99, 48, 50)]
      })
    )
    expect(rec.entries.map((e) => e.championId)).toEqual([2, 1])
    expect(rec.entries.every((e) => e.score < 50)).toBe(true)
    expect(rec.entries[0].scoreBasis).toBe('matchup')
  })

  it('falls back to the overall row when no matchup row exists for a revealed enemy (FR-017)', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        poolEntries: [poolEntry(1, 'MIDDLE')],
        statRows: [overall(1, 'MIDDLE', 53, 800)]
      })
    )
    expect(rec.entries[0]).toMatchObject({ championId: 1, score: 53, scoreBasis: 'overall' })
  })

  // Fixture 5 — freshness derivation matrix
  it('derives freshness: success+within→live, error+within→cached, older→stale', () => {
    const within = NOW
    const old = '2026-06-10T12:00:00.000Z' // 4 days before NOW, threshold 24h

    const live = computeRecommendation(
      input({ freshness: { lastFetchAt: within, lastFetchStatus: 'success', thresholdHours: 24, now: NOW } })
    )
    const cached = computeRecommendation(
      input({ freshness: { lastFetchAt: within, lastFetchStatus: 'error', thresholdHours: 24, now: NOW } })
    )
    const staleByAge = computeRecommendation(
      input({ freshness: { lastFetchAt: old, lastFetchStatus: 'success', thresholdHours: 24, now: NOW } })
    )

    expect(live.freshness).toBe('live')
    expect(cached.freshness).toBe('cached')
    expect(staleByAge.freshness).toBe('stale')
  })

  // Fixture 6 — isActive: false → isFlagged: true, included not excluded
  it('flags an inactive champion but still includes it', () => {
    const rec = computeRecommendation(
      input({
        role: 'TOP',
        poolEntries: [poolEntry(42, 'TOP', false)],
        statRows: [overall(42, 'TOP', 51, 500)]
      })
    )
    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]).toMatchObject({ championId: 42, isFlagged: true })
  })

  // Principle I invariant — never emit a champion outside the pool/role.
  it('never emits an entry whose role differs from the requested role', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        poolEntries: [poolEntry(1, 'MIDDLE'), poolEntry(2, 'TOP'), poolEntry(3, 'MIDDLE')],
        statRows: []
      })
    )
    expect(rec.entries.every((e) => e.role === 'MIDDLE')).toBe(true)
    expect(rec.entries.map((e) => e.championId).sort()).toEqual([1, 3])
  })
})
