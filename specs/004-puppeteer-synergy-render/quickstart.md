# Quickstart: Live Synergy Data via Browser Rendering

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

End-to-end guide for developing, testing, and verifying this feature.

---

## Prerequisites

```powershell
npm install
npm run typecheck    # must pass before touching anything
npm test             # all existing tests must pass
```

> **ABI reminder**: better-sqlite3 uses a native addon. Run `npm run electron:rebuild`
> before `npm run dev`, and `npm rebuild better-sqlite3` before `npm test`.

---

## Development Flow

### 1. Apply the migration

Migration 004 runs automatically on startup. To verify the schema changes in isolation:

```powershell
node -e "
  const db = require('better-sqlite3')(':memory:');
  ['001_initial','002_add_synergy','003_add_language','004_add_synergy_source']
    .forEach(f => db.exec(require('fs').readFileSync('src/main/db/migrations/' + f + '.sql','utf8')));
  console.log(db.prepare('PRAGMA table_info(champion_synergy)').all());
  console.log(db.prepare('PRAGMA table_info(app_settings)').all());
"
```

Expected: `champion_synergy` has a `source` column; `app_settings` has
`last_synergy_fetch_at` and `last_synergy_fetch_status` columns.

---

### 2. Inspect the live rendered synergy DOM (Implementation task T004)

Before writing `parseSynergyDom()`, capture the actual rendered HTML:

```ts
// Temporary debug snippet in lolalyticsPageRendererProvider.ts:
const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
require('fs').writeFileSync('/tmp/lolalytics-rendered.html', html)
```

Open the captured HTML in a browser and locate the synergy table. Document the
selectors in the implementation. The selectors are not known at plan time — see
research.md §4.

---

### 3. Write `parseSynergyDom()` tests first (Principle VI / SC-005)

Create `tests/unit/stats/lolalyticsPageRendererProvider.test.ts` with fixture HTML
**before** implementing the function body:

```ts
import { parseSynergyDom } from '@main/stats/lolalyticsPageRendererProvider'
import { describe, it, expect } from 'vitest'

const slugToKey = new Map([['ahri', 'Ahri'], ['missfortune', 'MissFortune']])

describe('parseSynergyDom', () => {
  it('returns empty array when synergy table is absent', () => {
    expect(parseSynergyDom('<html><body></body></html>', slugToKey, 'Ahri', 'MIDDLE', '16.12', 100))
      .toEqual([])
  })

  it('parses valid rows', () => {
    const html = '/* fixture HTML from step 2 */'
    const rows = parseSynergyDom(html, slugToKey, 'Ahri', 'MIDDLE', '16.12', 100)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toMatchObject({ championKey: 'Ahri', role: 'MIDDLE', source: 'rendered' })
    expect(rows[0].winRate).toBeGreaterThan(0)
    expect(rows[0].winRate).toBeLessThanOrEqual(100)
  })

  it('skips unknown champion slugs', () => {
    // HTML with a row whose slug is not in slugToKey
    // expect that row to be absent from output
  })

  it('skips rows below minGames', () => { /* ... */ })

  it('never includes the page champion itself as an ally', () => { /* ... */ })
})
```

Run tests:
```powershell
npm rebuild better-sqlite3 && npm test
```

---

### 4. Implement `LolalyticsPageRendererProvider`

Implement in `src/main/stats/lolalyticsPageRendererProvider.ts`. Key checkpoints:

```ts
// Verify session isolation: applyContentSecurityPolicy() should NOT interfere
// with the synergy-render partition (no onHeadersReceived hook on it).

// Verify window lifecycle: window.destroy() is called even when errors occur.

// Verify sequential rendering: only one BrowserWindow exists at any time.
```

---

### 5. Start the dev server and trigger a refresh

```powershell
npm run electron:rebuild && npm run dev
```

The Electron window opens. On first launch, a synergy refresh starts automatically
(the 24h cache is cold). Watch the main process console for:

```
lolalytics rendering synergy for Ahri/MIDDLE...
lolalytics rendering synergy for MissFortune/BOTTOM...
```

If rendering succeeds, verify rows in SQLite:

```powershell
node -e "
  const db = require('better-sqlite3')(require('path').join(process.env.APPDATA, 'lol-best-picker/lol-best-picker.db'));
  console.log(db.prepare('SELECT * FROM champion_synergy WHERE source = ? LIMIT 5').all('rendered'));
  console.log(db.prepare('SELECT last_synergy_fetch_at, last_synergy_fetch_status FROM app_settings').get());
"
```

Expected: rows with `source = 'rendered'` and win rates that differ from overall WRs.

---

### 6. Verify the freshness indicator in the UI

After a successful render, open the ChampSelectView in the Electron window. The synergy
source chip should show "Synergy: live" (green). If rendering failed, it shows
"Synergy: estimated" (grey).

To force a failure (test the fallback):
1. Disconnect network.
2. Delete `champion_synergy` rows: `DELETE FROM champion_synergy WHERE source = 'rendered'`.
3. Restart the app — the chip shows "Synergy: estimated".

---

### 7. Simulate champion select with live synergy data

Enter champion select (or use a fixture LCU adapter). With allies locked in and synergy
data present:

```ts
// In DevTools console (renderer):
const rec = await window.api.recommendation.get()
console.log(rec.synergySource)               // 'rendered'
console.log(rec.entries[0].scoreBreakdown.allysSynergyScore)  // non-50 value
// Verify this differs from entries[0].scoreBreakdown.enemyMatchupScore for most champs
```

---

## Key File Locations

| What | File |
|------|------|
| Migration | `src/main/db/migrations/004_add_synergy_source.sql` |
| Page renderer provider | `src/main/stats/lolalyticsPageRendererProvider.ts` |
| Synergy repository | `src/main/db/repositories/synergyRepository.ts` |
| Settings repository | `src/main/db/repositories/settingsRepository.ts` |
| Shared types | `src/shared/types.ts` |
| Stats refresh orchestrator | `src/main/stats/index.ts` |
| Main wiring | `src/main/index.ts` |
| Synergy source indicator | `src/renderer/src/pages/ChampSelectView.vue` |
| Unit tests | `tests/unit/stats/lolalyticsPageRendererProvider.test.ts` |
| Architecture doc | `CLAUDE.md` |

---

## Manual Test Checklist

Required for any PR touching `src/main/stats/lolalyticsPageRendererProvider.ts`:

- [ ] App starts without errors; existing matchup recommendations appear.
- [ ] On first launch (cold synergy cache), rendering begins in the background and
      does not block the UI.
- [ ] After refresh completes, `champion_synergy` rows have `source = 'rendered'`.
- [ ] `last_synergy_fetch_status` in `app_settings` is `'rendered'`.
- [ ] `Recommendation.synergySource` is `'rendered'` in the renderer.
- [ ] The "Synergy: live" chip appears in `ChampSelectView`.
- [ ] With network disconnected: rendering fails, app falls back gracefully (no crash,
      recommendations still appear, chip shows "Synergy: estimated").
- [ ] Pool of 10 champions: full refresh completes in under 60 seconds (SC-002).
- [ ] A pool champion's ally score differs from its overall win rate after rendering
      (SC-001 — confirms real pair data is in use).
