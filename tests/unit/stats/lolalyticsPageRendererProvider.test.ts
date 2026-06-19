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

/**
 * Regression fixture for the live DOM captured from lolalytics (the shape the
 * original hand-written fixture missed). The real synergy section is:
 *  - anchored by a `data-type="…_synergy"` tab marker (NOT a loose "Synergy"/"with"
 *    word, which appears in chrome ~90k chars earlier);
 *  - each ally renders as THREE portrait chunks — a "+" page-champion icon, a prose
 *    tooltip ("X wins NN.NN% … with Y …"), and the numeric row
 *    ("53.07 0.58 -0.54 4.72 5,476") — where win rate is the first number and games
 *    the last whole-number token (deltas carry decimals, games do not, and there's
 *    no `%` on the numeric row);
 *  - followed by a Counters section whose rows must never surface as synergy.
 */
function buildRealHtml(): string {
  const img = (slug: string): string =>
    `<img srcset="https://cdn5.lolalytics.com/champx46/${slug}.webp 35w, https://cdn5.lolalytics.com/champx92/${slug}.webp 70w" src="https://cdn5.lolalytics.com/champx46/${slug}.webp" alt="${slug}">`
  return `<html><body>
    <div data-type="common_synergy">Common Teammates</div>
    <div data-type="good_synergy">Good Synergy</div>
    <div class="rows">
      <div>${img('ashe')}<span>+</span></div>
      <div>${img('garen')}<span>Garen The Might of Demacia Ashe wins 53.07% of the time with Garen which is 0.58% more than expected</span></div>
      <div>${img('garen')}<span>53.07 0.58 -0.54 4.72 5,476</span></div>
      <div>${img('malphite')}<span>52.88 0.51 -0.49 3.64 4,219</span></div>
      <div>${img('leesin')}<span>51.00 0.10 -0.10 1.00 42</span></div>
    </div>
    <div data-section="counters"><h3>Counters</h3>
      <div>${img('syndra')}<span>95.00 9.00 -8.00 7.00 9,000</span></div>
    </div>
  </body></html>`
}

const realSlugToKey = new Map<string, string>([
  ['ashe', 'Ashe'],
  ['garen', 'Garen'],
  ['malphite', 'Malphite'],
  ['leesin', 'LeeSin'],
  ['syndra', 'Syndra']
])

describe('parseSynergyDom — live lolalytics DOM shape', () => {
  const rows = parseSynergyDom(buildRealHtml(), realSlugToKey, 'Ashe', 'BOTTOM', '16.12', 100)

  it('reads win rate (first number) and games (last whole number) from the numeric row', () => {
    expect(rows.find((r) => r.allyChampionKey === 'Garen')).toMatchObject({
      championKey: 'Ashe',
      role: 'BOTTOM',
      allyChampionKey: 'Garen',
      winRate: 53.07,
      gamesPlayed: 5476,
      source: 'rendered'
    })
    expect(rows.find((r) => r.allyChampionKey === 'Malphite')).toMatchObject({
      winRate: 52.88,
      gamesPlayed: 4219
    })
  })

  it('dedupes the tooltip/“+” chunks so each ally appears once', () => {
    expect(rows.filter((r) => r.allyChampionKey === 'Garen')).toHaveLength(1)
  })

  it('excludes the page champion, sub-minGames allies, and the counters section', () => {
    const allies = rows.map((r) => r.allyChampionKey)
    expect(allies).not.toContain('Ashe') // self ("+") chunk
    expect(allies).not.toContain('LeeSin') // 42 games < 100
    expect(allies).not.toContain('Syndra') // counters section, out of region
  })
})
