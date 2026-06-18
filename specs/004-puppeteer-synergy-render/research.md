# Research: Live Synergy Data via Browser Rendering

**Date**: 2026-06-17
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves all technical unknowns for the live synergy rendering feature.
The existing codebase (specs 001–003) was read in full before writing this research.

---

## 1. Why Static HTML Scraping Cannot Yield Synergy Data

**Confirmed (spec 002 research.md §2, verified 2026-06-17)**: The lolalytics build
page at `https://lolalytics.com/lol/{slug}/build/?lane={lane}&tier=emerald` is a
Qwik-rendered SSR page. The server-rendered Qwik JSON payload (`<script
type="qwik/json">`) contains the champion's **counter** matchups (the `enemy` key)
but **zero synergy data**. The on-page "Synergy" table is populated client-side via a
`fetch()` call to the internal `https://a1.lolalytics.com/mega/` API — an obfuscated,
ToS-restricted endpoint that this project deliberately avoids (Constitution II,
Principle VII).

`parseSynergyHtml()` in `lolalyticsMatchupProvider.ts` already implements the correct
fallback: it targets synergy sections by label and returns `[]` when none is found.
The engine falls back to the champion's overall win rate for the ally component. This
is the current de-facto behavior — no regression is introduced by that code path.

**Conclusion**: obtaining live synergy data requires executing the page's JavaScript
so the client-side API call runs and the synergy table populates. A headless browser
(full JS runtime) is necessary; plain HTTP + HTML parsing is insufficient.

---

## 2. Rendering Approach: Electron BrowserWindow vs. Puppeteer

**Decision**: Use Electron's native `BrowserWindow` API with `show: false` instead of
Puppeteer.

**Rationale**:
- Electron already bundles Chromium (the same browser engine Puppeteer wraps). Adding
  Puppeteer with its own bundled Chromium download would nearly double the packaged app
  size (~150–300 MB) with zero capability gain — Constitution VII explicitly prohibits
  this: "Every additional dependency compounds install size, attack surface, and update
  burden."
- `puppeteer-core` (which connects to an existing browser) avoids the size cost but
  still adds a dependency and requires wiring CDP (Chrome DevTools Protocol) against
  Electron's renderer — complex and fragile compared to first-party BrowserWindow APIs.
- `BrowserWindow` is Electron's stable, first-party, fully documented API.
  `webContents.executeJavaScript()` provides the DOM access needed to extract the
  synergy table after it renders. No additional npm packages needed.

**Alternatives considered**:
- *jsdom*: Does not execute JavaScript (no XHR/fetch), so the synergy table never
  populates. Rejected.
- *Playwright*: Like Puppeteer, bundles its own browser binaries. Same size objection.
  Rejected.
- *Calling a1.lolalytics.com directly*: ToS-restricted internal API — explicitly
  forbidden by Constitution II. Rejected.

**Trade-offs accepted**:
- BrowserWindow management is more verbose than Puppeteer's Page API, but this is a
  one-time implementation cost.
- A hidden BrowserWindow creates a full Electron renderer process. For a pool-scoped
  refresh (≤10 champions, sequential), memory use is transient and acceptable. The
  window is created once per refresh cycle and destroyed on completion.

---

## 3. Session Isolation: Avoiding CSP Hook Interference

**Problem**: `applyContentSecurityPolicy()` in `src/main/index.ts` installs a
`session.defaultSession.webRequest.onHeadersReceived` hook that injects a restrictive
CSP header into every HTTP response. If the hidden BrowserWindow uses the default
session, this CSP is injected into lolalytics page responses, blocking the page's
internal `fetch()` calls (only `connect-src 'self' ws:` is allowed) — the synergy
table never populates.

**Decision**: Create the hidden BrowserWindow with a dedicated session partition
(`persist:synergy-render`). This session has no CSP hook and is isolated from the
main app's renderer session.

```typescript
const win = new BrowserWindow({
  show: false,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    session: session.fromPartition('persist:synergy-render')
  }
})
```

No user data passes through this session; cookies/localStorage in the synergy session
do not affect the main app window.

---

## 4. Synergy Table DOM Structure (TBD — Verify During Implementation)

**What is known**: After the page fully renders, the synergy table is present in the
DOM somewhere within the page's content. The table shows: champion portrait, champion
name, win rate (%), and games played count.

**What must be verified during implementation**: The exact CSS selectors and HTML
structure of the rendered synergy table. The implementation task for
`parseSynergyDom()` (T004 in tasks.md) must begin by:

1. Running the BrowserWindow renderer against a real lolalytics build page in a
   development Electron session.
2. Using `webContents.executeJavaScript('document.documentElement.outerHTML')` to
   capture the rendered HTML.
3. Identifying the synergy table: search for a container with text "Synergy", "With",
   "Teammate", or similar label (matching `SYNERGY_KEY` regex from
   `lolalyticsMatchupProvider.ts`).
4. Extracting champion identifiers (image URLs containing the slug, or `data-*`
   attributes with champion IDs) and win rates.

**Expected extraction approach** (to be confirmed): lolalytics tables typically use
champion portrait `<img>` elements whose `src` URL embeds the lowercase champion slug
(e.g., `.../champion/ahri/50.webp`). The slug can be capitalized and looked up via a
`lowercaseNameToKey` map built from `ChampionsRepository.list()`. This avoids
depending on display names (which can differ by locale).

**Extraction script shape** (specific selectors TBD):
```javascript
// Injected via webContents.executeJavaScript()
;(() => {
  const rows = document.querySelectorAll('/* TBD after DOM inspection */')
  return Array.from(rows).map(row => ({
    slug: row.querySelector('img')?.src?.match(/champion\/(\w+)\//)?.[1] ?? '',
    winRate: parseFloat(row.querySelector('/* win-rate cell */')?.textContent ?? '0'),
    games: parseInt(row.querySelector('/* games cell */')?.textContent?.replace(/,/g,'') ?? '0', 10)
  })).filter(r => r.slug && r.winRate > 0 && r.winRate <= 100)
})()
```

The pure `parseSynergyDom(html: string, nameOrSlugToKey: Map<string, string>):
NormalizedSynergyRow[]` function accepts rendered HTML and returns typed rows,
keeping it unit-testable with fixture HTML (SC-005, Principle IV-adjacent).

---

## 5. Waiting for the Synergy Table

**Decision**: Poll with `webContents.executeJavaScript()` every 250ms, checking whether
at least one synergy table row is present in the DOM. Stop at the earlier of: (a) one
or more rows found, or (b) 5000ms elapsed (timeout).

```typescript
const POLL_INTERVAL_MS = 250
const RENDER_TIMEOUT_MS = 5000

// Polling predicate injected each interval:
'document.querySelectorAll("/* synergy row selector */").length > 0'
```

On timeout: log a warning, return `[]` for that champion, continue to the next target
(FR-011). The existing synergy fallback (overall WR) handles the gap.

**Alternative considered**: `webContents.once('did-finish-load', ...)` is insufficient
because the page load event fires before client-side data fetches complete. Polling on
DOM element presence is the correct approach.

---

## 6. Provider Architecture

**Decision**: `LolalyticsPageRendererProvider` wraps `LolalyticsMatchupProvider` via
composition (not inheritance). It:
1. Delegates `fetchBuildStats()` to the wrapped `LolalyticsMatchupProvider` to obtain
   **enemy matchup data** (the static Qwik JSON path that already works).
2. Separately renders each target's page in the hidden BrowserWindow to obtain
   **synergy data**.
3. Returns `BuildStats` merging both.

This is a **drop-in replacement** for `LolalyticsMatchupProvider` in `main/index.ts`.
No changes to `startStatsRefresh()` signature or `StatsRefreshDeps` types are needed.

**Sequential rendering**: Targets are rendered one at a time (not in parallel) to
avoid multiple hidden BrowserWindows, excessive memory use, and potential rate-limiting
by lolalytics.

**Window lifecycle**: One hidden BrowserWindow is created at the start of
`fetchBuildStats()` and destroyed after all targets are processed (win.destroy()).
Error during creation → log and return empty synergy (no crash).

---

## 7. Schema Changes: Migration 004

**New migration**: `src/main/db/migrations/004_add_synergy_source.sql`

Three changes:

```sql
-- 1. Track how each synergy row was obtained
ALTER TABLE champion_synergy
  ADD COLUMN source TEXT NOT NULL DEFAULT 'static';
-- 'static' = from Qwik JSON (current, always returns []);
-- 'rendered' = from BrowserWindow DOM extraction (this feature)

-- 2. Track the last time synergy rendering was attempted
ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_at TEXT;       -- ISO-8601, NULL = never attempted

-- 3. Track the outcome of the last synergy rendering attempt
ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_status TEXT;   -- 'rendered' | 'error'
```

All three are additive-only (`ALTER TABLE ADD COLUMN`) — non-destructive (Constitution
III). Existing rows get sensible defaults (`source = 'static'`, settings `NULL`).

---

## 8. `NormalizedSynergyRow` and Repository Changes

**`NormalizedSynergyRow`** (in `synergyProvider.ts`): Add optional `source` field:
```typescript
source?: 'rendered' | 'static'
```
Optional so existing callers (including `LolalyticsMatchupProvider`) need no changes.
`LolalyticsPageRendererProvider` sets `source: 'rendered'` on every row it produces.

**`SynergyRepository.upsertSynergy()`**: Accept and persist `source`. The INSERT
statement gains a `@source` binding; rows from the renderer write `'rendered'`, rows
from the static provider write `'static'` (or are absent).

**`SynergyRepository`**: Add two new methods:
```typescript
markSynergyFetchRendered(): void   // sets last_synergy_fetch_at = now, status = 'rendered'
markSynergyFetchError(): void      // sets last_synergy_fetch_at = now, status = 'error'
```
These parallel `StatsRepository.markFetchError()`.

---

## 9. Freshness Signal in AppSettings and Recommendation

**`AppSettings`** (in `shared/types.ts`): Add:
```typescript
lastSynergyFetchAt: string | null
lastSynergyFetchStatus: 'rendered' | 'error' | null
```

**`SettingsRepository.get()`**: Return these new fields from `app_settings`.

**`Recommendation`**: Add:
```typescript
synergySource: 'rendered' | 'fallback'
```
Where `'rendered'` = last synergy fetch succeeded, `'fallback'` = no successful render
(either never attempted or last attempt errored). This is computed by
`RecommendationService` from `AppSettings.lastSynergyFetchStatus`.

**UI**: A second small indicator in `ChampSelectView.vue` shows:
- "Synergy: live" (mdi-check-circle, green) when `synergySource === 'rendered'`
- "Synergy: estimated" (mdi-information-outline, grey) when `synergySource === 'fallback'`

The `FreshnessIndicator.vue` component is not reused for synergy (it is tied to the
`Freshness = 'live' | 'cached' | 'stale'` type); a simpler inline chip suffices.

---

## 10. `startStatsRefresh` Integration

**No changes to `startStatsRefresh()` or `StatsRefreshDeps`**. The existing
`refreshBuildStats()` helper already calls `provider.fetchBuildStats(targets)` and
persists matchups and synergy separately. Replacing the `synergyProvider` in
`main/index.ts` with `LolalyticsPageRendererProvider` is sufficient.

After `refreshBuildStats()` succeeds with non-empty synergy rows:
→ `synergy.upsertSynergy(rows)` is called (existing path)
→ `synergy.markSynergyFetchRendered()` is called (new — records success in settings)

After `refreshBuildStats()` fails for synergy:
→ `synergy.markSynergyFetchError()` is called (new — records failure)

These two calls are added in `refreshBuildStats()` in `stats/index.ts`.

---

## 11. Unit Test Strategy (SC-005)

**Requirement**: A unit test that feeds sample HTML to the DOM parser and validates
the output is `NormalizedSynergyRow[]`.

**Approach**:
1. `parseSynergyDom(html, slugToKey, championKey, role, patch)` is exported as a pure
   function from `lolalyticsPageRendererProvider.ts`.
2. During implementation, capture a real rendered page's HTML (or hand-craft a minimal
   fixture matching the DOM structure discovered in §4).
3. Write `tests/unit/stats/lolalyticsPageRendererProvider.test.ts` covering:
   - Valid rows → `NormalizedSynergyRow[]` with correct champions and win rates
   - Missing synergy table → `[]`
   - Unknown champion slug in a row → that row is skipped, others returned
   - Win rate out of range → clamped / skipped
4. Electron is NOT imported by `parseSynergyDom` — the test runs in Vitest without
   any Electron mocking.

**`LolalyticsPageRendererProvider` class itself** (BrowserWindow integration):
Integration-tested via the manual checklist in `quickstart.md`. The class is not unit-
tested in isolation (BrowserWindow requires Electron process; mocking it adds no value
beyond what the pure function tests already cover).

---

## 12. CLAUDE.md Update

**Requirement (spec FR-013)**: Document the dependency decision in the architecture
reference. The existing note about lolalytics scraping in `main/index.ts` and the
research docs justifies the approach; `CLAUDE.md` must add a note to its Architecture
section explaining:

> Synergy data requires client-side JS execution (lolalytics lazy-loads it via an
> internal API). A hidden `BrowserWindow` (Electron's built-in Chromium) is used
> instead of Puppeteer to avoid a duplicate Chromium download — this was the
> explicit reason for choosing BrowserWindow over the puppeteer package.

---

## 13. Constitution Alignment

| Principle | Status |
|---|---|
| I. Pool-Constrained | **PASS** — rendering only runs for pool champions (`getSynergyTargets()` unchanged). Synergy data orders pool members; no new champions introduced. |
| II. Riot/LCU Compliance | **PASS** — no LCU interaction. Anonymous GET requests to lolalytics (same as current). The `a1.lolalytics.com` internal API is explicitly not called. |
| III. Local-First | **PASS** — synergy rows stored in SQLite. Fall back to overall WR when rendering fails. Freshness indicator shows data age. |
| IV. Business Logic Isolation | **PASS** — `parseSynergyDom()` is a pure function; recommendation engine untouched. |
| V. Real-Time Responsiveness | **PASS** — rendering only happens in the background refresh cycle, never during champion select polling. |
| VI. Test-First | **PASS** — `parseSynergyDom()` tests written before the provider class is implemented (SC-005). |
| VII. Minimal Dependencies | **PASS** — zero new npm packages. BrowserWindow is already part of Electron. |

---

## Summary of Resolved Technical Context

| Item | Resolution |
|---|---|
| Why synergy needs rendering | Lolalytics lazy-loads synergy client-side; static HTML never contains it (verified spec 002) |
| Rendering mechanism | Electron hidden `BrowserWindow` — reuses bundled Chromium, no new dependencies |
| Session isolation | `session.fromPartition('persist:synergy-render')` — avoids CSP hook |
| DOM extraction | `webContents.executeJavaScript()` after polling for table presence (max 5s) |
| Synergy DOM selectors | TBD — verified during implementation by inspecting live rendered HTML |
| Provider architecture | `LolalyticsPageRendererProvider` wraps `LolalyticsMatchupProvider` via composition |
| Enemy matchup path | Unchanged — static Qwik JSON parse (`LolalyticsMatchupProvider`) |
| Migration | `004_add_synergy_source.sql` — `source` column on `champion_synergy`, freshness cols on `app_settings` |
| Freshness in UI | `Recommendation.synergySource: 'rendered' \| 'fallback'` → inline chip in ChampSelectView |
| Unit test | `parseSynergyDom()` pure function tested with fixture HTML, no Electron mock needed |
| `startStatsRefresh` | No signature change; `LolalyticsPageRendererProvider` is a drop-in replacement |
