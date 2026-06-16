# Contract: `StatsProvider` (Champion/Matchup Win-Rate Data)

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) §1

Isolates the recommendation engine and SQLite schema from the specific
champion-statistics source (u.gg today). Lives in `src/main/stats/`.

```ts
interface StatsProvider {
  /**
   * Fetch the full set of champion/role/(matchup|overall) win-rate rows for the
   * current patch. Implementations perform exactly one logical refresh per call —
   * callers (the stats refresh scheduler) are responsible for cadence
   * (research.md §1: default daily).
   */
  fetchChampionStats(): Promise<NormalizedChampionStat[]>;
}

interface NormalizedChampionStat {
  championKey: string;            // Data Dragon `champion.key`, e.g. "Ahri"
  role: Role;                      // canonical enum — provider maps its own role naming
  opponentChampionKey: string | null; // null = overall win rate for (championKey, role)
  winRate: number;                 // 0.0–100.0
  gamesPlayed: number;             // sample size; 0 if unknown but row still meaningful
  patch: string;                   // e.g. "14.12"
}
```

## Repository Boundary

The caller (`src/main/db/repositories/statsRepository.ts`) is responsible for:
1. Resolving `championKey` / `opponentChampionKey` → `champions.champion_id` via
   the `champions` table (populated from Data Dragon — research.md §3). A
   `NormalizedChampionStat` whose `championKey` doesn't resolve to a known
   champion is **skipped** (logged, not fatal) — this guards against transient
   key mismatches between u.gg and the currently-cached Data Dragon version.
2. Upserting into `champion_stats` keyed by
   `(champion_id, role, opponent_champion_id, patch)`.
3. On success, setting `app_settings.last_stats_fetch_at = now()`,
   `last_stats_fetch_status = 'success'`. On thrown error from
   `fetchChampionStats()`, setting `last_stats_fetch_status = 'error'` and
   **leaving existing `champion_stats` rows untouched** (research.md §5 —
   `cached`/`stale` display depends on this).

## `UggStatsProvider` (initial implementation)

- **Role mapping**: u.gg role slugs (`top`, `jungle`, `mid`, `adc`, `support`) →
  `MIDDLE` for `mid`, `BOTTOM` for `adc`, `SUPPORT` for `support`, others
  identity-mapped (uppercased).
- **Champion key mapping**: u.gg identifies champions by a numeric Riot
  `championId` internally; the provider MUST resolve this to the Data Dragon
  `key` slug via the cached `champions` table (by `champion_id`) before returning
  `NormalizedChampionStat` — i.e., the provider's output is always keyed by
  Data Dragon slugs, never u.gg's internal IDs, so downstream code has one
  identifier system.
- **Network behavior**: anonymous `GET` requests only, descriptive `User-Agent`
  header identifying this app, no credentials/cookies. Response shape is
  validated (reject/skip malformed rows) before normalization — never trust the
  upstream shape blindly.
- **Failure modes that MUST be handled without throwing past the provider
  boundary into the UI**: network error, non-200 response, unexpected JSON shape,
  empty result set. All surface as a thrown error caught by the repository (see
  above), which downgrades freshness rather than crashing.

## Test Doubles

`tests/unit/recommendation/` and `tests/contract/stats-provider.test.ts` use a
`FixtureStatsProvider implements StatsProvider` returning fixed
`NormalizedChampionStat[]` arrays — covering: normal data, empty array (no stats
available at all), and a set where a pool champion has **no matchup-specific row**
for a revealed enemy (forces the FR-017 overall-row fallback).
