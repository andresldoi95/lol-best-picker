<script setup lang="ts">
import { computed } from 'vue'
import type { Freshness } from '@shared/types'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'

const props = defineProps<{
  freshness: Freshness
  lastUpdatedAt: string
}>()

const { t, d } = useLocale()

const config: Record<Freshness, { color: string; icon: string; labelKey: keyof Catalog }> = {
  live: { color: 'success', icon: 'mdi-access-point', labelKey: 'freshnessLive' },
  cached: { color: 'warning', icon: 'mdi-cloud-off-outline', labelKey: 'freshnessCached' },
  stale: { color: 'error', icon: 'mdi-clock-alert-outline', labelKey: 'freshnessStale' }
}

const current = computed(() => {
  const c = config[props.freshness]
  return { color: c.color, icon: c.icon, label: t(c.labelKey) }
})

const lastUpdatedText = computed(() => {
  const time = new Date(props.lastUpdatedAt).getTime()
  if (!Number.isFinite(time) || time <= 0) return t('freshnessNeverUpdated')

  const diffMs = Date.now() - time
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return t('freshnessJustNow')
  if (minutes < 60) return t('freshnessMinutesAgo').replace('{n}', String(minutes))
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('freshnessHoursAgo').replace('{n}', String(hours))
  const days = Math.floor(hours / 24)
  return t('freshnessDaysAgo').replace('{n}', String(days))
})

const absoluteTimestamp = computed(() => {
  const time = new Date(props.lastUpdatedAt).getTime()
  if (!Number.isFinite(time) || time <= 0) return t('freshnessNoFetch')
  return d(props.lastUpdatedAt)
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
