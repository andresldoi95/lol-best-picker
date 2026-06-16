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
These pages embed a Qwik JSON payload (same mechanism as the existing tier-list pages)
that contains a "synergy" section with per-ally win rates.

**URL pattern**: `https://lolalytics.com/lol/{slug}/build/?lane={lane}&tier=emerald`
where `{slug}` is the lowercase champion key (e.g. `ahri`, `missfortune`) and `{lane}`
is one of `top | jungle | middle | bottom | support`.

**Payload structure (implementation-time discovery)**: The exact field names in the Qwik
`objs` array for the synergy section are NOT identical to the tier-list fields (`wr`,
`games`, `pr`). The implementation MUST:

1. Fetch the page HTML.
2. Locate `<script type="qwik/json">` (same as `parseTierlistHtml`).
3. Walk the `objs` array to find the synergy map — the object whose keys are champion IDs
   and whose values resolve to objects containing `wr` (win rate) and a game count field.
   The game count field on champion pages may use `n` rather than `games` — confirm at
   implementation time with a live page fetch and log the payload structure.
4. Emit `NormalizedSynergyRow[]` with `championKey`, `role`, `allyChampionKey`,
   `winRate`, `gamesPlayed`, `patch`.

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
- *Skip synergy and use only overall WR for ally component*: Would satisfy FR-007/FR-008
  (ally-only fallback) but defeat the purpose of the feature — ally synergy data exists
  on lolalytics and should be used.

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
| Synergy data source | Lolalytics per-champion build pages (same Qwik JSON technique as existing provider) |
| Synergy URL pattern | `https://lolalytics.com/lol/{slug}/build/?lane={lane}&tier=emerald` |
| Synergy field names | Verify at implementation time — likely `wr` + `n` (not `games`) in synergy section |
| Combined score | 50/50 enemy matchup + ally synergy; fall back to available signal when one is absent |
| Ally signal fallback | Per missing pair: use overall WR; average across all allies with available data |
| Migration | `002_add_synergy.sql` — new `champion_synergy` table + ALTER snapshot |
| Freshness tracking | Shared with existing `last_stats_fetch_at`/`last_stats_fetch_status` |
| Score breakdown | New `scoreBreakdown` field on `RecommendationEntry`; top-level `score` = combined |
