import { describe, it, expect } from 'vitest'
import { parseSynergyHtml } from '@main/stats/lolalyticsMatchupProvider'

/**
 * Builds a lolalytics build-page Qwik payload mirroring the *verified* live shape
 * (Ahri/middle dump, research.md §2):
 *
 *  - matchup data lives on a data object keyed by `enemy` (counters) and, when
 *    present, a synergy-style key (`synergy` here);
 *  - each is a lane-keyed object `{top, jungle, …}` whose values are arrays of
 *    `[id, wr, d1, d2, pr, n]` tuples (the `enemy_h` column order);
 *  - item builds appear as separate `{id, n, wr}` objects — present on every real
 *    page and a tempting false match for any "find a {wr}+games map" heuristic.
 *
 * `objs` is a flat array; references between entries are base-36 string indices,
 * exactly as the real payload (and `lolalyticsProvider.test.ts`) encode them.
 */
function buildHtml(opts: { withSynergy: boolean }): string {
  const objs: unknown[] = []
  const put = (v: unknown): string => {
    objs.push(v)
    return (objs.length - 1).toString(36)
  }

  // Ally synergy tuples [id, wr, d1, d2, pr, n] — what we WANT extracted (if present).
  const missFortune = put([21, 60.0, 0.5, 0.3, 4.0, 300]) // bottom, healthy sample
  const thresh = put([412, 52.0, 0.2, -0.1, 3.0, 250]) // support
  const leeSin = put([64, 70.0, 1.0, 0.5, 5.0, 40]) // jungle, sample < minGames → dropped
  const garen = put([86, 0, 0, 0, 3.0, 500]) // top, 0% win rate → dropped
  const ahriSelf = put([103, 99.0, 0, 0, 0, 999]) // candidate champion itself → skipped

  const synBottom = put([missFortune])
  const synSupport = put([thresh, ahriSelf])
  const synJungle = put([leeSin])
  const synTop = put([garen])
  const synergyObj = put({ top: synTop, jungle: synJungle, bottom: synBottom, support: synSupport })

  // Counter ("enemy") data — high win rates that must NEVER surface as synergy.
  const enemySyndra = put([134, 95.0, 0, 0, 0, 8000])
  const enemyZed = put([238, 90.0, 0, 0, 0, 7000])
  const enemyMid = put([enemySyndra, enemyZed])
  const enemyObj = put({
    top: enemyMid,
    jungle: enemyMid,
    middle: enemyMid,
    bottom: enemyMid,
    support: enemyMid
  })

  // Item build stats: {id, n, wr} keyed by *item* ids (≥ 1000), in an id-keyed map
  // and an array — the shape the old "densest {wr}+games map" heuristic latched onto.
  const rabadon = put({ id: 3089, n: 5000, wr: 58.0 })
  const zhonya = put({ id: 3157, n: 4200, wr: 56.0 })
  put({ '3089': rabadon, '3157': zhonya }) // item-id → item-stat map (must be ignored)
  put([rabadon, zhonya]) // item array (must be ignored)

  const data: Record<string, string> = { enemy: enemyObj, header: put({ cid: 103 }) }
  if (opts.withSynergy) data.synergy = synergyObj
  put(data)

  return `<html><body><script type="qwik/json">${JSON.stringify({ objs })}</script></body></html>`
}

const idToKey = new Map<number, string>([
  [21, 'MissFortune'],
  [412, 'Thresh'],
  [64, 'LeeSin'],
  [86, 'Garen'],
  [103, 'Ahri'],
  [134, 'Syndra'],
  [238, 'Zed'],
  [3089, 'ShouldNeverAppear'], // item id mapped on purpose: proves items aren't read
  [3157, 'ShouldNeverAppear']
])

describe('lolalytics build-page synergy parsing (Qwik payload decode)', () => {
  it('returns [] when the page has only counters/items and no synergy section', () => {
    // This is the real, current lolalytics build page: counters + items, no synergy.
    const rows = parseSynergyHtml(buildHtml({ withSynergy: false }), 'Ahri', 'MIDDLE', '16.12', idToKey, 100)
    expect(rows).toEqual([])
  })

  it('never emits counter ("enemy") or item win-rates as synergy', () => {
    // Even with a synergy section present, the high-WR enemy/item rows must not leak.
    const rows = parseSynergyHtml(buildHtml({ withSynergy: true }), 'Ahri', 'MIDDLE', '16.12', idToKey, 100)
    const keys = rows.map((r) => r.allyChampionKey)
    expect(keys).not.toContain('Syndra') // enemy counter (95%)
    expect(keys).not.toContain('Zed') // enemy counter (90%)
    expect(keys).not.toContain('ShouldNeverAppear') // item stats (58/56%)
  })

  it('parses the verified tuple shape into ally synergy rows when present', () => {
    const rows = parseSynergyHtml(buildHtml({ withSynergy: true }), 'Ahri', 'MIDDLE', '16.12', idToKey, 100)

    const mf = rows.find((r) => r.allyChampionKey === 'MissFortune')
    expect(mf).toMatchObject({
      championKey: 'Ahri',
      role: 'MIDDLE',
      allyChampionKey: 'MissFortune',
      winRate: 60.0,
      gamesPlayed: 300,
      patch: '16.12'
    })
    expect(rows.find((r) => r.allyChampionKey === 'Thresh')?.winRate).toBe(52.0)
  })

  it('drops low-sample (< minGames), zero-win-rate, and self rows', () => {
    const rows = parseSynergyHtml(buildHtml({ withSynergy: true }), 'Ahri', 'MIDDLE', '16.12', idToKey, 100)
    const keys = rows.map((r) => r.allyChampionKey)
    expect(keys).toContain('MissFortune') // 300 games
    expect(keys).toContain('Thresh') // 250 games
    expect(keys).not.toContain('LeeSin') // only 40 games
    expect(keys).not.toContain('Garen') // 0% win rate
    expect(keys).not.toContain('Ahri') // the candidate champion itself
  })

  it('returns [] when the Qwik payload is missing (page layout changed)', () => {
    expect(parseSynergyHtml('<html><body>no payload</body></html>', 'Ahri', 'MIDDLE', '16.12', idToKey, 100)).toEqual(
      []
    )
  })
})
