# Ban Recommendations — Developer Guide (spec 007)

Role-based ban recommendations show the **top 3 champions to ban per role** (top,
jungle, mid, adc, support) at the player's current Elo, ranked by a **threat score**

    threatScore = (winRate − 50) × pickRate

— not raw win rate, which surfaces low-pick-rate one-tricks with fluky win rates. The
threat score weights a champion's win-rate edge by how often you'll actually face
them, with a low-presence floor (default 0.5% pick rate, never empties a role).
Unlike pick recommendations, bans are **not** pool-constrained — they span the meta.

## Data flow

```
LCU ranked tier ─┐
                 ▼
lolalytics tier-list pages (per Elo)      seed: championStats.json @ emerald
  └─ LolalyticsStatsProvider (reused)        └─ seedBanStats()  (offline first-run)
        │ NormalizedBanStat[]                       │
        ▼                                           ▼
  banStatsProvider.refreshBanStats() ──upsert──▶  ban_stats  (SQLite, per elo_tier)
        ▲ (24h poll + on tier change)                 │
        │                                             ▼ getBanStatsByElo()
  startBanStatsRefresh()                     BanRecommendationService.get(elo?)
                                                      │  rankBans()  ← PURE (threat score)
                                                      ▼  + deriveFreshness()
                              IPC 'ban:fetch-recommendations' / 'ban:stats-updated'
                                                      ▼
                          useBanRecommendations() → BanRecommendations.vue (/bans)
```

## Where things live

| Concern | File |
|---------|------|
| Pure ranking engine | `src/recommendation/banRanker.ts` (+ `tests/unit/recommendation/banRanker.test.ts`) |
| Shared types | `src/shared/types.ts` — `EloTier`, `BanRecommendation`, `BanRecommendationSet`, `DEFAULT_ELO_TIER` |
| SQLite schema | `src/main/db/migrations/005_add_ban_stats.sql` |
| Cache repository | `src/main/db/repositories/banStatsRepository.ts` |
| Fetch + refresh | `src/main/stats/banStatsProvider.ts` |
| Orchestration / freshness | `src/main/banRecommendationService.ts` |
| LCU Elo lookup | `champSelectAdapter.ts` `getCurrentRankedTier()`, `recommendation/types.ts` `normalizeLcuTier()` |
| IPC | `src/shared/ipcChannels.ts` (`BAN_*`), `src/main/ipc/handlerMap.ts`, `src/preload/index.ts` (`window.api.ban`) |
| UI | `src/renderer/src/components/BanRecommendations.vue`, `BanRecommendationCard.vue`, `composables/useBanRecommendations.ts`, `pages/BanRecommendationsView.vue` |

## Common changes

- **Tweak the ranking** (e.g. change the threat formula, the presence floor, show
  more per role): edit `rankBans` in `banRanker.ts`. It's pure — add a case to
  `banRanker.test.ts` first (Constitution VI). `perRole` and `minPickRate` are
  already parameters.
- **Change how many bans per role**: pass `perRole` through
  `BanRecommendationService` → `rankBans` (default 3, SC-002).
- **Add/adjust an Elo tier**: extend `EloTier`/`ELO_TIERS` in `shared/types.ts` and
  the `LCU_TIER_TO_ELO` map in `recommendation/types.ts`. `EloTier` values are
  lolalytics' own `&tier=` slugs, so they pass straight to the scraper.
- **Swap the ban data source**: implement an alternate `fetchBanStats(elo)` and pass
  it as `BanStatsRefreshDeps.fetchBanStats` — `refreshBanStats` and the repository
  don't change. (Today it reuses `LolalyticsStatsProvider`; FR-006 / Constitution VII.)
- **Add ban rate** (if the payload exposes `br`): extend `isStatObject` +
  `parseTierlistHtml` to capture it like `pr`, thread it through `NormalizedBanStat`
  → `ban_stats` (new column) → `BanStatInput`, and fold it into the threat score
  (e.g. add a ban-rate term). Currently the score uses win rate × pick rate only.

## Freshness & offline behavior

`ban_stats` is seeded from the bundled snapshot at `DEFAULT_ELO_TIER` so `/bans`
renders on first launch with no network. A live fetch stamps
`app_settings.last_ban_stats_fetch_at/_status`; `deriveFreshness()` turns those into
the live/cached/stale chip. A fetch failure calls `markFetchError()` — it flips the
status but never discards cached rows (Constitution III). If the LCU resolves a tier
with no cached data yet, the service falls back to the default tier's data and
reports the tier actually used (FR-009).

## Testing

```powershell
npm test          # banRanker unit tests + ban IPC contract test (tests/contract/ban-handlers.test.ts)
npm run typecheck  # quality gate
```

> Remember the **better-sqlite3 ABI gotcha**: `npm rebuild better-sqlite3` before
> `npm test`, `npm run electron:rebuild` before `npm run dev`.
