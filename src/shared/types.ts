/**
 * Canonical shared types for LoL Best Picker.
 *
 * This module contains ONLY type declarations and small constant tables — no
 * executable side effects, no imports from electron/vue/vuetify. It is imported
 * by `main`, `preload`, `recommendation`, and the renderer (Principle IV / secure
 * IPC practice).
 */

/** The five canonical roles used throughout the codebase. LCU's `utility` and
 *  u.gg's `support`/`adc`/`mid` slugs are normalized to this enum at the
 *  integration boundary (see `src/recommendation/types.ts`). */
export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'SUPPORT'

/** Ordered list of all roles — drives role selectors and toggle chips in the UI. */
export const ROLES: readonly Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'SUPPORT']

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** Static champion identity/metadata (from Data Dragon, cached in SQLite). */
export interface ChampionSummary {
  championId: number
  key: string
  name: string
  iconPath: string
  isActive: boolean
}

/** A single (champion, role) pool entry, joined with champion metadata for the UI. */
export interface PoolEntryView extends ChampionSummary {
  role: Role
  /** === !isActive, surfaced for UI convenience (FR-018). */
  isFlagged: boolean
  /** ISO-8601 timestamp. */
  addedAt: string
}

export type FetchStatus = 'success' | 'error'

export interface AppSettings {
  manualRole: Role | null
  statsFreshnessHours: number
  lastStatsFetchAt: string | null
  lastStatsFetchStatus: FetchStatus | null
}

export type ChampSelectPhase = 'NONE' | 'BAN_PICK' | 'FINALIZATION'

/** Normalized champion-select state pushed from main → renderer. */
export interface ChampSelectSession {
  active: boolean
  phase: ChampSelectPhase
  /** From LCU `assignedPosition`, normalized; `null` triggers manual selection (FR-007). */
  assignedRole: Role | null
  localPlayerCellId: number | null
  /** Revealed enemy picks only (locked-in), never bans. */
  enemyChampionIds: number[]
  /** ISO-8601 timestamp. */
  updatedAt: string
}

export type Freshness = 'live' | 'cached' | 'stale'

/** `'matchup'` = scored vs. revealed enemies; `'overall'` = no enemies revealed or
 *  FR-017 fallback to the overall row. */
export type ScoreBasis = 'matchup' | 'overall'

export interface RecommendationEntry {
  championId: number
  championKey: string
  championName: string
  iconPath: string
  role: Role
  /** Win-rate percentage used for ranking. */
  score: number
  scoreBasis: ScoreBasis
  /** True if `champions.is_active = 0` (FR-018) — included, not excluded. */
  isFlagged: boolean
}

export interface Recommendation {
  /** `null` when no role could be resolved → caller shows the role-selection prompt. */
  role: Role | null
  /** Ranked best → worst; empty array = FR-013 empty state. */
  entries: RecommendationEntry[]
  /** Context used for ranking (echoes the session). */
  enemyChampionIds: number[]
  freshness: Freshness
  statsAsOfPatch: string
  /** ISO-8601 — drives the "last updated" indicator (FR-014). */
  lastUpdatedAt: string
}
