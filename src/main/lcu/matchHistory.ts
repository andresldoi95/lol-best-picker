import type { EloTier, NewGameRecord, Role } from '@shared/types'

/**
 * Pure parsing of LCU match-history payloads into `NewGameRecord`s (Principle IV — no
 * electron import, no I/O, no wall-clock). Used by the live `gameRecorder` and by tests
 * with fixture matches, so the field mapping (player identification, ally/enemy split,
 * role normalization, queue filtering) is asserted in isolation.
 *
 * Source: read-only GET `/lol-match-history/v1/products/lol/current-summoner/matches`
 * (Constitution II — no game automation, no memory access).
 */

/** Subset of an LCU match-history participant we consume. */
export interface RawMatchParticipant {
  participantId: number
  teamId: number
  championId: number
  /** `win` is normally a boolean, but some LCU payload versions send "Win"/"Fail". */
  stats?: { win?: boolean | string }
  /** LCU calls these `lane` (TOP/JUNGLE/MIDDLE/BOTTOM/NONE) and `role`
   *  (SOLO/DUO_CARRY/DUO_SUPPORT/NONE). Used only as a fallback for the role. */
  timeline?: { lane?: string; role?: string }
}

export interface RawMatchIdentity {
  participantId: number
  player?: { puuid?: string }
}

export interface RawMatch {
  gameId: number
  /** Unix epoch ms the game was created. */
  gameCreation?: number
  /** ISO-8601 alternative to `gameCreation` in some payload versions. */
  gameCreationDate?: string
  queueId?: number
  participants: RawMatchParticipant[]
  participantIdentities?: RawMatchIdentity[]
}

/** The match-history list envelope: `{ games: { games: [...] } }`. */
export interface RawMatchList {
  games?: { games?: RawMatch[] }
}

/**
 * Queues in scope for v1: Ranked Solo/Duo (420), Ranked Flex (440), Normal Draft (400),
 * Normal Blind (430), Quickplay (490). ARAM/URF/Clash/custom are excluded (spec 008
 * Assumptions — "Ranked and Normal games" only).
 */
export const SUPPORTED_QUEUE_IDS: ReadonlySet<number> = new Set([400, 420, 430, 440, 490])

export function isSupportedQueue(queueId: number | undefined): boolean {
  return typeof queueId === 'number' && SUPPORTED_QUEUE_IDS.has(queueId)
}

/**
 * Map an LCU match `timeline.lane` + `timeline.role` to a canonical `Role`. Only used
 * as a fallback when the authoritative champion-select role is unavailable (FR-010).
 * The bottom lane splits on role: DUO_SUPPORT → SUPPORT, otherwise BOTTOM.
 */
export function normalizeMatchPosition(
  lane: string | undefined,
  role: string | undefined
): Role | null {
  switch ((lane ?? '').toUpperCase()) {
    case 'TOP':
      return 'TOP'
    case 'JUNGLE':
      return 'JUNGLE'
    case 'MIDDLE':
    case 'MID':
      return 'MIDDLE'
    case 'BOTTOM':
    case 'BOT':
      return (role ?? '').toUpperCase() === 'DUO_SUPPORT' ? 'SUPPORT' : 'BOTTOM'
    default:
      return null
  }
}

/** Pull the raw match array out of the list envelope (`null`-safe). */
export function extractMatches(list: RawMatchList | null | undefined): RawMatch[] {
  return list?.games?.games ?? []
}

function gameTimestamp(match: RawMatch): number | null {
  if (typeof match.gameCreation === 'number' && Number.isFinite(match.gameCreation)) {
    return match.gameCreation
  }
  if (match.gameCreationDate) {
    const ms = Date.parse(match.gameCreationDate)
    if (Number.isFinite(ms)) return ms
  }
  return null
}

export interface BuildGameRecordArgs {
  match: RawMatch
  /** PUUID of the current summoner, to locate the player in the match. */
  puuid: string
  /** Normalized tier to stamp on the record (resolved from the LCU / current Elo). */
  tier: EloTier
  /** Champion id → Data Dragon key resolver. */
  idToKey: Map<number, string>
  /** Champion-select role to prefer over the match's recorded lane (FR-010). */
  assignedRole?: Role | null
}

/**
 * Build a {@link NewGameRecord} for the player identified by `puuid` from a raw LCU
 * match. Returns `null` when the match is out of scope or can't be parsed cleanly:
 * unsupported queue, player not found, unknown champion key, a role that can't be
 * resolved, an unusable timestamp, or unexpected team sizes (≠4 allies / ≠5 enemies).
 * Champion lists are sorted alphabetically for stable storage (data-model.md).
 */
export function buildGameRecord(args: BuildGameRecordArgs): NewGameRecord | null {
  const { match, puuid, tier, idToKey, assignedRole } = args
  if (!isSupportedQueue(match.queueId)) return null

  const timestamp = gameTimestamp(match)
  if (timestamp === null) return null

  const identity = (match.participantIdentities ?? []).find((i) => i.player?.puuid === puuid)
  if (!identity) return null
  const me = match.participants.find((p) => p.participantId === identity.participantId)
  if (!me) return null

  const playerChampion = idToKey.get(me.championId)
  if (!playerChampion) return null

  const role = assignedRole ?? normalizeMatchPosition(me.timeline?.lane, me.timeline?.role)
  if (!role) return null

  const allied: string[] = []
  const enemy: string[] = []
  for (const p of match.participants) {
    if (p.participantId === me.participantId) continue
    const key = idToKey.get(p.championId)
    if (!key) return null // can't form a complete record with an unknown champion
    if (p.teamId === me.teamId) allied.push(key)
    else enemy.push(key)
  }
  if (allied.length !== 4 || enemy.length !== 5) return null

  return {
    timestamp,
    playerChampion,
    playerRole: role,
    alliedChampions: allied.sort((a, b) => a.localeCompare(b)),
    enemyChampions: enemy.sort((a, b) => a.localeCompare(b)),
    result: isWin(me.stats?.win) ? 'win' : 'loss',
    playerTier: tier
  }
}

/** Normalize the participant's win flag, tolerating both boolean and "Win"/"Fail". */
function isWin(win: boolean | string | undefined): boolean {
  if (typeof win === 'string') return win.toLowerCase() === 'win'
  return win === true
}
