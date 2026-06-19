# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

**LoL Best Picker** — an Electron desktop app that, during League of Legends champion
select, recommends the single best pick **from the user's own role-tagged champion pool**,
ranked by live win rate vs. the revealed enemies, degrading gracefully to a clearly-marked
cached/stale recommendation when live data is unavailable.

Stack: Electron + electron-vite, Vue 3 (Composition API) + Vuetify renderer, `better-sqlite3`
storage, Vitest tests. Feature work is driven by **Spec Kit** (`specs/`, `.specify/`).

## Architecture

```
src/
├── shared/           # types + IPC channel constants (no logic)
├── recommendation/   # PURE engine: filter → score → rank → tie-break → freshness (NO electron/vue imports)
├── main/             # Electron main: SQLite + repositories, LCU adapter, lolalytics stats/synergy providers, IPC
├── preload/          # contextBridge — typed, whitelisted `window.api`
└── renderer/         # Vue 3 + Vuetify (Pool, Champ Select, Bans, Settings views)
```

- Path aliases (`electron.vite.config.ts` + tsconfigs): `@shared`, `@recommendation`, `@main`
  (main); `@renderer`, `@shared` (renderer).
- `src/recommendation/` is the trust core and MUST stay framework-agnostic and unit-testable
  in isolation (Constitution IV).
- All privileged I/O (SQLite, LCU, filesystem) runs in main; the renderer reaches it only
  through the preload bridge (`contextIsolation: true`, `nodeIntegration: false`).
- SQLite schema changes ship a migration in `src/main/db/migrations/` (Constitution III) — never
  silently drop user pool data.

## Commands

```powershell
npm run dev          # electron-vite dev server + Electron window (HMR)
npm test             # Vitest: unit + contract + integration (vitest run)
npm run test:watch   # Vitest watch mode
npm run typecheck    # tsc (node config) + vue-tsc (web config)
npm run build        # typecheck + production bundle to out/
npm run package      # build + electron-builder Windows installer (release/)
```

> ⚠️ **better-sqlite3 ABI gotcha.** It's a native addon. After `npm install` it's built for
> **Node's** ABI (so Vitest runs). Electron uses a different ABI — before `npm run dev` run
> `npm run electron:rebuild`; to run Vitest again afterwards run `npm rebuild better-sqlite3`.

There is **no ESLint/Prettier** configured — don't assume a linter/formatter exists. The
`typecheck` script is the quality gate. Tests are Vitest only (no Jest).

## Project constitution

`.specify/memory/constitution.md` is binding. Most load-bearing rules:

- **I. Pool-Constrained Recommendations (NON-NEGOTIABLE)** — never recommend a champion outside
  the user's pool; stats only *order* pool members, never introduce new ones.
- **II. Riot API & LCU Compliance (NON-NEGOTIABLE)** — read-only LCU/Riot access; no automating
  in-game actions; no game-file/memory access; keys never logged.
- **III. Local-first** — SQLite is the source of truth; the app stays usable offline with a
  visible freshness indicator; no third-party telemetry.
- **IV. Business-logic isolation** — see `src/recommendation/`.
- **VI. Test-first for recommendation logic** — changes to filtering/scoring/ranking ship with
  unit tests covering: empty pool, no cached matchup, tied scores, hard-counter.
- **VII. Minimal dependencies** — justify any new runtime dep against what Electron/Node/Vue/
  Vuetify already provide.

External stats are scraped from **lolalytics** (`src/main/stats/lolalytics*`) — best-effort and
compliant (the obfuscated internal `a1.lolalytics.com` API is deliberately avoided). Fetch
failures downgrade freshness and fall back to bundled seed data; they never throw away the cache.

**Synergy data requires client-side JS execution** (lolalytics lazy-loads it via its internal
API). `LolalyticsPageRendererProvider` (`src/main/stats/lolalyticsPageRendererProvider.ts`)
renders each pool champion's build page in a hidden `BrowserWindow` and extracts the synergy
table from the rendered DOM (`parseSynergyDom`, a pure, unit-tested function with no Electron
import). BrowserWindow is used instead of Puppeteer because Electron already bundles Chromium —
adding Puppeteer/Playwright would mean a second ~150–300 MB Chromium download for zero capability
gain, so BrowserWindow is the **zero-new-dependency** choice (Constitution VII / FR-013). The
window uses a dedicated session partition (`persist:synergy-render`) specifically to **avoid the
`applyContentSecurityPolicy()` CSP hook** installed on `session.defaultSession` — that hook's
`connect-src 'self'` would block the page's own `fetch()` and the synergy table would never
populate (research.md §3). The `a1.lolalytics.com` endpoint is still never called directly; the
page's own JS calls it when rendered (Constitution II). Synergy freshness is tracked separately
in `app_settings` (`last_synergy_fetch_*`) and surfaced as a "Synergy: live/estimated" chip.

**Role-based ban recommendations** (spec 007). A second pure engine,
`src/recommendation/banRanker.ts` (`rankBans`, no electron/vue imports, unit-tested
like the pick engine), ranks the **top 3 champions per role per Elo** by a **threat
score** = `(winRate − 50) × pickRate` (not raw win rate — that surfaces low-pick-rate
one-tricks; the threat score weights win-rate edge by how often you'll face the
champion, with a low-presence floor). Pick rate comes from the same lolalytics
tier-list payload (`parseTierlistHtml` now captures `pr`); when absent (bundled
seed) presence is estimated from games-share. Bans are NOT pool-constrained
(Constitution I is N/A for bans). Ban data
is the same lolalytics tier-list win rates the pick pipeline already scrapes, so
`src/main/stats/banStatsProvider.ts` **reuses `LolalyticsStatsProvider`** at a
per-Elo `tier=` (zero new scraper; FR-006). It's cached in the `ban_stats` table
(migration `005_add_ban_stats.sql`), refreshed by `startBanStatsRefresh()` (24h +
on LCU tier change), and served by `BanRecommendationService`
(`src/main/banRecommendationService.ts`) over the `ban:fetch-recommendations` IPC
channel to a dedicated `/bans` view. The player's Elo comes from the LCU
(`getCurrentRankedTier()` → `/lol-ranked/v1/current-ranked-stats`, read-only,
`normalizeLcuTier`), falling back to `DEFAULT_ELO_TIER` ('emerald') when unranked
(FR-008/FR-009). Ban freshness is tracked separately in `app_settings`
(`last_ban_stats_fetch_*`) via the shared `deriveFreshness()`. Dev notes:
[docs/ban-recommendations-dev-guide.md](docs/ban-recommendations-dev-guide.md).

**Installer / user-level config** (spec 005). `src/main/installer/` is another
**Electron-free, unit-tested** module (like `src/recommendation/`): `paths.ts`,
`storage.ts` (`.env.local` parse/serialize), `config.ts` (env-merge precedence +
validation), `logger.ts`, and `index.ts`'s `initializeInstallerConfig()`. At
startup `src/main/index.ts` calls it, then `app.setPath('userData', dataDir)` so
**all user data consolidates under `%LOCALAPPDATA%\LolBestPicker`** (DB, `.env.local`,
`install.log`) — survives upgrade/repair, no admin needed. Precedence:
**`.env.local` app overrides > system env > defaults** (FR-005). Packaging uses
electron-builder's NSIS via `electron-builder.yml` + the auto-detected
`build/installer.nsh` (custom env-config wizard page, `/S` silent `/KEY=value`
parsing, uninstall keep/remove-data prompt) — **no hand-written `.nsi`/PowerShell
runners** (that's not how electron-builder works) and **no new dependency**
(Constitution VII). `build/` is git-tracked (it's electron-builder's
buildResources); only `build/Release/` is ignored. Installer *execution* isn't
Vitest-testable — manual QA lives in [docs/installer-testing-guide.md](docs/installer-testing-guide.md).

## Active Feature Plan

<!-- SPECKIT START -->
**Feature**: Role-Based Ban Recommendations
**Branch**: `007-role-based-bans`
**Plan**: [specs/007-role-based-bans/plan.md](specs/007-role-based-bans/plan.md)
**Spec**: [specs/007-role-based-bans/spec.md](specs/007-role-based-bans/spec.md)
<!-- SPECKIT END -->
