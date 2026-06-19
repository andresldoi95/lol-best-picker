<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ROLES, type Role } from '@shared/types'
import { usePersonalCounters } from '@renderer/composables/usePersonalCounters'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'
import FreshnessIndicator from '@renderer/components/FreshnessIndicator.vue'
import PersonalCounterCard from '@renderer/components/PersonalCounterCard.vue'

const { counterSet, loading, selectedRole, load, setRole } = usePersonalCounters()
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

// Filter options: "All Roles" (null) + the five canonical roles (US3).
const roleOptions = computed<Array<{ value: Role | null; label: string }>>(() => [
  { value: null, label: t('countersAllRoles') },
  ...ROLES.map((role) => ({ value: role, label: t(roleLabelKeys[role]) }))
])

const counters = computed(() => counterSet.value?.counters ?? [])
const hasAny = computed(() => counters.value.length > 0)
/** Distinguish "no games at all" from "no games in the selected role" (US3 AC2). */
const noGamesAtAll = computed(() => (counterSet.value?.totalGamesRecorded ?? 0) === 0)

// Tier context badge: "<Tier> · N games" (+ "M from other tiers" when relevant) — the
// historical-context surface from clarification Q1, built here so the string is localized.
const tierBadge = computed(() => {
  const set = counterSet.value
  if (!set) return ''
  const tier = set.eloTier.charAt(0).toUpperCase() + set.eloTier.slice(1)
  return t('countersTierBadge').replace('{tier}', tier).replace('{games}', String(set.gamesInTier))
})
const otherTierBadge = computed(() => {
  const other = counterSet.value?.otherTierGames ?? 0
  return other > 0 ? t('countersOtherTierGames').replace('{n}', String(other)) : ''
})

function onRoleChange(value: Role | null): void {
  if (value !== selectedRole.value) void setRole(value)
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-1 ga-2">
      <v-icon icon="mdi-target-account" color="primary" class="me-1" />
      <h1 class="text-h4">{{ t('countersTitle') }}</h1>
      <v-chip v-if="counterSet && !noGamesAtAll" size="small" color="primary" variant="tonal">
        {{ tierBadge }}
      </v-chip>
      <v-chip v-if="otherTierBadge" size="small" variant="text" class="text-medium-emphasis">
        {{ otherTierBadge }}
      </v-chip>
      <v-spacer />
      <FreshnessIndicator
        v-if="counterSet"
        :freshness="counterSet.freshness"
        :last-updated-at="counterSet.lastUpdatedAt"
      />
    </div>

    <p class="text-medium-emphasis mb-4">{{ t('countersSubtitle') }}</p>

    <!-- Role filter (US3). Bound to the composable's selectedRole; null = All Roles. -->
    <v-btn-toggle
      :model-value="selectedRole"
      mandatory
      density="comfortable"
      color="primary"
      variant="outlined"
      divided
      class="mb-4 flex-wrap"
      @update:model-value="onRoleChange"
    >
      <v-btn v-for="opt in roleOptions" :key="opt.label" :value="opt.value" size="small">
        {{ opt.label }}
      </v-btn>
    </v-btn-toggle>

    <v-progress-linear v-if="loading && !counterSet" indeterminate color="primary" class="mb-4" />

    <!-- Empty states: no games anywhere vs. none in the chosen role (US2 AC3 / US3 AC2). -->
    <v-alert v-if="counterSet && noGamesAtAll" type="info" variant="tonal" class="mb-4">
      {{ t('countersEmpty') }}
    </v-alert>
    <v-alert
      v-else-if="counterSet && !hasAny"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ t('countersRoleEmpty') }}
    </v-alert>

    <div v-else class="d-flex flex-column ga-2">
      <PersonalCounterCard
        v-for="(counter, i) in counters"
        :key="`${counter.opponentChampion}-${counter.playerRole ?? 'all'}`"
        :counter="counter"
        :rank="i + 1"
      />
    </div>

    <!-- US4: explain the threat score + confidence tiers so the ranking is interpretable. -->
    <v-expansion-panels v-if="hasAny" class="mt-6" variant="accordion">
      <v-expansion-panel>
        <v-expansion-panel-title>
          <v-icon icon="mdi-help-circle-outline" size="small" class="me-2" />
          {{ t('countersHelpTitle') }}
        </v-expansion-panel-title>
        <v-expansion-panel-text class="text-body-2 text-medium-emphasis">
          {{ t('countersHelpText') }}
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>
