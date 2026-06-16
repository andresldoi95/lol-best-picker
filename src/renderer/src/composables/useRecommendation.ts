import { ref, readonly } from 'vue'
import type { Recommendation } from '@shared/types'

// Shared reactive recommendation, kept in sync with main-process push events.
// Each entry carries its `scoreBreakdown` (enemyMatchupScore, allysSynergyScore,
// combinedScore, activeSignals) and the recommendation echoes `allyChampionIds`,
// so the score-breakdown panel (US3 / FR-009) reads everything from this ref.
const recommendation = ref<Recommendation | null>(null)
const loading = ref(false)
let unsubscribe: (() => void) | null = null

/** Fetch the current recommendation and (once) subscribe to live updates. */
async function load(): Promise<void> {
  loading.value = true
  try {
    recommendation.value = await window.api.recommendation.get()
  } finally {
    loading.value = false
  }
  if (!unsubscribe) {
    unsubscribe = window.api.recommendation.onUpdate((rec) => {
      recommendation.value = rec
    })
  }
}

export function useRecommendation() {
  return {
    recommendation: readonly(recommendation),
    loading: readonly(loading),
    load
  }
}
