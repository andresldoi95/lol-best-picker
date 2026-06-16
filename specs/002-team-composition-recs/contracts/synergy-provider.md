# Contract: SynergyProvider Interface

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Defines the interface that separates synergy-data acquisition from the recommendation
engine, following the same pattern as `StatsProvider` (spec 001
`contracts/stats-provider.md`). Implementations can be swapped without touching
`recommendationService.ts` or `engine.ts`.

---

## Interface

```ts
// src/main/stats/synergyProvider.ts

export interface NormalizedSynergyRow {
  /** Data Dragon slug of the pool champion (e.g. "Ahri"). */
  championKey: string
  /** Role the pool champion is playing. */
  role: Role
  /** Data Dragon slug of the ally champion (e.g. "MissFortune"). */
  allyChampionKey: string
  /** Win rate (0–100) of championKey in role when played with allyChampionKey. */
  winRate: number
  /** Number of games this statistic is based on. 0 when not reported by provider. */
  gamesPlayed: number
  /** Patch label this data applies to (e.g. "16.12"). */
  patch: string
}

export interface SynergyProviderTarget {
  /** Data Dragon slug. */
  championKey: string
  /** Role this champion occupies in the player's pool. */
  role: Role
}

export interface SynergyProvider {
  /**
   * Fetch ally synergy win-rate rows for the given pool champion-role pairs.
   * Only fetches data for the supplied targets (pool-scoped, not all champions).
   *
   * May return partial results: if fetching for one target fails, the provider
   * should log the error, skip that target, and return results for all others.
   * An empty array for a given target is not an error — it signals "no synergy
   * data available", and callers must apply the overall-WR fallback (research.md §3).
   *
   * @throws Only for unrecoverable initialisation failures (e.g., cannot resolve
   *   the current patch). Per-champion fetch errors are swallowed and logged.
   */
  fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]>
}
```

---

## `LolalyticsMatchupProvider` Implementation Contract

File: `src/main/stats/lolalyticsMatchupProvider.ts`

**Constructor options**:

```ts
export interface LolalyticsMatchupProviderOptions {
  /** Riot numeric ID → Data Dragon slug (same map as LolalyticsStatsProvider). */
  idToKey: Map<number, string>
  /** Key → numeric ID (reverse map for ally ID resolution). */
  keyToId: Map<string, number>
  tier?: string          // default: 'emerald'
  minGames?: number      // default: 100 — drop rows below sample size
  baseUrl?: string       // default: 'https://lolalytics.com'
  ddragonVersionsUrl?: string
  userAgent?: string
  fetchImpl?: typeof fetch
}
```

**Fetch URL per target**: `{baseUrl}/lol/{championKey.toLowerCase()}/build/?lane={lane}&tier={tier}`
where `lane` is the lowercase lane name for the role (`top`, `jungle`, `middle`,
`bottom`, `support`).

**Parse algorithm** (implementation-time verification required per research.md §2):
1. Locate `<script type="qwik/json">` in the page HTML.
2. Decode the `objs` array (same base-36 resolution as `parseTierlistHtml`).
3. Locate the synergy map: the object whose keys are champion IDs (numeric strings)
   and whose values resolve to objects containing a win-rate field and a games count
   field. The field name for games may differ from `games` (e.g. `n`) — confirm at
   implementation with a logged payload dump in development mode.
4. Emit one `NormalizedSynergyRow` per synergy entry, filtering out rows below
   `minGames` and clamping win rate to [0, 100].

**Error handling**: Any exception during fetch or parse for a single target is caught,
logged at `warn` level, and the target is skipped — partial results are returned.

---

## `FixtureSynergyProvider` (test double)

```ts
// tests/contract/fixtures/fixtureSynergyProvider.ts

export class FixtureSynergyProvider implements SynergyProvider {
  constructor(private readonly rows: NormalizedSynergyRow[]) {}

  async fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]> {
    const targetKeys = new Set(targets.map(t => `${t.championKey}:${t.role}`))
    return this.rows.filter(r => targetKeys.has(`${r.championKey}:${r.role}`))
  }
}
```

Used by unit tests for `computeRecommendation` and integration tests for
`RecommendationService` without making network calls.

---

## Traceability

| Contract element | Spec requirement |
|---|---|
| `fetchSynergyStats(targets)` | FR-002 (retrieve synergy stats for pool champions) |
| Per-target error swallowing | FR-014 / SC-003 (fallback notice, no blank screen) |
| `minGames` filter | research.md §2 (noise suppression, same policy as overall stats) |
| Pool-scoped fetching | research.md §2 (scale: fetches only for pool entries) |
