# Contract: Renderer ↔ Main IPC API (updated for spec 004)

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This document extends the IPC contracts from spec 001 and spec 002. Only **changed** or
**new** surfaces are described here. All unchanged channels and methods are omitted.

---

## Changed Types

### `AppSettings`

```ts
export interface AppSettings {
  // ... all existing fields unchanged ...
  lastSynergyFetchAt: string | null        // NEW — ISO-8601; null = never attempted
  lastSynergyFetchStatus: 'rendered' | 'error' | null   // NEW; null = never attempted
}
```

Returned by the existing `settings.get()` IPC handler — no new channel needed.
The renderer reads these fields to build the synergy source indicator independently
of the recommendation cycle.

### `Recommendation`

```ts
export interface Recommendation {
  role: Role | null
  entries: RecommendationEntry[]
  enemyChampionIds: number[]
  allyChampionIds: number[]
  freshness: Freshness
  statsAsOfPatch: string
  lastUpdatedAt: string
  synergySource: SynergySource   // NEW
}

export type SynergySource = 'rendered' | 'fallback'
```

`synergySource` values:
- `'rendered'` — the most recent synergy refresh cycle completed successfully via DOM
  extraction; ally synergy scores in `scoreBreakdown.allysSynergyScore` reflect live
  pair win rates (not the overall-WR fallback).
- `'fallback'` — no successful render on record (either never attempted or last
  attempt errored); ally scores use the overall win rate fallback per spec 002 FR-011.

---

## No New IPC Channels

All synergy data flows through the existing `recommendation:updated` push channel.
The new `synergySource` field is included in every `Recommendation` push from the
moment migration 004 is applied.

---

## Method → Requirement Traceability

| Change | Backing requirement |
|--------|---------------------|
| `AppSettings.lastSynergyFetchAt` | FR-007 (persistent storage), SC-004 (freshness indicator) |
| `AppSettings.lastSynergyFetchStatus` | SC-004 (rendered vs cached label) |
| `Recommendation.synergySource` | US3, FR-008 (source indicator), SC-004 |

---

## Backward Compatibility

- `synergySource: 'fallback'` is the correct default before any render succeeds,
  identical in behavior to the current state (overall-WR fallback). No feature
  regression on first launch.
- `AppSettings` fields default to `null` in migration 004; the renderer treats `null`
  the same as `'fallback'` (no successful render yet).
