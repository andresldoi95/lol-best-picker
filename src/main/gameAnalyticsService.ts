import { rankCounters, type CounterGameInput } from '@recommendation/counterAnalyzer'
import { deriveFreshness } from '@recommendation/freshness'
import type {
  CounterFilter,
  PersonalCounter,
  PersonalCounterSet
} from '@shared/types'
import type { CurrentElo } from './banRecommendationService'
import type { ChampionsRepository } from './db/repositories/championsRepository'
import type { GameRecordsRepository } from './db/repositories/gameRecordsRepository'
import type { SettingsRepository } from './db/repositories/settingsRepository'

/**
 * Orchestrates a personal-counter set (spec 008 US2): resolves the tier (explicit
 * request → current LCU tier) and role filter, reads the tier-scoped game records,
 * delegates ranking to the pure `counterAnalyzer`, enriches each counter with champion
 * name/icon, and annotates freshness + historical-context counts — the counters-side
 * analogue of `BanRecommendationService`. No scraping or wall-clock logic in the engine.
 */
export class GameAnalyticsService {
  constructor(
    private readonly gameRecords: GameRecordsRepository,
    private readonly champions: ChampionsRepository,
    private readonly settings: SettingsRepository,
    /** Supplies the current Elo (LCU-derived, or default fallback). */
    private readonly getCurrentElo: () => CurrentElo
  ) {}

  /** Champion key → { name, iconPath } for enriching key-only engine output. */
  private championDisplay(): Map<string, { name: string; iconPath: string }> {
    return new Map(
      this.champions.list().map((c) => [c.key, { name: c.name, iconPath: c.iconPath }])
    )
  }

  /**
   * Compute the counter set for the requested filter. Tier defaults to the current Elo;
   * role defaults to all roles. Counters are scoped to the chosen tier (clarification
   * Q1); `otherTierGames` surfaces how many recorded games fall in other tiers so the UI
   * can show the historical-context badge. Empty history → empty `counters` (FR-009).
   */
  getCounters(filter: CounterFilter = {}): PersonalCounterSet {
    const current = this.getCurrentElo()
    const eloTier = filter.tier ?? current.tier
    const eloResolved = filter.tier ? true : current.resolved
    const role = filter.role ?? null

    const tierRecords = this.gameRecords.getByTier(eloTier)
    const inputs: CounterGameInput[] = tierRecords.map((r) => ({
      enemyChampions: r.enemyChampions,
      playerRole: r.playerRole,
      result: r.result,
      timestamp: r.timestamp
    }))

    const display = this.championDisplay()
    const counters: PersonalCounter[] = rankCounters(inputs, { role }).map((c) => {
      const meta = display.get(c.opponentChampion)
      return {
        opponentChampion: c.opponentChampion,
        championName: meta?.name ?? c.opponentChampion,
        iconPath: meta?.iconPath ?? '',
        playerRole: c.playerRole,
        gamesPlayed: c.gamesPlayed,
        wins: c.wins,
        winRate: c.winRate,
        threatScore: c.threatScore,
        confidenceTier: c.confidenceTier,
        lastEncountered: c.lastEncountered
      }
    })

    const totalGamesRecorded = this.gameRecords.count()
    const gamesInTier = tierRecords.length

    const settings = this.settings.get()
    const now = new Date().toISOString()
    const freshness = deriveFreshness({
      lastFetchAt: settings.lastGameRecordFetchAt,
      // A recorded capture cycle is, by definition, a successful one (the recorder only
      // stamps the timestamp on success) — so freshness ages off the last capture.
      lastFetchStatus: settings.lastGameRecordFetchAt ? 'success' : null,
      thresholdHours: settings.statsFreshnessHours,
      now
    })

    return {
      counters,
      role,
      eloTier,
      eloResolved,
      totalGamesRecorded,
      gamesInTier,
      otherTierGames: Math.max(0, totalGamesRecorded - gamesInTier),
      freshness,
      lastUpdatedAt: settings.lastGameRecordFetchAt ?? now
    }
  }
}
