import type { ConfidenceTier } from '@shared/types'

/**
 * Renderer-facing types + presentation helpers for personal counters (spec 008). The
 * data shapes are owned by `@shared/types`; this module re-exports them for convenient
 * local imports and adds pure UI helpers (kept here, not in a `.vue`, so they stay
 * unit-testable in the Node test env like `useLocale`).
 */
export type {
  ConfidenceTier,
  CounterFilter,
  PersonalCounter,
  PersonalCounterSet
} from '@shared/types'

/** Vuetify color for a confidence tier (US4): Confirmed = danger red, Likely = warning
 *  orange, Potential = info blue — escalating visual weight with sample size. */
export function confidenceColor(tier: ConfidenceTier): 'error' | 'warning' | 'info' {
  switch (tier) {
    case 'Confirmed':
      return 'error'
    case 'Likely':
      return 'warning'
    default:
      return 'info'
  }
}
