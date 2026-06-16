# LoL Best Picker — Champion Pool Recommender

A focused League of Legends draft assistant. During champion select it recommends the
single best pick **drawn only from your own role-tagged champion pool**, ranked by win
rate against the enemies already revealed — degrading gracefully to a clearly-marked
cached/stale recommendation when live data is unavailable.

Built as an Electron desktop app (Vue 3 + Vuetify renderer, `better-sqlite3` storage) with
a pure, framework-agnostic recommendation engine (`src/recommendation/`).

See [specs/001-champion-pool-recommender/](specs/001-champion-pool-recommender/) for the
full specification, plan, and contracts.

## Prerequisites

- Node.js ≥ 20 (developed against Node 24)
- Windows 10/11 for live LCU (League Client) integration

## Setup

```powershell
npm install
```

## Run the tests (Vitest)

```powershell
npm run test          # full suite: unit + contract + integration
npm run test:watch    # watch mode
npm run typecheck     # tsc (node) + vue-tsc (renderer)
```

`tests/unit/recommendation/` runs with **no Electron runtime** (the engine is pure
TypeScript — Constitution Principle IV). The DB/contract tests run `better-sqlite3`
against temporary SQLite files.

## Run the app

> **Native module note.** `better-sqlite3` is a native addon. After `npm install` it is
> built for **Node's** ABI so the Vitest suite can run. Electron uses a different ABI, so
> before launching the app you must rebuild it for Electron:
>
> ```powershell
> npm run electron:rebuild   # rebuild better-sqlite3 for Electron's ABI
> npm run dev                # launch with HMR
> ```
>
> To run the Vitest suite again afterwards, restore the Node build with
> `npm rebuild better-sqlite3`.

```powershell
npm run dev       # electron-vite dev server + Electron window
npm run build     # typecheck + production bundle to out/
npm run package   # build + electron-builder Windows installer (release/)
```

On first run the app creates/migrates the SQLite database in the user-data directory,
seeds champions (bundled Data Dragon snapshot) and baseline win-rate stats (so a
recommendation can be shown offline — SC-006), and attempts an LCU connection
(non-fatal if the League Client isn't running).

## Configuration

- `LBP_UGG_ENDPOINT` — u.gg stats data-feed URL. u.gg has no documented public API and
  its feed paths change per patch, so this must be supplied/verified against the live feed
  (research.md §1). Without it the app runs offline-first on bundled/cached stats.
- `LBP_LCU_INSECURE=1` — dev-only: skip LCU TLS verification when Riot's `riotgames.pem`
  isn't bundled. Production should bundle the certificate at `src/main/lcu/riotgames.pem`.

## Architecture

```
src/
├── shared/           # types + IPC channel constants (no logic)
├── recommendation/   # PURE engine: filter → score → rank → tie-break → freshness
├── main/             # Electron main: SQLite, repositories, LCU adapter, u.gg provider, IPC
├── preload/          # contextBridge — whitelisted typed `window.api`
└── renderer/         # Vue 3 + Vuetify (Pool, Champ Select, Settings views)
```
