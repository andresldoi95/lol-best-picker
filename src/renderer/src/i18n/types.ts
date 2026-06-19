/**
 * The translation catalog contract (data-model.md § New Entity: Catalog).
 *
 * Flat camelCase keys so `keyof Catalog` gives compile-time-checked lookups in
 * `t()`. Every language file (`en.ts`, `es.ts`) must `satisfies Catalog`, so a
 * missing key is a compile error — never a blank string at runtime.
 *
 * Tokens like `{role}`, `{score}`, `{status}`, `{time}`, `{n}` are placeholders
 * the calling component replaces (e.g. `t('poolEmptyRole').replace('{role}', …)`).
 */
export interface Catalog {
  // App shell / navigation
  navPool: string
  navChampSelect: string
  navBans: string
  navCounters: string
  navSettings: string

  // Roles (shared across Pool, Champ Select, Settings)
  roleTop: string
  roleJungle: string
  roleMiddle: string
  roleBottom: string
  roleSupport: string

  // Pool Management
  poolTitle: string
  poolSubtitle: string
  poolChampionLabel: string
  poolChampionPlaceholder: string
  poolAddButton: string
  poolInactiveChip: string
  poolEmptyRole: string
  poolRemoveAria: string
  poolRemoveAllAria: string

  // Champ Select
  champSelectTitle: string
  champSelectSubtitle: string
  champSelectLiveChip: string
  champSelectRoleOverrideLabel: string
  champSelectAutoDetect: string
  champSelectAlliesLockedIn: string
  champSelectEnemiesRevealed: string
  champSelectRolePrompt: string
  champSelectEmptyPool: string
  champSelectBestPick: string
  champSelectCombinedScore: string
  champSelectOverallWinRate: string
  champSelectEnemyMatchup: string
  champSelectAllySynergy: string
  champSelectNotAvailable: string
  champSelectInactiveChip: string
  champSelectSummaryOverall: string
  champSelectSummaryEnemy: string
  champSelectSummaryAlly: string
  champSelectSynergyLive: string
  champSelectSynergyEstimated: string
  champSelectInactiveTitle: string
  champSelectInactiveMessage: string

  // Settings
  settingsTitle: string
  settingsRoleOverrideTitle: string
  settingsRoleOverrideSubtitle: string
  settingsClearAutoDetect: string
  settingsFreshnessTitle: string
  settingsFreshnessSubtitle: string
  settingsFreshnessFieldLabel: string
  settingsSaveButton: string
  settingsLastFetchNever: string
  settingsLastFetchAt: string
  settingsStatusSuccess: string
  settingsStatusError: string
  settingsStatusUnknown: string
  settingsLanguageTitle: string
  settingsLanguageSubtitle: string

  // Ban Recommendations (spec 007)
  bansTitle: string
  bansSubtitle: string
  bansEloLabel: string
  bansEloDefault: string
  bansEmpty: string
  bansRoleEmpty: string
  banCardWinRate: string
  banCardWinRateShort: string
  banCardPickRate: string

  // Personal Counters (spec 008)
  countersTitle: string
  countersSubtitle: string
  countersAllRoles: string
  countersTierBadge: string
  countersOtherTierGames: string
  countersEmpty: string
  countersRoleEmpty: string
  counterGamesCount: string
  counterWinRate: string
  counterThreatScore: string
  counterConfidenceConfirmed: string
  counterConfidenceLikely: string
  counterConfidencePotential: string
  counterConfidenceTooltip: string
  countersHelpTitle: string
  countersHelpText: string

  // Freshness Indicator
  freshnessLive: string
  freshnessCached: string
  freshnessStale: string
  freshnessNeverUpdated: string
  freshnessJustNow: string
  freshnessMinutesAgo: string
  freshnessHoursAgo: string
  freshnessDaysAgo: string
  freshnessNoFetch: string
}
