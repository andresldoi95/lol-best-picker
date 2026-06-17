# Research: Composition-Aware Recommendations

**Date**: 2026-06-16
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves all technical unknowns for the composition-aware recommendation
feature. The existing codebase (spec 001) was read in full before writing this research.

---

## 1. Ally Champion IDs from the LCU

**Decision**: Extend `normalizeChampSelectSession()` in `src/main/lcu/normalize.ts` to
also extract locked-in ally champion IDs from the LCU's `myTeam[]` array.

**How it works today**: The current normalization reads `theirTeam[]` to collect
`enemyChampionIds`. The `myTeam[]` field is already in the parsed `RawLcuSession` type
(`RawLcuTeamMember[]` — each entry has `cellId` and `championId`). The local player is
identified by `localPlayerCellId`.

**Change required**: In `normalizeChampSelectSession()`, after computing
`localPlayerCellId`, add:

```ts
const allyChampionIds = (raw.myTeam ?? [])
  .filter(m => m.cellId !== localPlayerCellId && typeof m.championId === 'number' && m.championId > 0)
  .map(m => m.championId)
```

This matches the existing pattern for `enemyChampionIds` (excluding `championId === 0`
= not yet picked), with the additional exclusion of the local player's own cell (since
we're recommending for them).

**No new LCU endpoint needed** — all data is already in the current
`/lol-champ-select/v1/session` response.

---

## 2. Ally Synergy Data Source (Lolalytics)

**Decision**: Fetch ally synergy win-rate data from **lolalytics per-champion build
pages** at `https://lolalytics.com/lol/{champion-slug}/build/?lane={role}&tier={tier}`.
These pages embed a Qwik JSON payload (same mechanism as the existing tier-list pages).

> **⚠️ VERIFIED 2026-06-17 — the synergy data is NOT in the build-page payload.**
> A live dump of `https://lolalytics.com/lol/ahri/build/?lane=middle&tier=emerald`
> (623 KB page, 343 KB Qwik payload, 12,211 `objs`) shows the page server-renders the
> champion's **counter** matchups but **not** ally synergy. The on-page "Synergy" table
> renders as empty sortable headers and is lazy-loaded client-side from the internal
> `https://a1.lolalytics.com/mega/` API — the obfuscated, ToS-restricted feed this
> project deliberately avoids (see `LolalyticsStatsProvider` doc / Principle VII).
> Probing that API returns PHP `print_r`, not JSON, and rejects `ep=champion` as
> "invalid end point". **Conclusion: ally synergy is not obtainable via compliant
> page-scraping.** The provider keeps scraping the page, finds no synergy section, and
> returns `[]`; the engine falls back to overall WR for the ally component (§3). See the
> chosen disposition below and `parseSynergyHtml` / `tests/unit/stats/lolalyticsMatchupProvider.test.ts`.

**URL pattern**: `https://lolalytics.com/lol/{slug}/build/?lane={lane}&tier=emerald`
where `{slug}` is the lowercase champion key (e.g. `ahri`, `missfortune`) and `{lane}`
is one of `top | jungle | middle | bottom | support`.

**Verified payload structure (2026-06-17 live dump)**: The matchup data is NOT an
id-keyed map of `{wr, games}` objects (as originally assumed). It is held on a data object
keyed by `enemy` (counters only) → a lane-keyed object `{top, jungle, middle, bottom,
support}` → **arrays of 6-element number tuples**. The `enemy_h` header pins the column
order:

```
enemy_h = ["id", "wr", "d1", "d2", "pr", "n"]
enemy.middle[0] = [517, 49.08, 0.73, -2.49, 6.03, 4582]   // Sylas: wr 49.08%, n=4582 games
```

So a champion matchup tuple is `[championId, winRate, delta1, delta2, pickRate, games]` —
champion id first, win rate second, games (`n`) last. The only `{id, n, wr}` *objects* on
the page are **item builds** (ids ≥ 1000, e.g. 3089 = Rabadon's), not champions. There is
**no** `team`/`synergy`/`ally`/`with` key anywhere in `objs`.

**Chosen disposition (page-scraping retained, Principle VII)**: `parseSynergyHtml`:

1. Fetches the page HTML and locates `<script type="qwik/json">` (same as `parseTierlistHtml`).
2. Targets a synergy section **by label** — a key matching `synergy|team|ally|allies|duo|with`,
   never `enemy`. This is what guarantees counter win-rates can never be emitted as synergy
   (the original "densest id-keyed stat map" heuristic had no such guard).
3. Parses the verified tuple shape (`id` at [0], `wr` at [1], games at the last index) into
   `NormalizedSynergyRow[]` (`championKey`, `role`, `allyChampionKey`, `winRate`,
   `gamesPlayed`, `patch`), dropping self / unknown / sub-`minGames` / zero-WR rows.
4. Finds no synergy section on today's pages → returns `[]`. If lolalytics ever
   server-renders synergy in the same tuple shape as `enemy`, this picks it up unchanged.

**Scale**: Synergy fetches are pool-scoped, not all-champions-scoped. With a pool of
e.g. 10 champion-role pairs, the refresh makes 10 HTTPS requests — lightweight compared
to the existing 5 tier-list requests. The `LolalyticsMatchupProvider` only fetches pages
for `(championKey, role)` pairs that actually appear in the current pool, received as
input at refresh time.

**Fallback when unavailable**: If a champion's synergy page returns non-200, the parse
fails, or no synergy rows are found, `LolalyticsMatchupProvider` logs a warning and
returns an empty array for that champion-role pair. `computeRecommendation` then uses the
champion's overall win rate for the ally synergy component (FR-011 analogue for synergy).

**Alternatives considered**:
- *Extend the existing tier-list pages*: Tier-list pages do not include synergy data —
  they are per-role champion rankings, not per-champion detail pages.
- *u.gg synergy data*: The `uggStatsProvider` already exists but u.gg's synergy data
  feeds are not documented and may differ. The `SynergyProvider` interface is
  data-source-agnostic; a `UggMatchupProvider` can be added later if lolalytics fails.
- *Skip synergy and use only overall WR for ally component*: Satisfies FR-007/FR-008
  (ally-only fallback). Given the 2026-06-17 finding that synergy is not available via
  compliant page-scraping, this is the **current de-facto behaviour**: `parseSynergyHtml`
  returns `[]` and the engine uses overall WR for the ally component. A real synergy feed
  (e.g. a `UggMatchupProvider`, or accepting the internal lolalytics API) can be slotted in
  later behind the unchanged `SynergyProvider` interface without touching the engine.

---

## 3. Combined Scoring Algorithm

**Decision**: Implement a pure `scoreWithAlly()` helper (alongside the existing
`scoreCandidate()`) in `src/recommendation/engine.ts` and combine the two signals with
50/50 weighting (FR-013, user-confirmed).

**Signal derivation**:

| Situation | Enemy signal | Ally signal | Combined formula |
|-----------|-------------|-------------|-----------------|
| Both present | matchup avg vs enemies (or overall fallback per FR-017) | synergy avg with allies (or overall fallback per FR-011-analogue) | `0.5 * enemy + 0.5 * ally` |
| Enemies only (no allies locked in) | matchup / overall | 100% weight on enemy signal | `enemy` score only |
| Allies only (no enemies revealed) | — | synergy avg | `ally` score only |
| Neither | — | — | overall win rate |

**Fallback within ally signal**: If no synergy row exists for a specific `(poolChampion,
ally)` pair, that pair's contribution is the pool champion's overall win rate for the
role. The average is taken across all locked-in allies using whatever score is
available (synergy or overall fallback) for each.

**Tie-breaking**: The existing `compareScored()` (score desc → gamesPlayed desc →
championId asc) is reused, with `gamesPlayed` being the sum of the enemy and synergy
sample sizes.

---

## 4. Schema Migration Strategy

**Decision**: Add migration `002_add_synergy.sql` following the existing
numbered-migration convention in `src/main/db/migrations/`. The migration runner in
`src/main/db/index.ts` applies pending migrations in filename order on startup.

**Two schema changes**:
1. New `champion_synergy` table (ally synergy data store).
2. `ALTER TABLE champ_select_snapshot ADD COLUMN ally_champion_ids` — persists the
   ally picks for offline-mode snapshot (FR-001 / spec US2 AC3 analogue: snapshot
   includes ally context for the last-known session).

**Risk**: `ALTER TABLE ... ADD COLUMN` in SQLite is additive-only and non-destructive.
No existing data or foreign keys are affected. The new column has a `DEFAULT '[]'`
so existing snapshot rows read correctly before any update.

---

## 5. Synergy Data Freshness

**Decision**: Synergy data shares the `last_stats_fetch_at` / `last_stats_fetch_status`
tracking columns in `app_settings`. Both overall stats and synergy stats are refreshed
in the same `startStatsRefresh()` cycle — they succeed or fail together. No new settings
columns are added.

**Rationale**: Synergy win rates shift on the same cadence as overall win rates (patch
cycle). Treating them as one refresh unit simplifies the freshness model and avoids a
second `lastSynergyFetchAt` indicator in the UI. If the synergy portion of the fetch
fails but overall stats succeed, the scheduler logs the error and marks the synergy rows
as absent — `computeRecommendation` falls back to overall WR for the ally component (§3
above) and the existing `freshness` label continues to reflect overall data quality.

---

## 6. `RecommendationEntry` Score Breakdown

**Decision**: Add a `scoreBreakdown` field to `RecommendationEntry` (in
`src/shared/types.ts`) exposing the two components separately:

```ts
interface ScoreBreakdown {
  enemyMatchupScore: number    // 0–100; the enemy-signal value for this champion
  allysSynergyScore: number    // 0–100; the ally-signal value (or overall fallback)
  combinedScore: number        // = the entry's `score` field (for UI convenience)
  activeSignals: ('enemy-matchup' | 'ally-synergy' | 'overall')[]
}
```

The existing top-level `score` field on `RecommendationEntry` becomes the combined
score. The existing `scoreBasis: ScoreBasis` field is kept for backward compat with
the existing freshness/caching path, and `ScoreBasis` is extended to include
`'combined'` as a possible value when both signals are active.

---

## 7. Constitution Alignment

- **Principle I (Pool-Constrained)**: Unaffected. Ally synergy is purely an ordering
  signal applied to the already-filtered pool — it cannot introduce non-pool champions.
  FR-010 (exclude pool champions already locked in by allies) adds an additional filter
  before scoring, not after.
- **Principle II (Riot/LCU Compliance)**: Ally picks come from the same read-only
  LCU session already consumed. No new LCU endpoints, no writes.
- **Principle III (Local-First)**: New `champion_synergy` table is local SQLite. Synergy
  fetches are anonymous GETs to lolalytics (same as overall stats — existing Principle
  III note from research.md §6 spec-001 applies equally here).
- **Principle IV (Business Logic Isolation)**: All new scoring logic (`scoreWithAlly()`,
  combined weighting) goes into `src/recommendation/engine.ts` — pure TypeScript, zero
  framework imports.
- **Principle V (Real-Time Responsiveness)**: `allyChampionIds` change detection added
  to `sessionKey()` in `champSelectAdapter.ts` so ally lock-ins trigger an
  `onChampSelectUpdate` callback — same 1-second polling cadence (SC-001).
- **Principle VI (Test-First)**: New unit-test fixtures required: no allies (enemy-only
  path), no synergy data (overall fallback), single ally, multiple allies, ally same as
  pool candidate (exclusion), conflicting signals.
- **Principle VII (Minimal Dependencies)**: No new runtime dependencies. `LolalyticsMatchupProvider`
  reuses the same Qwik JSON parsing pattern as `LolalyticsStatsProvider`.

---

## Summary of Resolved Technical Context

| Item | Resolution |
|---|---|
| Ally champion IDs | `myTeam[]` already in LCU session; exclude `localPlayerCellId` and `championId === 0` |
| Synergy data source | Lolalytics build pages — **verified 2026-06-17: pages embed counters (`enemy`) only, NOT synergy**; synergy is lazy-loaded from the avoided internal API. Provider returns `[]` → overall-WR fallback |
| Synergy URL pattern | `https://lolalytics.com/lol/{slug}/build/?lane={lane}&tier=emerald` |
| Synergy field names | Matchup tuples `[id, wr, d1, d2, pr, n]` (`enemy_h` header), not `{wr, games}` objects; `n` = games. `{id,n,wr}` objects on the page are *items*, not champions |
| Combined score | 50/50 enemy matchup + ally synergy; fall back to available signal when one is absent |
| Ally signal fallback | Per missing pair: use overall WR; average across all allies with available data |
| Migration | `002_add_synergy.sql` — new `champion_synergy` table + ALTER snapshot |
| Freshness tracking | Shared with existing `last_stats_fetch_at`/`last_stats_fetch_status` |
| Score breakdown | New `scoreBreakdown` field on `RecommendationEntry`; top-level `score` = combined |
