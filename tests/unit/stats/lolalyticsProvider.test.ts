import { describe, it, expect } from 'vitest'
import { parseTierlistHtml } from '@main/stats/lolalyticsStatsProvider'

/**
 * Builds a minimal lolalytics-style Qwik payload. `objs` is a flat array; object
 * fields hold base-36 string indices back into it. We lay out four champions'
 * scalars + stat objects, then a champion-id → stat-object container, exactly
 * mirroring the real page shape decoded in the provider.
 */
function fixtureHtml(): string {
  const b36 = (n: number): string => n.toString(36)
  const objs: unknown[] = [
    53.5, // 0  Amumu wr
    1000, // 1  Amumu games
    5.0, // 2  Amumu pr
    { wr: b36(0), games: b36(1), pr: b36(2) }, // 3  Amumu stat
    48.2, // 4  Lee Sin wr
    2000, // 5  Lee Sin games
    3.0, // 6  Lee Sin pr
    { wr: b36(4), games: b36(5), pr: b36(6) }, // 7  Lee Sin stat
    55.0, // 8  Xin Zhao wr
    40, // 9   Xin Zhao games (below minGames → dropped)
    1.0, // 10 Xin Zhao pr
    { wr: b36(8), games: b36(9), pr: b36(10) }, // 11 Xin Zhao stat
    0, // 12  Master Yi wr (zero → dropped)
    5000, // 13 Master Yi games
    2.0, // 14 Master Yi pr
    { wr: b36(12), games: b36(13), pr: b36(14) }, // 15 Master Yi stat
    { '32': b36(3), '64': b36(7), '5': b36(11), '11': b36(15) } // 16 cid → stat map
  ]
  return `<html><body><script type="qwik/json">${JSON.stringify({ objs })}</script></body></html>`
}

const idToKey = new Map<number, string>([
  [32, 'Amumu'],
  [64, 'LeeSin'],
  [5, 'XinZhao'],
  [11, 'MasterYi']
])

describe('lolalytics tier-list parsing (Qwik payload decode)', () => {
  it('resolves base-36 references to per-champion overall win rates', () => {
    const rows = parseTierlistHtml(fixtureHtml(), 'JUNGLE', '16.12', idToKey, 100)

    const amumu = rows.find((r) => r.championKey === 'Amumu')
    expect(amumu).toMatchObject({
      role: 'JUNGLE',
      opponentChampionKey: null,
      winRate: 53.5,
      gamesPlayed: 1000,
      patch: '16.12'
    })
    expect(rows.find((r) => r.championKey === 'LeeSin')?.winRate).toBe(48.2)
  })

  it('drops low-sample rows (< minGames) and zero/invalid win rates', () => {
    const rows = parseTierlistHtml(fixtureHtml(), 'JUNGLE', '16.12', idToKey, 100)
    const keys = rows.map((r) => r.championKey)
    expect(keys).toContain('Amumu')
    expect(keys).toContain('LeeSin')
    expect(keys).not.toContain('XinZhao') // only 40 games
    expect(keys).not.toContain('MasterYi') // 0% win rate
  })

  it('throws when the Qwik payload is missing (page layout changed)', () => {
    expect(() => parseTierlistHtml('<html><body>no payload</body></html>', 'JUNGLE', '16.12', idToKey, 100)).toThrow(
      /qwik\/json payload not found/
    )
  })
})
