# Research: Champion Pool Recommender

**Date**: 2026-06-14
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves all `NEEDS CLARIFICATION` items from the Technical Context
and records the key technical decisions for Phase 0.

---

## 1. Champion/Matchup Win-Rate Data Source

**Decision**: Use u.gg-derived champion and champion-matchup win-rate statistics
(per role, per patch) as the source for the **Champion Statistics** entity,
accessed through a dedicated `StatsProvider` interface in `src/main/stats/`. The
initial implementation (`UggStatsProvider`) fetches u.gg's publicly-served,
per-patch statistics data — the same JSON data u.gg's own site renders from — on a
low-frequency schedule (default: once per day, or on app start if the cached patch
is older than the latest detected patch), and stores normalized rows in SQLite.

**Rationale**:
- The user directed this plan to use u.gg for champion/matchup win-rate data.
- The Riot Games Developer API (`developer.riotgames.com`) does **not** expose an
  endpoint for pre-aggregated champion/matchup win-rate statistics — it provides
  raw match, summoner, and league data. Computing aggregate win rates from raw
  match data would require ingesting and processing a statistically significant
  sample of matches per champion/role/matchup, which is infeasible for a local
  desktop tool. Community stats aggregators (u.gg, OP.GG, lolalytics) already
  perform this aggregation at scale.
- u.gg has no officially documented public API. Direct unauthenticated fetches to
  `u.gg` return `HTTP 403` (bot protection), and community tooling either (a)
  scrapes rendered HTML via a headless browser (fragile, heavyweight for an
  Electron app that already ships Chromium) or (b) calls the JSON data feeds that
  power u.gg's own frontend.

**Risk / Open item for implementation**:
- The exact current u.gg JSON data-feed hostnames/paths are undocumented and may
  change between patches. The `UggStatsProvider` implementation MUST be written
  against the live response observed at build time, with the response shape
  validated/normalized at the provider boundary (see `contracts/stats-provider.md`)
  so a future swap (different aggregator, or a self-hosted dataset) only requires a
  new `StatsProvider` implementation — never a change to the recommendation engine
  or SQLite schema.
- The provider MUST identify itself with a descriptive `User-Agent` and use a
  conservative refresh cadence (daily, not per-recommendation) to stay a "good
  citizen" consumer.

**Fallback / offline-first**: A bundled baseline statistics dataset (JSON snapshot
checked into the repo, refreshed occasionally by maintainers) seeds the SQLite
`champion_stats` table on first run, satisfying SC-006 (first recommendation in
under 2 minutes) even before the first successful live fetch.

**Alternatives considered**:
- *Riot Developer API only*: Rejected — does not provide the required aggregate
  win-rate data (see above).
- *OP.GG MCP / data API*: Viable alternative aggregator with similar
  characteristics; not chosen because the user specified u.gg for this plan. The
  `StatsProvider` abstraction keeps this swappable later.
- *Self-aggregation from Riot match-v5 data*: Rejected as out of scope — would
  require a large-scale data pipeline far beyond a local desktop tool.

---

## 2. League Client Update (LCU) API Integration

**Decision**: Connect to the local LCU API to detect champion-select state,
following the standard community-documented connection flow:

- **Discovery**: Read the `lockfile` written by the running League Client into its
  **install directory** (Windows default: `C:\Riot Games\League of Legends\lockfile`;
  NOT `%LOCALAPPDATA%`, which only holds the separate *Riot Client* lockfile under
  `Riot Client\Config\`). Connection code searches the common install roots and
  honors a `LBP_LCU_LOCKFILE` override for relocated installs. The file is
  colon-delimited: `processName:pid:port:password:protocol`.
- **Connection**: Base URL is `https://127.0.0.1:{port}`. The LCU presents a
  self-signed TLS certificate; the client MUST trust Riot's published LCU root
  certificate (`riotgames.pem`) rather than disabling certificate verification
  outright.
- **Auth**: HTTP Basic auth, username `riot`, password from the lockfile.
- **Live updates**: The LCU exposes a WAMP-style WebSocket at
  `wss://127.0.0.1:{port}/` (same auth). Subscribe to `OnJsonApiEvent` and filter
  for `/lol-champ-select/v1/session` events to react to pick/ban changes without
  polling — satisfying Constitution Principle V's 1-second refresh requirement.
- **Champ-select session shape** (`GET /lol-champ-select/v1/session`): includes
  `myTeam[]` / `theirTeam[]` (each with `cellId`, `championId`, `assignedPosition`),
  `actions[][]` (pick/ban entries with `type`, `championId`, `completed`,
  `actorCellId`), `localPlayerCellId`, and `timer.phase`.

**Role naming normalization**: LCU's `assignedPosition` uses lowercase values
`top | jungle | middle | bottom | utility` — note **`utility` means Support**. The
spec's role taxonomy is `Top | Jungle | Middle | Bottom | Support`. A small mapping
table in `src/recommendation/types.ts` (or a shared constants module) normalizes
`utility` → `SUPPORT` and title-cases the rest. The same table maps u.gg's role
slugs (`top`, `jungle`, `mid`/`middle`, `adc`/`bottom`, `support`/`supp`) to the
same internal `Role` enum, so the recommendation engine only ever deals with one
canonical role type.

**Ranked-game detection**: The champ-select session alone doesn't indicate queue
type; combine with `GET /lol-gameflow/v1/gameflow-phase` (expect `"ChampSelect"`)
and `GET /lol-lobby/v2/lobby` (queue ID) to confirm a ranked Solo/Duo or Flex queue
per the spec's "ranked game" assumption.

**Rationale**: All operations are read-only `GET`/WebSocket-subscribe — fully
compliant with Constitution Principle II (no automation of picks/bans, no writes).

**Alternatives considered**:
- *Polling only (no WebSocket)*: Simpler but cannot reliably hit the 1-second
  refresh target without aggressive polling that wastes resources. WebSocket
  events are the standard approach used by the broader LCU tooling community.
- *Reading game files/memory directly*: Explicitly forbidden by Constitution
  Principle II.

---

## 3. Champion Static Metadata (Identity Mapping)

**Decision**: Use **Riot Data Dragon** (`ddragon.leagueoflegends.com`) for champion
static metadata — numeric `championId` ↔ `key` (slug) ↔ display `name` ↔ icon
asset. Data Dragon is a public, version-pinned CDN that requires **no API key** and
is distinct from the rate-limited Riot Developer API.

**Rationale**: Three different identifiers must be reconciled:
- LCU gives numeric `championId`.
- u.gg's stats are keyed by champion slug/name.
- The UI needs display names and icons for the pool management screen.

Data Dragon's `champion.json` (per game version) provides the
`id ↔ key ↔ name` mapping plus icon URLs in one place, bundled/cached locally like
the u.gg stats data.

**Consequence for Constitution Technology Stack**: This plan does **not** require
a Riot Developer API key for v1 of this feature. The `app_settings` table may
retain an (optional, empty-by-default) column for a future Developer API key, but
nothing in this feature's flows requires the user to provide one.

---

## 4. Application Stack & Project Tooling

**Decision**:
- **Scaffolding**: `electron-vite` (the current standard for Electron + Vite
  projects), producing the conventional `src/main`, `src/preload`,
  `src/renderer/src` layout, extended with a top-level `src/recommendation/`
  package (see Constitution Principle IV below).
- **Language**: TypeScript 5.x throughout (main, preload, renderer,
  recommendation engine). Node.js runtime = whatever the pinned Electron version
  bundles (Electron 30+ → Node 20 LTS).
- **UI**: Vue 3 (Composition API, `<script setup>`) + Vuetify 3 via
  `vite-plugin-vuetify`. `vue-router` for the small set of screens (Pool
  Management, Champion Select / Recommendation view, Settings) — `vue-router` is
  an official Vue ecosystem package, not a third-party addition.
- **State management**: No Pinia. App-wide reactive state (pool, current
  recommendation, connection/freshness status) is implemented as plain
  `reactive()`/`ref()` singletons exported from `src/renderer/src/composables/`,
  populated via the typed preload IPC bridge and IPC event subscriptions. This
  satisfies Constitution Principle VII (justify deps against what Vue 3 already
  provides) — the app has too few screens/state slices to need a dedicated state
  library.
- **SQLite driver**: `better-sqlite3` — synchronous API (fits the <100ms
  recommendation-computation requirement in Principle V without async overhead),
  main-process-only (matches `contextIsolation: true` /
  `nodeIntegration: false`), the most widely-used embedded SQLite driver for
  Electron.
- **Testing**: `vitest` for unit and contract tests (fast, native ESM/TS support,
  integrates with `electron-vite`'s Vite config). The recommendation engine
  (`src/recommendation/`) is plain TypeScript with zero Electron/Vue imports, so
  its tests run with **no Electron runtime** required, per Principle VI.
- **Packaging**: `electron-builder` for distributable builds (Windows primary
  target, matching the developer's environment; macOS/Linux builds are not
  precluded by the architecture but are not the initial verification target).

**Alternatives considered**:
- *electron-forge*: Comparable to electron-vite; electron-vite chosen for its
  first-class Vite integration (HMR for the Vuetify renderer) and smaller config
  surface.
- *sqlite3 (node)*: Async/callback-based; `better-sqlite3`'s synchronous API is a
  better fit for Principle V's tight, synchronous recommendation-computation
  budget and simplifies the main-process repository code.
- *Pinia*: Reasonable, low-cost choice, but not adopted now per Principle VII;
  nothing currently prevents adding it later if cross-screen state grows
  complex — not a one-way door.
- *Playwright/Electron E2E*: Not adopted as an automated suite because, per the
  constitution's Development Workflow section, automated E2E against a live League
  Client is impractical; LCU-touching changes instead ship with a manual test
  checklist.

---

## 5. Data Freshness & Staleness Policy

**Decision**: Define a single configurable threshold,
`STATS_FRESHNESS_HOURS` (default **24 hours**), stored in `app_settings`.
Each `Recommendation` is annotated with one of:

- **`live`** — the underlying champion stats were fetched successfully within
  `STATS_FRESHNESS_HOURS` AND no fetch error is currently active.
- **`cached`** — a fresh-enough fetch exists, but the *current* attempt to refresh
  failed or the stats source / LCU is unreachable right now (US3 AC1/AC3).
- **`stale`** — the most recent successful fetch is older than
  `STATS_FRESHNESS_HOURS`, regardless of current connectivity (US3 AC2). `stale`
  takes precedence over `cached` when both conditions hold.

**Rationale**: 24 hours comfortably covers normal day-to-day play between patches
(LoL patches ship roughly every two weeks) while ensuring the indicator updates
at least daily. It directly satisfies FR-014/FR-015/SC-005 and is simple enough to
unit-test (Principle VI: fixtures for "fresh", "cached-due-to-error", and "stale"
timestamps).

**Alternatives considered**: Tying freshness strictly to "current patch version
match" was considered, but patch-detection adds a dependency on parsing version
strings from Data Dragon/LCU and doesn't change the user-facing behavior much;
the simple time-based threshold is adopted as the primary signal, with patch
mismatch treated as an additional (future) trigger if needed — not required by
any FR/SC for v1.

---

## 6. Constitution Alignment Notes

- **Principle I (Pool-Constrained Recommendations)**: No conflict. The
  recommendation engine's first step is always "filter to pool entries tagged for
  the active role"; u.gg-derived win rates are used only to **order** that
  filtered set (§ data-model.md, § recommendation engine contract).
- **Principle II (Riot API & LCU Compliance)**: No conflict. All LCU interactions
  are read-only `GET`/WebSocket-subscribe. The Riot Developer API is not used by
  this feature (§3 above), so its rate-limit/key-storage clauses are currently
  inert but remain valid for future features.
- **Principle III (Local-First Data Architecture) — note on "External data"
  wording**: The constitution's Technology Stack section currently states
  *"Riot Games Developer API for champion/matchup statistics."* Per §1 above, that
  is not achievable as written (no such Riot endpoint exists), and this plan uses
  u.gg instead, per explicit user direction. Separately, Principle III states *"No
  user data is transmitted to any service other than Riot's official APIs."* The
  `UggStatsProvider` sends only anonymous `GET` requests for public, per-patch
  aggregate statistics — **no user/account/pool data is included in or derived
  from those requests** — so the protective intent of Principle III (don't leak the
  user's data) is preserved. However, the literal wording technically scopes
  *all* outbound requests to "Riot's official APIs," which u.gg is not.
  **Recommendation**: file a follow-up constitution amendment (via
  `/speckit-constitution`) to (a) update the "External data" bullet to list u.gg
  (champion/matchup statistics) and Riot Data Dragon (champion metadata) alongside
  the LCU API, and (b) clarify Principle III's data-transmission clause to scope it
  to *user-identifying or pool data*, explicitly permitting anonymous requests to
  public aggregate-statistics providers. This plan proceeds on the reading above
  (gate: **PASS, amendment recommended**) since no NON-NEGOTIABLE principle (I or
  II) is violated.
- **Principle IV (Business Logic Isolation)**: `src/recommendation/` contains only
  plain TypeScript (pool filter, win-rate scoring, ranking, tie-break), with zero
  imports from `electron`, `vue`, or `vuetify`. Consumed by `src/main` via direct
  function calls, exposed to the renderer via IPC.
- **Principle V (Real-Time Responsiveness)**: LCU WebSocket subscription runs in
  `src/main`; IPC pushes normalized champ-select state to the renderer.
  Recommendation computation runs over an in-memory copy of the pool (≤ a few dozen
  rows) and cached stats — trivially under 100ms.
- **Principle VI (Test-First for Recommendation Logic)**: `tests/unit/recommendation/`
  covers: empty pool, no matchup-specific stats (fallback to overall win rate, per
  FR-017), tied scores (deterministic tie-break, per FR-016), and an enemy
  composition that is unfavorable against every pool champion (FR-012).
- **Principle VII (Minimal, Justified Dependencies)**: See §4 — no Pinia, native
  `fetch` (available in Electron's bundled Node/Chromium) instead of an HTTP
  client library, `better-sqlite3` as the single SQLite driver.

---

## Summary of Resolved Technical Context

| Item | Resolution |
|---|---|
| Language/Version | TypeScript 5.x, Node runtime per bundled Electron (≥ Node 20) |
| Primary Dependencies | Electron, Vue 3, Vuetify 3, vue-router, better-sqlite3, electron-vite, electron-builder |
| Storage | SQLite (`better-sqlite3`) — pool, cached stats, champ-select snapshot, settings |
| Testing | Vitest (unit + contract tests for `src/recommendation/` and IPC contracts); manual LCU test checklist |
| Target Platform | Desktop, Windows primary (matches dev environment); architecture is cross-platform |
| Project Type | Desktop app (Electron, single window) |
| Performance Goals | Recommendation compute < 100ms; champ-select refresh < 1s of LCU change; first recommendation < 2s after champ select starts |
| Constraints | Offline-capable with cached data + "last updated" indicator; read-only Riot/LCU access; pool-constrained recommendations |
| Scale/Scope | Single local profile; pool ≤ ~few dozen entries; ~170 champions × 5 roles of stats data |
