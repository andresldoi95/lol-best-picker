import { describe, it, expect } from 'vitest'
import {
  computeRecommendation,
  type PoolEntryInput,
  type RecommendationInput,
  type StatRowInput,
  type SynergyRowInput
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

function synergy(
  championId: number,
  role: Role,
  allyChampionId: number,
  winRate: number,
  gamesPlayed: number
): SynergyRowInput {
  return { championId, role, allyChampionId, winRate, gamesPlayed }
}

function input(overrides: Partial<RecommendationInput>): RecommendationInput {
  return {
    poolEntries: [],
    statRows: [],
    synergyRows: [],
    role: 'MIDDLE',
    enemyChampionIds: [],
    allyChampionIds: [],
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

  it('excludes pool champions that are already locked by the enemy', () => {
    const rec = computeRecommendation(
      input({
        role: 'TOP',
        enemyChampionIds: [5, 10], // enemy locked champs 5 and 10
        poolEntries: [poolEntry(1, 'TOP'), poolEntry(5, 'TOP'), poolEntry(10, 'TOP'), poolEntry(15, 'TOP')],
        statRows: [overall(1, 'TOP', 50, 100), overall(5, 'TOP', 55, 100), overall(10, 'TOP', 52, 100), overall(15, 'TOP', 51, 100)]
      })
    )
    // should only include 1 and 15, not 5 or 10 (enemy picks)
    expect(rec.entries.map((e) => e.championId).sort()).toEqual([1, 15])
  })
})

describe('computeRecommendation — composition-aware combined scoring (spec 002, Principle VI)', () => {
  // Fixture 1 — no allies locked in → enemy-only score, identical to spec-001 behavior.
  it('with no allies, scores enemy-only (combined === enemy matchup score)', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        allyChampionIds: [],
        poolEntries: [poolEntry(1, 'MIDDLE')],
        statRows: [matchup(1, 'MIDDLE', 99, 45, 50), overall(1, 'MIDDLE', 52, 800)]
      })
    )
    const entry = rec.entries[0]
    expect(entry.score).toBe(45)
    expect(entry.scoreBasis).toBe('matchup')
    expect(entry.scoreBreakdown.combinedScore).toBe(45)
    expect(entry.scoreBreakdown.activeSignals).toEqual(['enemy-matchup'])
    expect(rec.allyChampionIds).toEqual([])
  })

  // Fixture 2 — allies present but NO synergy data → ally component uses overall WR.
  it('uses overall WR for the ally component when no synergy rows exist', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        allyChampionIds: [21],
        poolEntries: [poolEntry(1, 'MIDDLE')],
        statRows: [matchup(1, 'MIDDLE', 99, 48, 100), overall(1, 'MIDDLE', 54, 500)],
        synergyRows: []
      })
    )
    const entry = rec.entries[0]
    // combined = 0.5 * 48 (enemy matchup) + 0.5 * 54 (ally overall fallback) = 51
    expect(entry.score).toBe(51)
    expect(entry.scoreBasis).toBe('combined')
    expect(entry.scoreBreakdown.enemyMatchupScore).toBe(48)
    expect(entry.scoreBreakdown.allysSynergyScore).toBe(54)
    expect(entry.scoreBreakdown.activeSignals).toEqual(['enemy-matchup', 'overall'])
  })

  // Fixture 3 — single ally with synergy data → combined = 0.5*enemy + 0.5*ally.
  it('combines a single ally synergy 50/50 with the enemy matchup', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        allyChampionIds: [21],
        poolEntries: [poolEntry(1, 'MIDDLE')],
        statRows: [matchup(1, 'MIDDLE', 99, 50, 200), overall(1, 'MIDDLE', 50, 500)],
        synergyRows: [synergy(1, 'MIDDLE', 21, 60, 300)]
      })
    )
    const entry = rec.entries[0]
    // combined = 0.5 * 50 + 0.5 * 60 = 55
    expect(entry.score).toBe(55)
    expect(entry.scoreBasis).toBe('combined')
    expect(entry.scoreBreakdown.enemyMatchupScore).toBe(50)
    expect(entry.scoreBreakdown.allysSynergyScore).toBe(60)
    expect(entry.scoreBreakdown.activeSignals).toEqual(['enemy-matchup', 'ally-synergy'])
    expect(rec.allyChampionIds).toEqual([21])
  })

  // Fixture 4 — multiple allies → pairwise-average synergy, then 50/50 with enemy.
  it('averages synergy across multiple allies before the 50/50 combine', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        allyChampionIds: [21, 22],
        poolEntries: [poolEntry(1, 'MIDDLE')],
        statRows: [matchup(1, 'MIDDLE', 99, 40, 100), overall(1, 'MIDDLE', 50, 500)],
        synergyRows: [synergy(1, 'MIDDLE', 21, 60, 300), synergy(1, 'MIDDLE', 22, 70, 200)]
      })
    )
    const entry = rec.entries[0]
    // ally avg = (60 + 70) / 2 = 65; combined = 0.5 * 40 + 0.5 * 65 = 52.5
    expect(entry.scoreBreakdown.allysSynergyScore).toBeCloseTo(65)
    expect(entry.score).toBeCloseTo(52.5)
  })

  // Fixture 5 — a pool champion already locked in by an ally is excluded (FR-010).
  it('excludes pool champions that are already locked by an ally', () => {
    const rec = computeRecommendation(
      input({
        role: 'TOP',
        enemyChampionIds: [],
        allyChampionIds: [5], // ally already locked champ 5
        poolEntries: [poolEntry(1, 'TOP'), poolEntry(5, 'TOP'), poolEntry(15, 'TOP')],
        statRows: [overall(1, 'TOP', 50, 100), overall(5, 'TOP', 55, 100), overall(15, 'TOP', 51, 100)]
      })
    )
    expect(rec.entries.map((e) => e.championId).sort()).toEqual([1, 15])
    expect(rec.entries.some((e) => e.championId === 5)).toBe(false)
  })

  // Fixture 6 — conflicting signals: strong vs enemy but weak synergy loses to the
  // reverse, because the combined 50/50 score drives ranking (not enemy-only).
  it('ranks by the combined score when enemy and ally signals conflict', () => {
    const rec = computeRecommendation(
      input({
        role: 'MIDDLE',
        enemyChampionIds: [99],
        allyChampionIds: [21],
        poolEntries: [poolEntry(1, 'MIDDLE'), poolEntry(2, 'MIDDLE')],
        statRows: [
          matchup(1, 'MIDDLE', 99, 70, 100), overall(1, 'MIDDLE', 60, 500), // champ1: strong vs enemy
          matchup(2, 'MIDDLE', 99, 45, 100), overall(2, 'MIDDLE', 50, 500) // champ2: weak vs enemy
        ],
        synergyRows: [
          synergy(1, 'MIDDLE', 21, 40, 200), // champ1: poor synergy
          synergy(2, 'MIDDLE', 21, 80, 200) // champ2: great synergy
        ]
      })
    )
    // champ1 combined = 0.5*70 + 0.5*40 = 55; champ2 combined = 0.5*45 + 0.5*80 = 62.5
    expect(rec.entries.map((e) => e.championId)).toEqual([2, 1])
    expect(rec.entries[0].score).toBeCloseTo(62.5)
  })
})
