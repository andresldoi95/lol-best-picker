import type { StatsProvider, NormalizedChampionStat } from './statsProvider'
import { normalizeUggRole } from '@recommendation/types'

export interface UggStatsProviderOptions {
  /** Resolves u.gg's internal numeric champion id → Data Dragon slug. */
  idToKey: Map<number, string>
  /** Current patch label, e.g. "14.12". */
  patch: string
  /**
   * Endpoint returning u.gg's per-champion aggregate JSON. u.gg has no documented
   * public API and its data-feed paths change between patches, so this MUST be
   * verified against the live feed at build time (research.md §1). The response is
   * validated/normalized below — upstream shape is never trusted blindly.
   */
  endpoint: string
  fetchImpl?: typeof fetch
  userAgent?: string
}

interface RawMatchup {
  opponentChampionId?: number
  winRate?: number
  games?: number
}

interface RawUggEntry {
  championId?: number
  role?: string
  winRate?: number
  games?: number
  matchups?: RawMatchup[]
}

const DEFAULT_USER_AGENT = 'LoLBestPicker/0.1 (local desktop tool; anonymous aggregate stats)'

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n))
}

function toGames(n: unknown): number {
  return typeof n === 'number' && n >= 0 ? Math.floor(n) : 0
}

/**
 * u.gg-backed `StatsProvider`. Anonymous GET with a descriptive User-Agent, no
 * credentials/cookies. Throws on network error, non-200, malformed shape, or an
 * empty result so the repository can downgrade freshness instead of persisting
 * partial bad data (contracts/stats-provider.md).
 */
export class UggStatsProvider implements StatsProvider {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: UggStatsProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async fetchChampionStats(): Promise<NormalizedChampionStat[]> {
    let response: Response
    try {
      response = await this.fetchImpl(this.options.endpoint, {
        headers: {
          'User-Agent': this.options.userAgent ?? DEFAULT_USER_AGENT,
          Accept: 'application/json'
        }
      })
    } catch (err) {
      throw new Error(`u.gg request failed: ${(err as Error).message}`)
    }

    if (!response.ok) throw new Error(`u.gg returned HTTP ${response.status}`)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('u.gg returned a non-JSON body')
    }
    if (!Array.isArray(body)) throw new Error('u.gg response shape invalid: expected an array')

    const out: NormalizedChampionStat[] = []
    for (const raw of body as RawUggEntry[]) {
      const championKey =
        typeof raw.championId === 'number' ? this.options.idToKey.get(raw.championId) : undefined
      const role = normalizeUggRole(raw.role)
      if (!championKey || !role || typeof raw.winRate !== 'number') continue

      out.push({
        championKey,
        role,
        opponentChampionKey: null,
        winRate: clampPercent(raw.winRate),
        gamesPlayed: toGames(raw.games),
        patch: this.options.patch
      })

      for (const matchup of raw.matchups ?? []) {
        const opponentKey =
          typeof matchup.opponentChampionId === 'number'
            ? this.options.idToKey.get(matchup.opponentChampionId)
            : undefined
        if (!opponentKey || typeof matchup.winRate !== 'number') continue
        out.push({
          championKey,
          role,
          opponentChampionKey: opponentKey,
          winRate: clampPercent(matchup.winRate),
          gamesPlayed: toGames(matchup.games),
          patch: this.options.patch
        })
      }
    }

    if (out.length === 0) throw new Error('u.gg returned no usable stat rows')
    return out
  }
}
