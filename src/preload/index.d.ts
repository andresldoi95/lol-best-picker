import type {
  AppSettings,
  BanRecommendationSet,
  ChampSelectSession,
  ChampionSummary,
  CounterFilter,
  EloTier,
  GameRecordedEvent,
  Language,
  PersonalCounterSet,
  PoolEntryView,
  Recommendation,
  Role
} from '@shared/types'

export type UnsubscribeFn = () => void

/** The typed surface exposed on `window.api` by the preload (contracts/ipc-api.md). */
export interface Api {
  pool: {
    list(): Promise<PoolEntryView[]>
    add(championId: number, role: Role): Promise<void>
    remove(championId: number, role: Role): Promise<void>
    removeAllRoles(championId: number): Promise<void>
  }
  champions: {
    list(): Promise<ChampionSummary[]>
  }
  recommendation: {
    get(): Promise<Recommendation>
    onUpdate(callback: (rec: Recommendation) => void): UnsubscribeFn
  }
  champSelect: {
    getStatus(): Promise<ChampSelectSession>
    onSessionUpdate(callback: (session: ChampSelectSession) => void): UnsubscribeFn
  }
  settings: {
    get(): Promise<AppSettings>
    setManualRole(role: Role | null): Promise<void>
    setStatsFreshnessHours(hours: number): Promise<void>
    setLanguage(language: Language): Promise<void>
  }
  ban: {
    fetchRecommendations(elo?: EloTier): Promise<BanRecommendationSet>
    onUpdate(callback: (bans: BanRecommendationSet) => void): UnsubscribeFn
  }
  game: {
    fetchCounters(filter?: CounterFilter): Promise<PersonalCounterSet>
    onRecordOutcome(callback: (event: GameRecordedEvent) => void): UnsubscribeFn
  }
}

declare global {
  interface Window {
    api: Api
  }
}
