import { describe, it, expect } from 'vitest'
import type { NormalizedSynergyRow } from '@main/stats/synergyProvider'
import { FixtureSynergyProvider } from './fixtures/fixtureSynergyProvider'

const PATCH = '16.12'

function row(
  championKey: string,
  role: NormalizedSynergyRow['role'],
  allyChampionKey: string,
  winRate: number,
  gamesPlayed: number
): NormalizedSynergyRow {
  return { championKey, role, allyChampionKey, winRate, gamesPlayed, patch: PATCH }
}

describe('SynergyProvider contract (FixtureSynergyProvider)', () => {
  const rows = [
    row('Ahri', 'MIDDLE', 'MissFortune', 55, 300),
    row('Ahri', 'MIDDLE', 'Thresh', 52, 250),
    row('Zed', 'MIDDLE', 'MissFortune', 49, 200),
    row('Lulu', 'SUPPORT', 'Jinx', 58, 400)
  ]

  it('returns only the rows matching the requested (championKey, role) targets', async () => {
    const provider = new FixtureSynergyProvider(rows)
    const result = await provider.fetchSynergyStats([{ championKey: 'Ahri', role: 'MIDDLE' }])
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.championKey === 'Ahri' && r.role === 'MIDDLE')).toBe(true)
  })

  it('returns an empty array when no target matches', async () => {
    const provider = new FixtureSynergyProvider(rows)
    expect(await provider.fetchSynergyStats([{ championKey: 'Yasuo', role: 'TOP' }])).toEqual([])
    // role mismatch must not match either (Ahri is MIDDLE, not TOP)
    expect(await provider.fetchSynergyStats([{ championKey: 'Ahri', role: 'TOP' }])).toEqual([])
  })

  it('returns partial results when only some targets match', async () => {
    const provider = new FixtureSynergyProvider(rows)
    const result = await provider.fetchSynergyStats([
      { championKey: 'Lulu', role: 'SUPPORT' },
      { championKey: 'Yasuo', role: 'TOP' } // no rows
    ])
    expect(result).toHaveLength(1)
    expect(result[0].championKey).toBe('Lulu')
  })
})
