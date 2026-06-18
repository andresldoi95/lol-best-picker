import { describe, it, expect } from 'vitest'
import { parseSynergyDom } from '@main/stats/lolalyticsPageRendererProvider'

/**
 * Fixture modelling the *rendered* lolalytics build-page DOM (research.md §4): a
 * synergy-labelled section whose rows each carry a champion portrait `<img>` (the
 * slug lives in the URL), a win-rate `%`, and a games count; followed by a
 * separate "Counters" section whose high win-rate rows must NEVER surface as
 * synergy. The slug appears both as a path segment (`/champion/ahri/…`) and as a
 * filename (`…/missfortune.webp`) to prove the parser handles both shapes.
 *
 * NOTE: the exact live selectors are TBD until captured against a real rendered
 * page (quickstart §2 / Manual Test Checklist). This fixture encodes the
 * documented structure so the parser contract (SC-005) is locked in regardless.
 */
function buildHtml(opts: { synergy?: boolean } = {}): string {
  const synergySection =
    opts.synergy === false
      ? ''
      : `
    <div data-section="synergy">
      <h3>Synergy</h3>
      <table>
        <tr><td><a href="/lol/missfortune/build/"><img src="https://cdn.lolalytics.com/champx/missfortune.webp" alt="Miss Fortune"></a></td><td>60.0%</td><td>1,234</td></tr>
        <tr><td><img src="https://cdn.lolalytics.com/champ/leesin/64.webp" alt="Lee Sin"></td><td>70.0%</td><td>40</td></tr>
        <tr><td><img src="https://cdn.lolalytics.com/champx/zilean.webp" alt="Zilean"></td><td>55.0%</td><td>500</td></tr>
        <tr><td><img src="https://cdn.lolalytics.com/champ/ahri/103.webp" alt="Ahri"></td><td>80.0%</td><td>900</td></tr>
      </table>
    </div>`
  return `<html><body>
    ${synergySection}
    <div data-section="counters">
      <h3>Counters</h3>
      <table>
        <tr><td><img src="https://cdn.lolalytics.com/champx/syndra.webp" alt="Syndra"></td><td>95.0%</td><td>8,000</td></tr>
      </table>
    </div>
  </body></html>`
}

const slugToKey = new Map<string, string>([
  ['ahri', 'Ahri'],
  ['missfortune', 'MissFortune'],
  ['leesin', 'LeeSin'],
  ['syndra', 'Syndra']
  // 'zilean' deliberately absent → unknown-slug case
])

describe('parseSynergyDom', () => {
  it('returns [] when the synergy table is absent', () => {
    expect(parseSynergyDom('<html><body></body></html>', slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)).toEqual([])
    expect(parseSynergyDom(buildHtml({ synergy: false }), slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)).toEqual([])
  })

  it('parses valid rows and tags them source "rendered" (never leaking counters)', () => {
    const rows = parseSynergyDom(buildHtml(), slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)

    const mf = rows.find((r) => r.allyChampionKey === 'MissFortune')
    expect(mf).toMatchObject({
      championKey: 'Ahri',
      role: 'MIDDLE',
      allyChampionKey: 'MissFortune',
      winRate: 60.0,
      gamesPlayed: 1234,
      patch: '16.12',
      source: 'rendered'
    })
    expect(mf!.winRate).toBeGreaterThan(0)
    expect(mf!.winRate).toBeLessThanOrEqual(100)
    // Counters section must never be emitted as synergy.
    expect(rows.map((r) => r.allyChampionKey)).not.toContain('Syndra')
  })

  it('skips unknown champion slugs', () => {
    const rows = parseSynergyDom(buildHtml(), slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)
    // 'zilean' is not in slugToKey → its row is dropped, others remain.
    expect(rows.map((r) => r.allyChampionKey)).not.toContain('Zilean')
    expect(rows.map((r) => r.allyChampionKey)).toContain('MissFortune')
  })

  it('skips rows below minGames', () => {
    const rows = parseSynergyDom(buildHtml(), slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)
    // Lee Sin has only 40 games (< 100) → dropped.
    expect(rows.map((r) => r.allyChampionKey)).not.toContain('LeeSin')
  })

  it('never includes the page champion itself as an ally', () => {
    const rows = parseSynergyDom(buildHtml(), slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)
    // Ahri appears in its own synergy table (900 games) but must be excluded as self.
    expect(rows.map((r) => r.allyChampionKey)).not.toContain('Ahri')
  })
})
