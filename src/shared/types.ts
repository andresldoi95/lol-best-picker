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

/** Ranked tiers used for ban statistics, matching lolalytics' `&tier=` slugs
 *  (spec 007). `'all'` = the all-ranks aggregate, used as the FR-009 fallback when
 *  the player's ranked tier can't be resolved from the LCU. */
export type EloTier =
  | 'all'
  | 'iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'challenger'

/** All Elo tiers, lowest → highest (the `'all'` aggregate first). */
export const ELO_TIERS: readonly EloTier[] = [
  'all',
  'iron',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
  'master',
  'grandmaster',
  'challenger'
]

export function isEloTier(value: unknown): value is EloTier {
  return typeof value === 'string' && (ELO_TIERS as readonly string[]).includes(value)
}

/** Default Elo tier when the player's ranked tier is unknown (FR-009). Matches
 *  lolalytics' own default bucket and the bundled seed-stats tier. */
export const DEFAULT_ELO_TIER: EloTier = 'emerald'

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

/** Outcome of the last ally-synergy DOM render attempt (spec 004). `'rendered'` =
 *  the hidden-BrowserWindow render produced live pair win rates; `'error'` = the
 *  attempt failed and the engine fell back to overall WR. `null` (in AppSettings)
 *  = never attempted. */
export type SynergyFetchStatus = 'rendered' | 'error'

/** Provenance of the ally-synergy signal backing a `Recommendation` (spec 004).
 *  `'rendered'` = scores reflect live pair win rates from the last successful render;
 *  `'fallback'` = no successful render on record (never attempted or last errored),
 *  so ally scores use the overall-WR fallback (spec 002 FR-011). */
export type SynergySource = 'rendered' | 'fallback'

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
  /** ISO-8601 timestamp of the last synergy render attempt; null = never attempted (spec 004). */
  lastSynergyFetchAt: string | null
  /** Outcome of the last synergy render attempt; null = never attempted (spec 004). */
  lastSynergyFetchStatus: SynergyFetchStatus | null
  /** ISO-8601 timestamp of the last ban-stats fetch; null = never attempted (spec 007). */
  lastBanStatsFetchAt: string | null
  /** Outcome of the last ban-stats fetch; null = never attempted (spec 007). */
  lastBanStatsFetchStatus: FetchStatus | null
  /** Last ranked tier resolved from the LCU (FR-008); null = never resolved → the
   *  app falls back to {@link DEFAULT_ELO_TIER} (FR-009). */
  currentEloTier: EloTier | null
  /** ISO-8601 timestamp of the last successful game-record capture cycle; null =
   *  never captured → counters view reads "stale" (spec 008). */
  lastGameRecordFetchAt: string | null
  /** Lowercase EloTier slug at the last capture cycle; null = never captured (spec 008). */
  lastGameRecordTier: EloTier | null
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
  /** Whether the ally-synergy signal came from a live render or the overall-WR
   *  fallback — drives the "Synergy: live / estimated" chip (spec 004 US3). */
  synergySource: SynergySource
}

/**
 * A single champion recommended to ban in a given role, ranked by win rate at the
 * player's Elo (spec 007 US1). Unlike `RecommendationEntry`, bans are NOT
 * pool-constrained — they span the whole meta (Constitution I is N/A for bans,
 * plan.md § Constitution Check).
 */
export interface BanRecommendation {
  championId: number
  championName: string
  iconPath: string
  role: Role
  /** Overall win rate at `eloTier`, e.g. 52.3 (%). */
  winRate: number
  /** Pick rate (presence) as a percentage. Real when from live data; an estimate
   *  derived from games-share when the source omitted it (e.g. bundled seed). */
  pickRate: number | null
  /** Ban-priority "threat" score = (winRate − 50) × pickRate (spec 007). Higher =
   *  more worth banning: a strong champion you'll actually face. Drives ranking. */
  banScore: number
  /** 1-based rank within the role (1 = strongest ban). */
  rank: number
}

/**
 * Full ban-recommendation payload returned to / pushed at the renderer (spec 007).
 * `recommendations` is a flat list spanning all five roles (ranked within each); the
 * UI groups it by `role`. Freshness mirrors the pick-recommendation pattern (US3).
 */
export interface BanRecommendationSet {
  /** Elo tier the bans were computed for. */
  eloTier: EloTier
  /** True when `eloTier` came from the LCU; false when it's the default fallback (FR-009). */
  eloResolved: boolean
  recommendations: BanRecommendation[]
  freshness: Freshness
  /** ISO-8601 — drives the freshness "last updated" indicator (US3). */
  lastUpdatedAt: string
}

/** Outcome of a single game, from the player's perspective (spec 008). */
export type GameResult = 'win' | 'loss'

/**
 * Sample-size confidence label for a personal counter (spec 008 US4 / FR-007). Keeps
 * low-sample outliers (a 0% win rate in 1 game) from reading as authoritative threats.
 *  - `'Potential'` — 1–2 games   · `'Likely'` — 3–9 games   · `'Confirmed'` — 10+ games
 */
export type ConfidenceTier = 'Potential' | 'Likely' | 'Confirmed'

/**
 * One completed game captured from LCU match history (spec 008 US1 / FR-001). Champion
 * fields are Data Dragon keys; `allied`/`enemy` exclude the player (stored separately).
 * Independent of the champion pool — a counter can be a champion the player doesn't own.
 */
export interface GameRecord {
  id: number
  /** Unix epoch ms when the game ended. Unique — dedupes re-captures. */
  timestamp: number
  /** The player's own champion (key). */
  playerChampion: string
  /** Champion-select role (authoritative, FR-010). */
  playerRole: Role
  /** The 4 ally champion keys (excludes the player), sorted. */
  alliedChampions: string[]
  /** The 5 enemy champion keys, sorted. */
  enemyChampions: string[]
  result: GameResult
  /** Normalized ranked tier at game time (lowercase EloTier slug). */
  playerTier: EloTier
  /** Unix epoch ms the row was inserted (auditing). */
  createdAt: number
}

/** A game record before persistence — no DB-assigned `id`/`createdAt` yet. */
export type NewGameRecord = Omit<GameRecord, 'id' | 'createdAt'>

/**
 * An opponent champion the player faces, scored as a personal threat (spec 008 US2).
 * Derived by aggregating {@link GameRecord}s — NOT from official stats — so a champion
 * with an average public win rate can still be this player's worst counter.
 */
export interface PersonalCounter {
  /** Opponent champion key, e.g. "Ahri". */
  opponentChampion: string
  championName: string
  iconPath: string
  /** Role the counts are scoped to; `null` = aggregated across all roles (FR-006). */
  playerRole: Role | null
  gamesPlayed: number
  wins: number
  /** Personal win rate vs. this opponent, 0–100 (FR-003). */
  winRate: number
  /** Threat score = (50 − winRate) × min(1, gamesPlayed/5) (FR-004). Higher = worse. */
  threatScore: number
  confidenceTier: ConfidenceTier
  /** Unix epoch ms of the most recent game vs. this opponent. */
  lastEncountered: number
}

/**
 * Full personal-counters payload returned over `game:fetch-counters` (spec 008 US2).
 * Counter data is scoped to the player's current tier; `otherTierGames` surfaces how
 * many recorded games fall in *other* tiers so the UI can show the historical-context
 * badge (clarification Q1 / FR edge case), while keeping the i18n string in the renderer.
 */
export interface PersonalCounterSet {
  /** Ranked best→worst (highest threat first); empty = no games (FR-009 empty state). */
  counters: PersonalCounter[]
  /** Role filter applied; `null` = all roles. */
  role: Role | null
  /** Tier the counters were computed for. */
  eloTier: EloTier
  /** True when `eloTier` came from the LCU; false when it's the default fallback. */
  eloResolved: boolean
  /** Total games recorded across all tiers (drives empty-state context). */
  totalGamesRecorded: number
  /** Games recorded at `eloTier` (the ones the counters are computed from). */
  gamesInTier: number
  /** Games recorded at other tiers (historical-context badge). */
  otherTierGames: number
  freshness: Freshness
  /** ISO-8601 — drives the "last updated" indicator (mirrors bans US3). */
  lastUpdatedAt: string
}

/** Optional filter for `game:fetch-counters`. Omitted fields fall back to the
 *  player's current role-agnostic / current-tier defaults resolved in main. */
export interface CounterFilter {
  role?: Role | null
  tier?: EloTier | null
}

/** Pushed to the renderer after a new game is captured (spec 008, `game:record-outcome`),
 *  so an open Personal Counters view can refresh live. */
export interface GameRecordedEvent {
  championKey: string
  role: Role
  result: GameResult
  timestamp: number
  tier: EloTier
}
