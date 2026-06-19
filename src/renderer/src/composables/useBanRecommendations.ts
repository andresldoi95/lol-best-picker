import { ref, readonly } from 'vue'
import type { BanRecommendationSet } from '@shared/types'

// Shared reactive ban-recommendation set, kept in sync with main-process push
// events (spec 007 US1/US3). The set already carries `freshness` and `eloTier`
// (derived in main), so the UI reads everything it needs from this one ref.
const banSet = ref<BanRecommendationSet | null>(null)
const loading = ref(false)
let unsubscribe: (() => void) | null = null

/** Fetch the current ban recommendations and (once) subscribe to live updates.
 *  Elo is resolved in main (LCU tier or default), so the renderer passes none. */
async function load(): Promise<void> {
  loading.value = true
  try {
    banSet.value = await window.api.ban.fetchRecommendations()
  } finally {
    loading.value = false
  }
  if (!unsubscribe) {
    unsubscribe = window.api.ban.onUpdate((set) => {
      banSet.value = set
    })
  }
}

export function useBanRecommendations() {
  return {
    banSet: readonly(banSet),
    loading: readonly(loading),
    load
  }
}
