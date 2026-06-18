# Contract: LolalyticsPageRendererProvider

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This document defines the interface contract for `LolalyticsPageRendererProvider`,
the Electron-BrowserWindow-backed synergy data provider introduced in spec 004.

---

## Purpose

`LolalyticsPageRendererProvider` is a `BuildStatsProvider` that fetches both enemy
matchup data and ally synergy data for a given set of pool champion-role targets. It:

1. Delegates enemy matchup fetching to the existing `LolalyticsMatchupProvider`
   (unchanged static Qwik JSON parsing).
2. Renders each target's build page in a hidden Electron `BrowserWindow`, waits for
   the synergy table to populate, then extracts ally synergy win rates from the DOM.
3. Returns a merged `BuildStats` object.

It is a **drop-in replacement** for `LolalyticsMatchupProvider` in `main/index.ts`.

---

## Implemented Interface

```ts
import type { BuildStats, BuildStatsProvider, SynergyProviderTarget } from '../synergyProvider'

class LolalyticsPageRendererProvider implements BuildStatsProvider {
  fetchBuildStats(targets: SynergyProviderTarget[]): Promise<BuildStats>
}
```

`BuildStats` is defined in `src/main/stats/synergyProvider.ts`:
```ts
interface BuildStats {
  matchups: NormalizedChampionStat[]  // enemy matchup rows
  synergy: NormalizedSynergyRow[]     // ally synergy rows (new: source = 'rendered')
}
```

---

## Constructor

```ts
new LolalyticsPageRendererProvider(options: LolalyticsPageRendererOptions)
```

Where `LolalyticsPageRendererOptions` extends `LolalyticsMatchupProviderOptions` with:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `slugToKey` | `Map<string, string>` | required | lowercase slug → Data Dragon key |
| `renderTimeoutMs` | `number` | `5000` | Max ms to wait per champion for synergy table |
| `pollIntervalMs` | `number` | `250` | DOM polling interval while waiting |

All fields from `LolalyticsMatchupProviderOptions` (`idToKey`, `keyToId`, `tier`,
`minGames`, `baseUrl`, `ddragonVersionsUrl`, `userAgent`, `fetchImpl`) are inherited.

---

## `fetchBuildStats()` Behavior

### Normal path (rendering succeeds)

1. Creates one hidden `BrowserWindow` with `session.fromPartition('persist:synergy-render')`.
2. For each target (sequential — never concurrent):
   a. Navigates to `{baseUrl}/lol/{slug}/build/?lane={lane}&tier={tier}`.
   b. Waits for `dom-ready`, then polls every `pollIntervalMs` for the synergy table.
   c. On detection: calls `webContents.executeJavaScript(extractionScript)` to extract
      DOM rows, parses them with `parseSynergyDom()`.
   d. On timeout: logs a warning, records `[]` for that target.
3. Destroys the BrowserWindow.
4. Calls the wrapped `LolalyticsMatchupProvider.fetchBuildStats(targets)` for enemy matchups.
5. Returns `{ matchups, synergy }` merged from both.

### Error handling

| Condition | Behavior |
|-----------|----------|
| BrowserWindow creation fails | Log error; return `{ matchups: [...], synergy: [] }` |
| Page navigation fails (HTTP error, network down) | Log warning; skip target; continue |
| Synergy table not found within `renderTimeoutMs` | Log warning; `[]` for that target |
| `executeJavaScript()` throws | Log warning; `[]` for that target |
| `parseSynergyDom()` returns `[]` (unknown slugs, no rows) | Return `[]`; no error |
| Wrapped matchup provider throws | Re-throw (callers already handle this) |

Per-target failures are silent (warning-logged) and never prevent other targets from
being processed. A partial result is preferable to an all-or-nothing failure.

---

## `parseSynergyDom()` — Exported Pure Function

```ts
export function parseSynergyDom(
  html: string,
  slugToKey: Map<string, string>,
  championKey: string,
  role: Role,
  patch: string,
  minGames: number
): NormalizedSynergyRow[]
```

**Contract**:
- **Input**: fully rendered page HTML (as returned by `executeJavaScript('document.documentElement.outerHTML')`)
- **Returns**: zero or more `NormalizedSynergyRow[]` with `source: 'rendered'`, win rates
  clamped to `[0, 100]`, `gamesPlayed ≥ 0`
- **Never throws**: all parse errors are swallowed and logged; returns `[]` on any failure
- **Excludes**: rows where `allyChampionKey === championKey` (self), unknown slugs, or
  `gamesPlayed < minGames`
- **No Electron imports**: pure function, runnable in Vitest without mocking

---

## IPC Surface Changes

`LolalyticsPageRendererProvider` adds no new IPC channels. Its output flows through
the existing `synergy` data path in `startStatsRefresh()`:
`upsertSynergy(rows)` → `getSynergyRowsForChampions()` → `computeRecommendation()`
→ `recommendation:updated` IPC push.

The new `Recommendation.synergySource` field is the only IPC surface change
(see `ipc-api.md`).

---

## Wiring in `main/index.ts`

```ts
const slugToKey = new Map<string, string>()
for (const champion of champions.list()) {
  slugToKey.set(champion.key.toLowerCase(), champion.key)
}

// Replace: const synergyProvider = new LolalyticsMatchupProvider({ idToKey, keyToId })
const synergyProvider = new LolalyticsPageRendererProvider({ idToKey, keyToId, slugToKey })

startStatsRefresh({ provider, stats, settings, synergyProvider, synergy, getSynergyTargets, onRefreshed })
```

---

## Test Coverage

| Test | Location | Type |
|------|----------|------|
| `parseSynergyDom()` — valid rows | `tests/unit/stats/lolalyticsPageRendererProvider.test.ts` | Unit |
| `parseSynergyDom()` — empty table | Same | Unit |
| `parseSynergyDom()` — unknown slug skipped | Same | Unit |
| `parseSynergyDom()` — below minGames skipped | Same | Unit |
| `parseSynergyDom()` — self excluded | Same | Unit |
| `LolalyticsPageRendererProvider` end-to-end | Manual checklist (`quickstart.md`) | Manual |
