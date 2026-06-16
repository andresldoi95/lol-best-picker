# Contract: Recommendation Engine (Pure Module)

**Feature**: [../spec.md](../spec.md) | **Data Model**: [../data-model.md](../data-model.md)

`src/recommendation/` — **zero imports** from `electron`, `vue`, or `vuetify`
(Constitution Principle IV). Callable and unit-testable with plain objects, no
SQLite, no IPC, no running app.

```ts
function computeRecommendation(input: RecommendationInput): Recommendation;

interface RecommendationInput {
  poolEntries: Array<{
    championId: number;
    championKey: string;
    championName: string;
    iconPath: string;
    role: Role;
    isActive: boolean;            // from champions.is_active (FR-018)
  }>;
  statRows: Array<{
    championId: number;
    role: Role;
    opponentChampionId: number | null;
    winRate: number;
    gamesPlayed: number;
  }>;
  role: Role | null;               // resolved per data-model.md role precedence; null → empty Recommendation
  enemyChampionIds: number[];
  freshness: {
    lastFetchAt: string | null;
    lastFetchStatus: 'success' | 'error' | null;
    thresholdHours: number;
    now: string;                   // injected for testability — no Date.now() inside the engine
  };
  statsAsOfPatch: string;
}
```

`Recommendation` / `RecommendationEntry` / `Role` types: see
[../data-model.md](../data-model.md#recommendation).

## Behavioral Contract (Requirement Traceability)

| Rule | Requirement(s) |
|---|---|
| `role === null` → `entries: []`, caller shows role-selection prompt | FR-007, edge case |
| Filter `poolEntries` to `role` **before** any scoring | FR-008, Principle I |
| Empty filtered pool → `entries: []` (empty-state message) | FR-013, US2 AC5 |
| `enemyChampionIds` non-empty → score via matchup `statRows` where available | FR-009, FR-010 |
| `enemyChampionIds` empty → score via overall (`opponentChampionId === null`) row | FR-011, US2 AC3 |
| No matchup row for a revealed enemy → fall back to that champion's overall row | FR-017, edge case |
| Every candidate unfavorable → still return ranked list, best-of-worst first | FR-012, US2 AC4 |
| Equal `score` → tie-break by higher `gamesPlayed`, then ascending `championId` | FR-016, edge case |
| `champions.is_active === false` → `isFlagged: true`, included not excluded | FR-018, edge case |
| `freshness` derived from `lastFetchAt`/`lastFetchStatus`/`thresholdHours`/`now` per research.md §5 | FR-014, FR-015, SC-005 |

## Determinism & Testability

- **No side effects, no I/O, no wall-clock reads** (`now` is injected) — every
  output is a pure function of the input object, enabling exact-value assertions
  in Vitest.
- **No partial pool/role mixing**: the function never returns a
  `RecommendationEntry` whose `role !== input.role` or whose `championId` is
  absent from `input.poolEntries` — this is the executable form of Principle I
  and is the primary thing `tests/unit/recommendation/` asserts across fixtures.

## Required Fixture Coverage (Constitution Principle VI)

`tests/unit/recommendation/`:
1. Empty pool for the assigned role → `entries: []`.
2. No `champion_stats` rows at all for a pool champion → still appears, scored via
   absent-data handling (treat as `0` games / lowest score, never throws).
3. Tied scores between two pool champions → deterministic order per tie-break
   rule, asserted by exact array order.
4. Every pool champion has a matchup row with `winRate < 50` against the revealed
   enemy → top entry is still the *highest* of those (least-unfavorable), not
   omitted.
5. `lastFetchStatus: 'error'` with `lastFetchAt` older than `thresholdHours` →
   `freshness: 'stale'`; same but within threshold → `freshness: 'cached'`;
   `lastFetchStatus: 'success'` within threshold → `freshness: 'live'`.
6. A pool entry with `isActive: false` → present in `entries` with
   `isFlagged: true`.
