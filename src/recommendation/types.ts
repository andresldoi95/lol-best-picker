import type { EloTier, Role } from '@shared/types'

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

// LCU ranked tiers → EloTier slugs (which match lolalytics' `&tier=` values, spec 007).
const LCU_TIER_TO_ELO: Readonly<Record<string, EloTier>> = {
  iron: 'iron',
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  platinum: 'platinum',
  emerald: 'emerald',
  diamond: 'diamond',
  master: 'master',
  grandmaster: 'grandmaster',
  challenger: 'challenger'
}

/** Normalize an LCU ranked tier (e.g. "EMERALD", "GOLD") to an `EloTier` (FR-008).
 *  `''`, `'NONE'`, `'UNRANKED'`, or anything unrecognized → `null`, so the caller
 *  falls back to the default tier (FR-009). */
export function normalizeLcuTier(tier: string | null | undefined): EloTier | null {
  if (!tier) return null
  return LCU_TIER_TO_ELO[tier.toLowerCase()] ?? null
}
