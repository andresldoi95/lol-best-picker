import type { Catalog } from './types'

/**
 * English message catalog — the authoritative source from which other languages
 * are derived. `satisfies Catalog` enforces that every key is present.
 */
export const en = {
  // App shell / navigation
  navPool: 'Pool',
  navChampSelect: 'Champ Select',
  navBans: 'Bans',
  navSettings: 'Settings',

  // Roles
  roleTop: 'Top',
  roleJungle: 'Jungle',
  roleMiddle: 'Middle',
  roleBottom: 'Bottom',
  roleSupport: 'Support',

  // Pool Management
  poolTitle: 'Champion Pool',
  poolSubtitle:
    'Tag the champions you actually play by role. Recommendations are drawn only from this pool.',
  poolChampionLabel: 'Champion',
  poolChampionPlaceholder: 'Search a champion…',
  poolAddButton: 'Add',
  poolInactiveChip: 'inactive',
  poolEmptyRole: 'No champions tagged for {role} yet.',
  poolRemoveAria: 'Remove {champion} from {role}',
  poolRemoveAllAria: 'Remove {champion} from all roles',

  // Champ Select
  champSelectTitle: 'Champion Select',
  champSelectSubtitle: 'Best pick from your pool for the active role, ranked by win rate.',
  champSelectLiveChip: 'Live',
  champSelectRoleOverrideLabel: 'Role (overrides auto-detection)',
  champSelectAutoDetect: 'Auto-detect',
  champSelectAlliesLockedIn: 'Allies locked in',
  champSelectEnemiesRevealed: 'Enemies revealed',
  champSelectRolePrompt: 'Select your role above to see recommendations from your pool.',
  champSelectEmptyPool: 'No champions in your pool for {role}. Add some on the Pool tab.',
  champSelectBestPick: 'Best Pick',
  champSelectCombinedScore: '{score} combined score',
  champSelectOverallWinRate: 'Overall win rate',
  champSelectEnemyMatchup: 'Enemy matchup',
  champSelectAllySynergy: 'Ally synergy',
  champSelectNotAvailable: 'Not available',
  champSelectInactiveChip: 'inactive',
  champSelectSummaryOverall: 'Overall',
  champSelectSummaryEnemy: 'Enemy',
  champSelectSummaryAlly: 'Ally',
  champSelectSynergyLive: 'Synergy: live',
  champSelectSynergyEstimated: 'Synergy: estimated',
  champSelectInactiveTitle: 'Champion Select Inactive',
  champSelectInactiveMessage:
    'Start a League of Legends game to see champion recommendations.',

  // Settings
  settingsTitle: 'Settings',
  settingsRoleOverrideTitle: 'Role Override',
  settingsRoleOverrideSubtitle:
    "Force recommendations to a specific role when auto-detection isn't available (FR-007).",
  settingsClearAutoDetect: 'Clear (auto-detect role)',
  settingsFreshnessTitle: 'Statistics Freshness',
  settingsFreshnessSubtitle:
    'How long cached stats stay "live" before they\'re marked stale (research.md §5).',
  settingsFreshnessFieldLabel: 'Freshness threshold (hours)',
  settingsSaveButton: 'Save',
  settingsLastFetchNever:
    'No live stats fetch has succeeded yet — using bundled/cached data.',
  settingsLastFetchAt: 'Last fetch {status} at {time}.',
  settingsStatusSuccess: 'success',
  settingsStatusError: 'error',
  settingsStatusUnknown: 'unknown',
  settingsLanguageTitle: 'Language',
  settingsLanguageSubtitle: 'Choose the language for the app interface.',

  // Ban Recommendations (spec 007)
  bansTitle: 'Recommended Bans',
  bansSubtitle: 'The strongest champions to ban in each role at your Elo, ranked by win rate.',
  bansEloLabel: 'Elo: {elo}',
  bansEloDefault: 'default',
  bansEmpty: 'No ban data available yet. Check back once stats have loaded.',
  bansRoleEmpty: 'No data',
  banCardWinRate: '{wr}% win rate',
  banCardWinRateShort: '{wr}% WR',
  banCardPickRate: '{pr}% pick',

  // Freshness Indicator
  freshnessLive: 'Live',
  freshnessCached: 'Cached',
  freshnessStale: 'Stale',
  freshnessNeverUpdated: 'never updated',
  freshnessJustNow: 'updated just now',
  freshnessMinutesAgo: 'updated {n}m ago',
  freshnessHoursAgo: 'updated {n}h ago',
  freshnessDaysAgo: 'updated {n}d ago',
  freshnessNoFetch: 'No successful stats fetch yet'
} satisfies Catalog
