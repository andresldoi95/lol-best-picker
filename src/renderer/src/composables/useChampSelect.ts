import { ref, readonly } from 'vue'
import type { ChampSelectSession } from '@shared/types'

// Shared reactive champ-select session, kept in sync with main-process push events.
const session = ref<ChampSelectSession | null>(null)
let unsubscribe: (() => void) | null = null

/** Fetch the current session and (once) subscribe to live updates. */
async function load(): Promise<void> {
  session.value = await window.api.champSelect.getStatus()
  if (!unsubscribe) {
    unsubscribe = window.api.champSelect.onSessionUpdate((next) => {
      session.value = next
    })
  }
}

export function useChampSelect() {
  return {
    session: readonly(session),
    load
  }
}
