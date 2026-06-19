# Implementation Plan: Role-Based Ban Recommendations

**Branch**: `007-role-based-bans` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-role-based-bans/spec.md`

## Summary

Enable players to view role-segmented ban recommendations (3+ per role) ranked by win rate at their current Elo, with live/cached freshness indicators. Reuse existing lolalytics stats infrastructure and SQLite caching; add a pure, testable ban-ranking engine; extend main-process stats polling to include ban win rates; surface recommendations via a new "Recommended Bans" UI section in the champ-select and pre-select views.

## Technical Context

**Language/Version**: TypeScript 5.x (Node 18+, Electron 24+)

**Primary Dependencies**: Electron, electron-vite, Vue 3 (Composition API), Vuetify 3, better-sqlite3, axios (http), vitest (testing)

**Storage**: SQLite (existing `src/main/db/` schema, new `ban_stats` table with schema migration)

**Testing**: Vitest (unit tests for pure ban-ranking engine, contract tests for main-process providers)

**Target Platform**: Electron desktop app (Windows, scalable to macOS/Linux)

**Project Type**: desktop-app

**Performance Goals**: 
- Ban recommendation fetch/compute: <1000ms (aligned with "2 seconds to load" in Success Criteria)
- Ban ranking computation (after cache hit): <100ms (aligned with Constitution V real-time responsiveness)
- UI render of 15 ban recommendations: <500ms

**Constraints**:
- Offline-capable with cached data and visible "Stale" indicator (Constitution III)
- Read-only stats provider access; no Riot API key exposure (Constitution II)
- No automation of in-game bans (Constitution II)
- Reuse lolalytics provider; no new external service integrations

**Scale/Scope**:
- 5 roles × 3+ champions per role = 15–25 ban recommendations displayed simultaneously
- ~160 champions, ~40 Elo tiers (Bronze–Challenger) = 6,400+ potential stat rows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Pool-Constrained (NON-NEGOTIABLE) | N/A | Bans are not pool-constrained; feature is unrelated to pool selection. |
| II. Riot API & LCU Compliance (NON-NEGOTIABLE) | ✅ PASS | Feature fetches lolalytics stats only (read-only, no API keys). No in-game bans automated. |
| III. Local-First Data Architecture | ✅ PASS | Ban stats cached in SQLite; offline fallback with "Stale" indicator. No third-party telemetry. |
| IV. Business Logic Isolation | ✅ PASS | Ban-ranking engine implemented as pure TypeScript module (`src/recommendation/banRanker.ts`) with no Electron/Vue imports. Separately testable. |
| V. Real-Time Champion Select Responsiveness | ✅ PASS | Ban recommendations are pre-select; minimal impact on champ-select real-time path. Cached ban data used; no blocking I/O during select. |
| VI. Test-First for Recommendation Logic | ✅ PASS | Ban-ranking logic covered by unit tests: empty meta, all-tied scores, single strong ban, fewer than 3 candidates per role. |
| VII. Minimal, Justified Dependencies | ✅ PASS | Reuse existing lolalytics scraper, SQLite, Vue 3, Vuetify. No new external dependencies. |

**Gate Result**: ✅ **PASS** — No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-role-based-bans/
├── spec.md              # Feature specification
├── plan.md              # This file (Phase 0–1 output)
├── research.md          # Phase 0 output: unknown resolution
├── data-model.md        # Phase 1 output: entity & schema design
├── quickstart.md        # Phase 1 output: developer onboarding
├── contracts/           # Phase 1 output: IPC & type contracts
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── types.ts         # EXTEND: BanRecommendation, BanStats types
│   └── ipcChannels.ts   # EXTEND: 'ban:fetch-recommendations', 'ban:stats-updated'
│
├── recommendation/
│   ├── banRanker.ts     # NEW: PURE: rankBansByWinRate(stats[], elo, role) → Ban[]
│   ├── banRanker.test.ts  # NEW: unit tests for ban ranker
│   └── index.ts         # EXTEND: export banRanker
│
├── main/
│   ├── db/
│   │   ├── migrations/
│   │   │   └── 003-add-ban-stats-table.ts  # NEW: SQLite schema for ban_stats
│   │   └── repositories/
│   │       └── banStatsRepository.ts  # NEW: CRUD for ban cache
│   │
│   ├── stats/
│   │   ├── lolalytics.ts  # EXTEND: add fetchBanStats(elo, role)
│   │   └── banStatsProvider.ts  # NEW: main-process stats aggregator
│   │
│   ├── ipc/
│   │   ├── handlers.ts    # EXTEND: handle('ban:fetch-recommendations')
│   │   └── providers.ts   # EXTEND: initBanStatsPoller()
│   │
│   └── index.ts           # EXTEND: call initBanStatsPoller() at startup
│
├── preload/
│   └── index.ts           # EXTEND: expose window.api.ban.fetchRecommendations()
│
└── renderer/
    ├── views/
    │   └── champSelect.vue  # EXTEND: add <BanRecommendations /> section
    │
    ├── components/
    │   ├── BanRecommendations.vue    # NEW: display ban recommendations with freshness
    │   └── BanRecommendationCard.vue # NEW: individual ban card
    │
    └── composables/
        └── useBanRecommendations.ts  # NEW: composable for fetching & UI state
```

**Structure Decision**: Single integrated Electron app. Ban recommendations are a natural extension of the existing pick-recommendation pipeline—they follow the same data path (lolalytics → SQLite cache → IPC → Vue UI) and reuse all existing infrastructure. No new modules or separation needed.

## Complexity Tracking

> No Constitution Check violations requiring justification.

## Phase 0: Research & Unknowns

### Research Tasks

**R1. Lolalytics Ban Win Rate Data Source**
- **Unknown**: Does lolalytics expose per-role ban win-rate data in the same format as pick data? Can we extract it from the build pages (like synergy) or do we need a different endpoint?
- **Impact**: Determines whether we piggyback on existing `LolalyticsPageRendererProvider` or build a new scraper.
- **Deliverable**: Document the data structure, API endpoint (if any), and extraction method.

**R2. Elo Mapping for Ban Stats**
- **Unknown**: When the user has no ranked tier (fresh account, unranked), what Elo default should we use for ban recommendations? (All-Rank? Gold? Show disabled message?)
- **Impact**: Affects edge-case UX and default behavior in `banRanker.ts`.
- **Deliverable**: Decision on fallback Elo and corresponding UX message.

**R3. Ban Data Freshness & Cache Strategy**
- **Unknown**: Should ban stats refresh at the same interval as pick stats (daily?), or on-demand? Should freshness timestamps be shared or separate?
- **Impact**: Affects polling interval, cache invalidation, and SQLite schema.
- **Deliverable**: Cache refresh strategy and timestamp columns in `ban_stats` table.

### Phase 0 Output

**research.md** — Consolidated findings on:
- Lolalytics data source and extraction method
- Elo fallback decision and UX messaging
- Ban data cache refresh interval and schema design

## Phase 1: Design & Contracts

### 1. Data Model Design (data-model.md)

**Entities**:

- **BanRecommendation** (ephemeral, derived from BanStats + current Elo)
  ```typescript
  interface BanRecommendation {
    championId: number;
    championName: string;
    role: 'top' | 'jungle' | 'mid' | 'adc' | 'support';
    winRate: number;       // 45.5 = 45.5%
    pickRate: number;      // optional, for context
    rank: number;          // 1–3 (or fewer) within role
    freshness: 'live' | 'cached' | 'stale';
    dataSource: 'lolalytics';
    lastUpdated: number;   // Unix timestamp
  }
  ```

- **BanStats** (cached in SQLite, raw stats from lolalytics)
  ```sql
  CREATE TABLE IF NOT EXISTS ban_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    champion_id INTEGER NOT NULL,
    champion_name TEXT NOT NULL,
    role TEXT NOT NULL,        -- 'top' | 'jungle' | 'mid' | 'adc' | 'support'
    elo_tier TEXT NOT NULL,    -- 'bronze' | 'silver' | ... | 'challenger'
    win_rate REAL NOT NULL,    -- 45.5
    pick_rate REAL,
    data_source TEXT DEFAULT 'lolalytics',
    fetched_at INTEGER NOT NULL,  -- Unix timestamp
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(champion_id, role, elo_tier, data_source)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    -- existing columns...
    last_ban_stats_fetch INTEGER,      -- Unix timestamp
    ban_stats_fetch_status TEXT,       -- 'success' | 'error' | 'pending'
  );
  ```

**Validation Rules**:
- `winRate` must be 0–100
- `role` must be one of 5 League positions
- `elo_tier` must match LCU rank/division enum
- `freshness` determined by: if `lastUpdated` is within 24 hours → 'live', within 7 days → 'cached', older → 'stale'

**State Transitions**:
- User logs in → fetch current Elo from LCU
- Lolalytics fetch succeeds → cache BanStats, set `freshness: 'live'`
- Fetch fails but cache exists → use cache, set `freshness: 'cached'`
- Cache is stale (>7 days) → show `freshness: 'stale'` with warning
- Offline or fetch timeout → fall back to cache with `freshness: 'stale'`

### 2. Interface Contracts (contracts/)

**IPC Contract** (`contracts/ipc-ban.md`):
```typescript
// Request: Renderer → Main
interface FetchBanRecommendationsRequest {
  currentElo: 'bronze' | 'silver' | ... | 'challenger';
  options?: {
    useCache?: boolean;      // default: true
    forceRefresh?: boolean;  // default: false
  };
}

// Response: Main → Renderer
interface FetchBanRecommendationsResponse {
  success: boolean;
  data?: BanRecommendation[];
  freshness: 'live' | 'cached' | 'stale';
  error?: string;
  timestamp: number;
}
```

**Type Contract** (`contracts/types.ts`):
- Exported from `src/shared/types.ts`
- Includes `BanRecommendation`, `BanStats`, `BanRankerInput`, `BanRankerOutput`
- No Electron/Vue imports

### 3. Quickstart Guide (quickstart.md)

**For developers**:
1. Run `npm run electron:rebuild` (better-sqlite3 ABI)
2. Open `src/recommendation/banRanker.ts` to understand the pure ranking algorithm
3. Add unit tests to `src/recommendation/banRanker.test.ts` before modifying the ranker
4. Extend `src/main/stats/lolalytics.ts` with `fetchBanStats()` to scrape new data sources
5. Use `npm test` to validate pure logic in isolation
6. Use `npm run dev` to test full pipeline (main + renderer)

### 4. Agent Context Update (CLAUDE.md)

Update the "Active Feature Plan" section to link to this plan.

---

### Phase 1 Output Checklist

- ✅ `data-model.md` — Entity definitions, SQLite schema, validation rules, state transitions
- ✅ `contracts/ipc-ban.md` — IPC message types for renderer ↔ main communication
- ✅ `contracts/types.ts` — TypeScript interfaces for ban recommendations (shared module)
- ✅ `quickstart.md` — Developer onboarding and testing workflow
- ✅ `CLAUDE.md` updated with active feature plan link

---

## Next Steps

After Phase 1 design approval:

1. Run `/speckit-tasks` to generate a dependency-ordered task list (`tasks.md`)
2. Run `/speckit-implement` to begin Phase 2 implementation
3. Each task will update corresponding source files, tests, and documentation

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Reuse lolalytics scraper | Ban data available from same source as pick data; zero new external dependency (Constitution VII) |
| Pure `banRanker` module | Enables unit testing in isolation without Electron/Vue mocks; matches Constitution IV pattern |
| SQLite cache with timestamps | Offline capability, fast UI responsiveness, explicit freshness signaling per Constitution III |
| Pre-select recommendations only | Ban recommendations don't require real-time updates during champion select; simplifies main-process polling |
