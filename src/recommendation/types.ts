import type { Role } from '@shared/types'

/**
 * Role-name normalization tables (Principle IV — zero electron/vue imports).
 * The recommendation engine and DB only ever deal with the canonical `Role`
 * enum; raw LCU/u.gg role strings are mapped here at the integration boundary.
 */

// LCU `assignedPosition`: lowercase, and crucially `utility` means Support.
const LCU_POSITION_TO_ROLE: Readonly<Record<string, Role>> = {
  top: 'TOP',
  jungle: 'JUNGLE',
  middle: 'MIDDLE',
  mid: 'MIDDLE',
  bottom: 'BOTTOM',
  utility: 'SUPPORT'
}

/** Normalize an LCU `assignedPosition` to a `Role`; `''`/unrecognized → `null`. */
export function normalizeLcuPosition(position: string | null | undefined): Role | null {
  if (!position) return null
  return LCU_POSITION_TO_ROLE[position.toLowerCase()] ?? null
}

// u.gg role slugs.
const UGG_SLUG_TO_ROLE: Readonly<Record<string, Role>> = {
  top: 'TOP',
  jungle: 'JUNGLE',
  jgl: 'JUNGLE',
  mid: 'MIDDLE',
  middle: 'MIDDLE',
  adc: 'BOTTOM',
  bot: 'BOTTOM',
  bottom: 'BOTTOM',
  sup: 'SUPPORT',
  supp: 'SUPPORT',
  support: 'SUPPORT'
}

/** Normalize a u.gg role slug to a `Role`; unrecognized → `null`. */
export function normalizeUggRole(slug: string | null | undefined): Role | null {
  if (!slug) return null
  return UGG_SLUG_TO_ROLE[slug.toLowerCase()] ?? null
}
