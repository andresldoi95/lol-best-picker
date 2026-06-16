import type { ChampSelectPhase, ChampSelectSession } from '@shared/types'
import { normalizeLcuPosition } from '@recommendation/types'

/** Raw LCU `/lol-champ-select/v1/session` shape (subset we consume). */
export interface RawLcuTeamMember {
  cellId: number
  championId: number
  assignedPosition?: string
}

export interface RawLcuSession {
  myTeam?: RawLcuTeamMember[]
  theirTeam?: RawLcuTeamMember[]
  localPlayerCellId?: number
  timer?: { phase?: string }
}

function mapPhase(raw: string | undefined): ChampSelectPhase {
  switch ((raw ?? '').toUpperCase()) {
    case 'PLANNING':
    case 'BAN_PICK':
      return 'BAN_PICK'
    case 'FINALIZATION':
    case 'GAME_STARTING':
      return 'FINALIZATION'
    default:
      return 'NONE'
  }
}

/**
 * Pure normalization of a raw LCU champ-select session → the app's
 * `ChampSelectSession`. Used by both the live adapter and the contract-test
 * fixtures so the field mapping (incl. `utility` → SUPPORT, picks-not-bans) is
 * asserted in isolation.
 */
export function normalizeChampSelectSession(raw: RawLcuSession, now: string): ChampSelectSession {
  const localPlayerCellId =
    typeof raw.localPlayerCellId === 'number' ? raw.localPlayerCellId : null

  const local = (raw.myTeam ?? []).find((m) => m.cellId === localPlayerCellId)
  const assignedRole = normalizeLcuPosition(local?.assignedPosition)

  // Only locked-in enemy picks (championId > 0), never bans.
  const enemyChampionIds = (raw.theirTeam ?? [])
    .filter((m) => typeof m.championId === 'number' && m.championId > 0)
    .map((m) => m.championId)

  // Locked-in ally picks, excluding the local player (we recommend for them). A
  // hovering (not locked) ally has championId 0 and is excluded (research.md §1).
  const allyChampionIds = (raw.myTeam ?? [])
    .filter(
      (m) =>
        m.cellId !== localPlayerCellId &&
        typeof m.championId === 'number' &&
        m.championId > 0
    )
    .map((m) => m.championId)

  return {
    active: true,
    phase: mapPhase(raw.timer?.phase),
    assignedRole,
    localPlayerCellId,
    enemyChampionIds,
    allyChampionIds,
    updatedAt: now
  }
}

/** A default, inactive session (no live champ select / no client). */
export function inactiveSession(now: string): ChampSelectSession {
  return {
    active: false,
    phase: 'NONE',
    assignedRole: null,
    localPlayerCellId: null,
    enemyChampionIds: [],
    allyChampionIds: [],
    updatedAt: now
  }
}
