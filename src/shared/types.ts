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

/** Supported interface languages. `'en'` is the default fallback (data-model.md
 *  § New Type: Language). Adding a language means extending this union, adding a
 *  catalog file, and widening the migration 003 CHECK constraint. */
export type Language = 'en' | 'es'

export interface AppSettings {
  manualRole: Role | null
  statsFreshnessHours: number
  lastStatsFetchAt: string | null
  lastStatsFetchStatus: FetchStatus | null
  /** User's selected interface language. Set on first launch from OS locale
   *  detection; thereafter reflects the user's explicit choice. Never null in the
   *  renderer (initialized before the window opens). */
  language: Language
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
  /** Locked-in ally picks (championId > 0), excluding the local player (spec 002 FR-001). */
  allyChampionIds: number[]
  /** ISO-8601 timestamp. */
  updatedAt: string
}

export type Freshness = 'live' | 'cached' | 'stale'

/** `'matchup'` = scored vs. revealed enemies; `'overall'` = no enemies revealed or
 *  FR-017 fallback to the overall row; `'combined'` = both enemy-matchup and
 *  ally-synergy signals were active (spec 002). */
export type ScoreBasis = 'matchup' | 'overall' | 'combined'

/** Which signal(s) contributed to a `RecommendationEntry`'s combined score (spec 002). */
export type ActiveSignal = 'enemy-matchup' | 'ally-synergy' | 'overall'

/** Per-entry breakdown of the two scoring signals, for the score-breakdown UI (US3, FR-009). */
export interface ScoreBreakdown {
  /** Enemy-matchup component: avg WR vs revealed enemies (or overall fallback). */
  enemyMatchupScore: number
  /** Ally-synergy component: avg WR with locked-in allies (or overall fallback). */
  allysSynergyScore: number
  /** Weighted aggregate = the entry's top-level `score`. 50% each when both active. */
  combinedScore: number
  /** Which signals contributed to `combinedScore`. */
  activeSignals: ActiveSignal[]
}

export interface RecommendationEntry {
  championId: number
  championKey: string
  championName: string
  iconPath: string
  role: Role
  /** Combined score (0–100) used for ranking. Was enemy-only WR in spec 001. */
  score: number
  scoreBasis: ScoreBasis
  /** True if `champions.is_active = 0` (FR-018) — included, not excluded. */
  isFlagged: boolean
  /** Full signal breakdown for the score-breakdown UI (spec 002 US3). */
  scoreBreakdown: ScoreBreakdown
}

export interface Recommendation {
  /** `null` when no role could be resolved → caller shows the role-selection prompt. */
  role: Role | null
  /** Ranked best → worst; empty array = FR-013 empty state. */
  entries: RecommendationEntry[]
  /** Context used for ranking (echoes the session). */
  enemyChampionIds: number[]
  /** Ally context used for ranking (echoes the session, spec 002). */
  allyChampionIds: number[]
  freshness: Freshness
  statsAsOfPatch: string
  /** ISO-8601 — drives the "last updated" indicator (FR-014). */
  lastUpdatedAt: string
}
