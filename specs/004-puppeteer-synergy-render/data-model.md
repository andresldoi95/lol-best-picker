# Data Model: Live Synergy Data via Browser Rendering

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document covers the schema additions and type extensions for the live synergy
rendering feature, layered on top of the base schema from specs 001–003.

---

## 1. Schema Extension: `champion_synergy` — Add `source` Column

Migration `004_add_synergy_source.sql` adds a `source` column to track how each
synergy row was obtained.

```sql
-- Migration: src/main/db/migrations/004_add_synergy_source.sql

ALTER TABLE champion_synergy
  ADD COLUMN source TEXT NOT NULL DEFAULT 'static';
-- 'static' = parsed from Qwik JSON on the static page (current provider, always [])
-- 'rendered' = extracted from the fully-rendered DOM (this feature)
```

Existing rows receive `source = 'static'` (accurate — prior provider used Qwik JSON
and always returned no synergy). New rows from `LolalyticsPageRendererProvider` write
`source = 'rendered'`.

---

## 2. Schema Extension: `app_settings` — Synergy Freshness Columns

Same migration adds two new nullable columns to `app_settings`:

```sql
ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_at TEXT;       -- ISO-8601 timestamp; NULL = never attempted
ALTER TABLE app_settings
  ADD COLUMN last_synergy_fetch_status TEXT;   -- 'rendered' | 'error'; NULL = never attempted
```

These parallel `last_stats_fetch_at` / `last_stats_fetch_status` for synergy-specific
freshness tracking. Both are `NULL` on first launch until a render attempt completes.

**Full `app_settings` schema after migration 004**:

```sql
CREATE TABLE app_settings (
  id                         INTEGER PRIMARY KEY,        -- always 1 (singleton)
  manual_role                TEXT,
  stats_freshness_hours      INTEGER NOT NULL DEFAULT 24,
  last_stats_fetch_at        TEXT,
  last_stats_fetch_status    TEXT,
  language                   TEXT NOT NULL DEFAULT 'en',
  last_synergy_fetch_at      TEXT,                       -- NEW
  last_synergy_fetch_status  TEXT                        -- NEW
);
```

---

## 3. Extended TypeScript Types (`src/shared/types.ts`)

### `AppSettings` — Add Synergy Freshness Fields

```ts
export interface AppSettings {
  manualRole: Role | null
  statsFreshnessHours: number
  lastStatsFetchAt: string | null
  lastStatsFetchStatus: FetchStatus | null
  language: Language
  lastSynergyFetchAt: string | null        // NEW
  lastSynergyFetchStatus: SynergyFetchStatus | null  // NEW
}

export type SynergyFetchStatus = 'rendered' | 'error'
```

### `Recommendation` — Add `synergySource`

```ts
export interface Recommendation {
  role: Role | null
  entries: RecommendationEntry[]
  enemyChampionIds: number[]
  allyChampionIds: number[]
  freshness: Freshness
  statsAsOfPatch: string
  lastUpdatedAt: string
  synergySource: SynergySource  // NEW
}

export type SynergySource = 'rendered' | 'fallback'
// 'rendered' = last synergy render succeeded; rows reflect live pair win rates
// 'fallback' = no successful render; ally scores use overall WR (same as before)
```

`synergySource` is computed by `RecommendationService`:
- `'rendered'` when `AppSettings.lastSynergyFetchStatus === 'rendered'`
- `'fallback'` otherwise (null, or 'error')

---

## 4. Extended TypeScript Types (`src/main/stats/synergyProvider.ts`)

### `NormalizedSynergyRow` — Add Optional `source` Field

```ts
export interface NormalizedSynergyRow {
  championKey: string
  role: Role
  allyChampionKey: string
  winRate: number
  gamesPlayed: number
  patch: string
  source?: 'rendered' | 'static'  // NEW optional — defaults to 'static' if absent
}
```

The field is optional so `LolalyticsMatchupProvider` (which still returns `[]` for
synergy today) and any future `SynergyProvider` implementations need no changes.
`LolalyticsPageRendererProvider` sets `source: 'rendered'` on every row it produces.

---

## 5. Repository Changes (`src/main/db/repositories/synergyRepository.ts`)

### `upsertSynergy()` — Persist `source`

The INSERT statement gains a `@source` binding:

```ts
const insert = this.db.prepare(
  `INSERT OR REPLACE INTO champion_synergy
     (champion_id, role, ally_champion_id, win_rate, games_played, patch, fetched_at, source)
   VALUES (@championId, @role, @allyChampionId, @winRate, @gamesPlayed, @patch, @fetchedAt, @source)`
)
// When calling:
insert.run({
  ...,
  source: row.source ?? 'static'
})
```

### New methods: `markSynergyFetchRendered()` and `markSynergyFetchError()`

```ts
markSynergyFetchRendered(): void {
  this.db.prepare(
    `UPDATE app_settings
     SET last_synergy_fetch_at = @now, last_synergy_fetch_status = 'rendered'
     WHERE id = 1`
  ).run({ now: new Date().toISOString() })
}

markSynergyFetchError(): void {
  this.db.prepare(
    `UPDATE app_settings
     SET last_synergy_fetch_at = @now, last_synergy_fetch_status = 'error'
     WHERE id = 1`
  ).run({ now: new Date().toISOString() })
}
```

These parallel `StatsRepository.markFetchError()`.

---

## 6. Repository Changes (`src/main/db/repositories/settingsRepository.ts`)

### `get()` — Return New Synergy Fields

```ts
get(): AppSettings {
  const row = this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as RawSettingsRow
  return {
    // existing fields...
    lastSynergyFetchAt: row.last_synergy_fetch_at ?? null,             // NEW
    lastSynergyFetchStatus: (row.last_synergy_fetch_status as SynergyFetchStatus) ?? null  // NEW
  }
}
```

---

## 7. New Provider Types (`src/main/stats/lolalyticsPageRendererProvider.ts`)

### `LolalyticsPageRendererOptions`

```ts
export interface LolalyticsPageRendererOptions extends LolalyticsMatchupProviderOptions {
  /** Maps lowercase champion slug → Data Dragon key (e.g. 'ahri' → 'Ahri'). */
  slugToKey: Map<string, string>
  /** Maximum ms to wait for synergy table to appear before recording a timeout. */
  renderTimeoutMs?: number  // default 5000
  /** Polling interval when waiting for synergy table DOM element. */
  pollIntervalMs?: number   // default 250
}
```

### `ParsedSynergyTableRow`

```ts
/** Intermediate shape returned by the DOM extraction script. */
interface ParsedSynergyTableRow {
  slug: string      // lowercase champion slug extracted from image URL or data attribute
  winRate: number   // raw float (0–100)
  games: number     // raw integer sample size
}
```

### Pure Extraction Function (exported, unit-testable)

```ts
/**
 * Parse rendered HTML from a lolalytics build page into NormalizedSynergyRow[].
 * Exported for unit-testing without Electron. Exact selector logic TBD after
 * inspecting the live DOM during implementation (research.md §4).
 *
 * @param html   Full rendered page HTML (from executeJavaScript outerHTML)
 * @param slugToKey  lowercase slug → Data Dragon key map
 * @param championKey  the pool champion this page belongs to
 * @param role   the champion's role
 * @param patch  current patch label
 * @param minGames  minimum sample size filter
 */
export function parseSynergyDom(
  html: string,
  slugToKey: Map<string, string>,
  championKey: string,
  role: Role,
  patch: string,
  minGames: number
): NormalizedSynergyRow[]
```

---

## 8. `stats/index.ts` — Freshness Recording in `refreshBuildStats()`

The `refreshBuildStats()` helper gains two calls after its synergy result is processed:

```ts
// Success path (synergy rows returned):
if (synergy.length > 0 && deps.synergy) {
  deps.synergy.upsertSynergy(synergy)
  deps.synergy.markSynergyFetchRendered()   // NEW
  changed = true
}
// Catch block (rendering failed):
} catch (err) {
  console.warn(`build-stats refresh failed: ${(err as Error).message}`)
  deps.synergy?.markSynergyFetchError()     // NEW
  return false
}
```

The `StatsRefreshDeps` type doesn't change — `deps.synergy` already carries
`SynergyRepository`, and these methods are added there.

---

## 9. Entity Relationship Summary (additions to spec 001–003 ERD)

```
champion_synergy
  └── source TEXT  ← NEW: 'rendered' | 'static'

app_settings
  ├── last_synergy_fetch_at TEXT       ← NEW
  └── last_synergy_fetch_status TEXT   ← NEW

Recommendation (shared type)
  └── synergySource: SynergySource     ← NEW: 'rendered' | 'fallback'
```

The new `slugToKey` map needed by `LolalyticsPageRendererProvider` is built in
`main/index.ts` from the existing `idToKey` map and `ChampionsRepository.list()`:

```ts
const slugToKey = new Map<string, string>()
for (const champion of champions.list()) {
  slugToKey.set(champion.key.toLowerCase(), champion.key)  // 'ahri' → 'Ahri'
}
```
