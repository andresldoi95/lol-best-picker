<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ROLES, type BanRecommendation, type Role } from '@shared/types'
import { useBanRecommendations } from '@renderer/composables/useBanRecommendations'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'
import FreshnessIndicator from '@renderer/components/FreshnessIndicator.vue'
import BanRecommendationCard from '@renderer/components/BanRecommendationCard.vue'

const { banSet, loading, load } = useBanRecommendations()
const { t } = useLocale()

onMounted(() => {
  void load()
})

const roleLabelKeys: Record<Role, keyof Catalog> = {
  TOP: 'roleTop',
  JUNGLE: 'roleJungle',
  MIDDLE: 'roleMiddle',
  BOTTOM: 'roleBottom',
  SUPPORT: 'roleSupport'
}
const roleLabel = (role: Role): string => t(roleLabelKeys[role])

// Group the flat ranked list into the five role columns (US1 — all roles shown
// regardless of the user's assigned role).
const byRole = computed<Record<Role, BanRecommendation[]>>(() => {
  const map = {} as Record<Role, BanRecommendation[]>
  for (const role of ROLES) map[role] = []
  for (const ban of banSet.value?.recommendations ?? []) map[ban.role].push(ban)
  return map
})

const hasAny = computed(() => (banSet.value?.recommendations.length ?? 0) > 0)

// Capitalized tier slug, e.g. "emerald" → "Emerald" (FR-009 — show which Elo, and
// flag when it's the default fallback rather than the player's resolved rank).
const eloDisplay = computed(() => {
  const set = banSet.value
  if (!set) return ''
  const tier = set.eloTier.charAt(0).toUpperCase() + set.eloTier.slice(1)
  const label = t('bansEloLabel').replace('{elo}', tier)
  return set.eloResolved ? label : `${label} (${t('bansEloDefault')})`
})
</script>

<template>
  <div>
    <!-- US2: a distinctly red/"danger" header with a skull marks this as BANS,
         visually separate from the primary-colored pick recommendations. -->
    <div class="d-flex align-center flex-wrap mb-1 ga-2">
      <v-icon icon="mdi-skull-outline" color="error" class="me-1" />
      <h1 class="text-h4 text-error">{{ t('bansTitle') }}</h1>
      <v-chip v-if="banSet" size="small" color="error" variant="tonal">
        {{ eloDisplay }}
      </v-chip>
      <v-spacer />
      <FreshnessIndicator
        v-if="banSet"
        :freshness="banSet.freshness"
        :last-updated-at="banSet.lastUpdatedAt"
      />
    </div>

    <p class="text-medium-emphasis mb-6">{{ t('bansSubtitle') }}</p>

    <v-progress-linear v-if="loading && !banSet" indeterminate color="error" class="mb-4" />

    <v-alert v-if="banSet && !hasAny" type="info" variant="tonal" class="mb-4">
      {{ t('bansEmpty') }}
    </v-alert>

    <!-- Five role columns, each with its top-3 bans (SC-002: 15 on one screen). The
         flex-basis lets all five sit in a row on wide windows and wrap on narrow. -->
    <div v-else class="ban-grid">
      <div v-for="role in ROLES" :key="role" class="ban-column">
        <div class="d-flex align-center ga-2 mb-2">
          <span class="text-subtitle-2 font-weight-bold">{{ roleLabel(role) }}</span>
          <v-divider />
        </div>
        <div class="d-flex flex-column ga-2">
          <BanRecommendationCard v-for="ban in byRole[role]" :key="ban.championId" :ban="ban" />
          <div v-if="byRole[role].length === 0" class="text-caption text-disabled font-italic pa-2">
            {{ t('bansRoleEmpty') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ban-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.ban-column {
  flex: 1 1 170px;
  min-width: 150px;
}
</style>
