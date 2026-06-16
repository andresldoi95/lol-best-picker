<script setup lang="ts">
import { computed } from 'vue'
import type { Freshness } from '@shared/types'

const props = defineProps<{
  freshness: Freshness
  lastUpdatedAt: string
}>()

const config: Record<Freshness, { color: string; icon: string; label: string }> = {
  live: { color: 'success', icon: 'mdi-access-point', label: 'Live' },
  cached: { color: 'warning', icon: 'mdi-cloud-off-outline', label: 'Cached' },
  stale: { color: 'error', icon: 'mdi-clock-alert-outline', label: 'Stale' }
}

const current = computed(() => config[props.freshness])

const lastUpdatedText = computed(() => {
  const time = new Date(props.lastUpdatedAt).getTime()
  if (!Number.isFinite(time) || time <= 0) return 'never updated'

  const diffMs = Date.now() - time
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'updated just now'
  if (minutes < 60) return `updated ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `updated ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `updated ${days}d ago`
})

const absoluteTimestamp = computed(() => {
  const time = new Date(props.lastUpdatedAt).getTime()
  if (!Number.isFinite(time) || time <= 0) return 'No successful stats fetch yet'
  return new Date(props.lastUpdatedAt).toLocaleString()
})
</script>

<template>
  <div class="d-inline-flex align-center ga-2">
    <v-chip :color="current.color" size="small" variant="flat">
      <v-icon start :icon="current.icon" size="small" />
      {{ current.label }}
    </v-chip>
    <span class="text-caption text-medium-emphasis" :title="absoluteTimestamp">
      {{ lastUpdatedText }}
    </span>
  </div>
</template>
