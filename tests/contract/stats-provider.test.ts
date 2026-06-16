import { describe, it, expect, afterEach } from 'vitest'
import type { StatsProvider, NormalizedChampionStat } from '@main/stats/statsProvider'
import { StatsRepository } from '@main/db/repositories/statsRepository'
import { computeRecommendation } from '@recommendation/engine'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'

const PATCH = '14.12'
const AHRI = 103
const ZED = 238

/** Test double — returns a fixed set of normalized rows (contracts/stats-provider.md). */
class FixtureStatsProvider implements StatsProvider {
  constructor(private readonly rows: NormalizedChampionStat[]) {}
  fetchChampionStats(): Promise<NormalizedChampionStat[]> {
    return Promise.resolve(this.rows)
  }
}

function overall(championKey: string, winRate: number, games: number): NormalizedChampionStat {
  return { championKey, role: 'MIDDLE', opponentChampionKey: null, winRate, gamesPlayed: games, patch: PATCH }
}
function matchup(
  championKey: string,
  opponentChampionKey: string,
  winRate: number,
  games: number
): NormalizedChampionStat {
  return { championKey, role: 'MIDDLE', opponentChampionKey, winRate, gamesPlayed: games, patch: PATCH }
}

describe('StatsProvider contract + repository persistence', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  function freshDb(): DB {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path, { stats: false }) // champions only — we control stats
    return db
  }

  it('(a) persists a normal mix of overall + matchup rows', async () => {
    const database = freshDb()
    const provider = new FixtureStatsProvider([
      overall('Ahri', 52, 1000),
      matchup('Ahri', 'Zed', 48, 200)
    ])
    const repo = new StatsRepository(database)

    const result = repo.upsertStats(await provider.fetchChampionStats())
    expect(result.upserted).toBe(2)

    const { rows, patch } = repo.getStatRowsForChampions([AHRI])
    expect(patch).toBe(PATCH)
    expect(rows).toHaveLength(2)
    expect(rows.some((r) => r.opponentChampionId === null && r.winRate === 52)).toBe(true)
    expect(rows.some((r) => r.opponentChampionId === ZED && r.winRate === 48)).toBe(true)
  })

  it('(b) handles an empty result set without persisting rows', async () => {
    const database = freshDb()
    const provider = new FixtureStatsProvider([])
    const repo = new StatsRepository(database)

    const result = repo.upsertStats(await provider.fetchChampionStats())
    expect(result.upserted).toBe(0)
    expect(repo.getStatRowsForChampions([AHRI]).rows).toHaveLength(0)
  })

  it('(c) engine falls back to the overall row when no matchup row exists (FR-017)', async () => {
    const database = freshDb()
    // Only an overall row for Ahri — no matchup vs the revealed enemy (Zed).
    const provider = new FixtureStatsProvider([overall('Ahri', 53, 800)])
    const repo = new StatsRepository(database)
    repo.upsertStats(await provider.fetchChampionStats())

    const { rows, patch } = repo.getStatRowsForChampions([AHRI])
    const rec = computeRecommendation({
      poolEntries: [
        {
          championId: AHRI,
          championKey: 'Ahri',
          championName: 'Ahri',
          iconPath: 'Ahri.png',
          role: 'MIDDLE',
          isActive: true
        }
      ],
      statRows: rows,
      role: 'MIDDLE',
      enemyChampionIds: [ZED],
      statsAsOfPatch: patch,
      freshness: { lastFetchAt: null, lastFetchStatus: null, thresholdHours: 24, now: new Date().toISOString() }
    })

    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]).toMatchObject({ championId: AHRI, score: 53, scoreBasis: 'overall' })
  })

  it('markFetchError flips status to error without touching cached rows', async () => {
    const database = freshDb()
    const repo = new StatsRepository(database)
    repo.upsertStats([overall('Ahri', 52, 1000)])
    repo.markFetchError()

    const status = (
      database.prepare('SELECT last_stats_fetch_status AS s FROM app_settings WHERE id = 1').get() as {
        s: string
      }
    ).s
    expect(status).toBe('error')
    expect(repo.getStatRowsForChampions([AHRI]).rows).toHaveLength(1) // untouched
  })
})
