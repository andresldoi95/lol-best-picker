# Implementation Plan: Live Synergy Data via Browser Rendering

**Branch**: `004-puppeteer-synergy-render` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-puppeteer-synergy-render/spec.md`

## Summary

Replace the current always-empty ally synergy signal with live pair win rates by
rendering lolalytics build pages in a hidden Electron `BrowserWindow`, waiting for the
synergy table to populate client-side, then extracting and caching the data.

**Core insight**: lolalytics lazy-loads synergy data via a client-side fetch (verified
spec 002 research §2). Static HTML scraping (current approach) can never obtain it.
A full JavaScript runtime is required — but Electron already bundles Chromium, so the
feature is implemented using a hidden `BrowserWindow` with zero new npm dependencies,
satisfying Constitution VII.

**Change surface**: One new provider (`LolalyticsPageRendererProvider`) is a drop-in
replacement for `LolalyticsMatchupProvider` in `main/index.ts`. Enemy matchup fetching
is unchanged (delegates to the wrapped matchup provider). Migration 004 adds a `source`
column to `champion_synergy` and synergy freshness tracking to `app_settings`. The UI
gains a small "Synergy: live / estimated" chip in `ChampSelectView`.

## Technical Context

**Language/Version**: TypeScript 5.x; Electron runtime (unchanged from specs 001–003)

**Primary Dependencies**: Electron, Vue 3, Vuetify 3, better-sqlite3 (all unchanged —
**no new runtime dependencies**, Constitution VII)

**Storage**: SQLite — migration 004 adds `source` column to `champion_synergy` and two
freshness columns to `app_settings`

**Testing**: Vitest — `parseSynergyDom()` is a pure function, unit-testable without
Electron; the `LolalyticsPageRendererProvider` class (BrowserWindow integration) is
covered by the manual checklist in `quickstart.md`

**Target Platform**: Windows 10/11 desktop (Electron — unchanged)

**Performance Goals**: Pool of 10 champions renders and caches synergy data in under
60 seconds total (SC-002); champion select recommendation latency unchanged (rendering
only in background refresh cycle)

**Constraints**: BrowserWindow rendering uses a dedicated session partition to avoid
CSP hook interference; sequential (not concurrent) rendering to limit memory use;
5-second per-champion timeout with graceful fallback (FR-011)

**Scale/Scope**: Pool-scoped — one BrowserWindow navigation per champion-role pair in
the pool, not all champions; 24h refresh cycle unchanged (FR-012)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Pool-Constrained (NON-NEGOTIABLE) | **PASS** | Rendering targets only pool champions (`getSynergyTargets()` unchanged). Synergy data orders pool members; no new champions introduced. |
| II. Riot/LCU Compliance (NON-NEGOTIABLE) | **PASS** | Anonymous GET requests to lolalytics (same as existing). The `a1.lolalytics.com` internal ToS-restricted API is explicitly **not** called — rendering lets lolalytics' own JS call it on behalf of the page. |
| III. Local-First | **PASS** | Synergy rows cached in SQLite; freshness indicator shows data age; fallback to overall WR when rendering fails. |
| IV. Business Logic Isolation | **PASS** | `parseSynergyDom()` is a pure function with no Electron imports. Recommendation engine is untouched. |
| V. Real-Time Responsiveness | **PASS** | Rendering runs only during the background refresh cycle, never during active champion select polling (FR-012 / SC-003). |
| VI. Test-First | **PASS** | `parseSynergyDom()` tests must be written before implementing the function body (quickstart §3, SC-005). |
| VII. Minimal Dependencies | **PASS** | Zero new npm packages. `BrowserWindow` is Electron's own API; Chromium is already bundled. CLAUDE.md documents the deliberate choice of BrowserWindow over Puppeteer. |

**Post-design re-check**: No violations introduced by Phase 1 design. Complexity
Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/004-puppeteer-synergy-render/
├── plan.md                    # This file
├── research.md                # Phase 0 output — rendering approach, DOM, migration rationale
├── data-model.md              # Phase 1 output — schema, type extensions
├── quickstart.md              # Phase 1 output — dev and test guide
├── contracts/
│   ├── renderer-provider.md   # LolalyticsPageRendererProvider contract
│   └── ipc-api.md             # Recommendation + AppSettings type additions
└── tasks.md                   # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── shared/
│   └── types.ts               MODIFIED — AppSettings + lastSynergyFetchAt/Status;
│                                          Recommendation + synergySource;
│                                          new SynergySource + SynergyFetchStatus types
│
├── main/
│   ├── index.ts               MODIFIED — replace LolalyticsMatchupProvider with
│   │                                      LolalyticsPageRendererProvider; build slugToKey map
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 004_add_synergy_source.sql   NEW — source col + freshness cols
│   │   └── repositories/
│   │       ├── synergyRepository.ts   MODIFIED — upsertSynergy persists source;
│   │       │                                       markSynergyFetchRendered();
│   │       │                                       markSynergyFetchError()
│   │       └── settingsRepository.ts  MODIFIED — get() returns new synergy freshness fields
│   ├── stats/
│   │   ├── lolalyticsPageRendererProvider.ts   NEW — hidden BrowserWindow synergy render;
│   │   │                                              parseSynergyDom() pure fn (exported);
│   │   │                                              delegates matchups to wrapped provider
│   │   ├── synergyProvider.ts   MODIFIED — NormalizedSynergyRow gains optional source field
│   │   └── index.ts             MODIFIED — refreshBuildStats() calls markSynergyFetch*()
│   └── recommendationService.ts   MODIFIED — populate Recommendation.synergySource
│                                              from AppSettings
│
└── renderer/
    └── src/
        └── pages/
            └── ChampSelectView.vue   MODIFIED — "Synergy: live / estimated" chip,
                                                   driven by recommendation.synergySource

tests/
└── unit/
    └── stats/
        └── lolalyticsPageRendererProvider.test.ts   NEW — parseSynergyDom() unit tests
                                                            (5 cases, SC-005)
```

**Structure Decision**: All changes fit within the existing Electron single-app
structure. `lolalyticsPageRendererProvider.ts` lives alongside the existing
`lolalyticsMatchupProvider.ts` in `src/main/stats/`, following the same provider
pattern. No new top-level packages or project roots are introduced.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*
