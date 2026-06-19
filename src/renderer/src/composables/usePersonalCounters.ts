import { ref, readonly } from 'vue'
import type { PersonalCounterSet, Role } from '@shared/types'

/**
 * Module-level singleton composable for personal counters (spec 008 US2/US3), mirroring
 * `useBanRecommendations`. Holds the reactive counter set + the active role filter, and
 * (once) subscribes to `game:record-outcome` so an open view refreshes when a new game
 * is captured (US1 → US2 live update). The set already carries freshness/tier context
 * from main, so the UI reads everything from this one ref.
 */
const counterSet = ref<PersonalCounterSet | null>(null)
const loading = ref(false)
const selectedRole = ref<Role | null>(null)
let unsubscribe: (() => void) | null = null

async function fetchFor(role: Role | null): Promise<void> {
  loading.value = true
  selectedRole.value = role
  try {
    counterSet.value = await window.api.game.fetchCounters(role ? { role } : {})
  } finally {
    loading.value = false
  }
}

/** Initial fetch + (once) subscribe to live "game recorded" refreshes. */
async function load(): Promise<void> {
  await fetchFor(selectedRole.value)
  if (!unsubscribe) {
    unsubscribe = window.api.game.onRecordOutcome(() => {
      // Re-fetch for the currently-selected role so a freshly recorded game shows up.
      void fetchFor(selectedRole.value)
    })
  }
}

/** Change the role filter (null = all roles) and refetch (US3). */
async function setRole(role: Role | null): Promise<void> {
  await fetchFor(role)
}

export function usePersonalCounters() {
  return {
    counterSet: readonly(counterSet),
    loading: readonly(loading),
    selectedRole: readonly(selectedRole),
    load,
    setRole
  }
}
