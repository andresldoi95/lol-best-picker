import { ref, readonly } from 'vue'
import type { ChampionSummary, PoolEntryView, Role } from '@shared/types'

// Module-level singletons: a single shared reactive pool/champion list across the
// app, populated via the preload IPC bridge (no Pinia — research.md §4).
const pool = ref<PoolEntryView[]>([])
const champions = ref<ChampionSummary[]>([])
const loaded = ref(false)
const loading = ref(false)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [poolEntries, championList] = await Promise.all([
      window.api.pool.list(),
      window.api.champions.list()
    ])
    pool.value = poolEntries
    champions.value = championList
    loaded.value = true
  } finally {
    loading.value = false
  }
}

async function addToPool(championId: number, role: Role): Promise<void> {
  await window.api.pool.add(championId, role)
  await refresh()
}

async function removeFromPool(championId: number, role: Role): Promise<void> {
  await window.api.pool.remove(championId, role)
  await refresh()
}

async function removeAllRoles(championId: number): Promise<void> {
  await window.api.pool.removeAllRoles(championId)
  await refresh()
}

export function usePool() {
  return {
    pool: readonly(pool),
    champions: readonly(champions),
    loaded: readonly(loaded),
    loading: readonly(loading),
    refresh,
    addToPool,
    removeFromPool,
    removeAllRoles
  }
}
