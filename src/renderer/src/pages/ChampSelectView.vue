<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ROLES, type Role, type ScoreBreakdown } from '@shared/types'
import { useRecommendation } from '@renderer/composables/useRecommendation'
import { useChampSelect } from '@renderer/composables/useChampSelect'
import { useSettings } from '@renderer/composables/useSettings'
import { usePool } from '@renderer/composables/usePool'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'
import FreshnessIndicator from '@renderer/components/FreshnessIndicator.vue'

const { recommendation, loading, load: loadRecommendation } = useRecommendation()
const { session, load: loadSession } = useChampSelect()
const { settings, load: loadSettings, setManualRole } = useSettings()
const { champions, loaded: championsLoaded, refresh: refreshPool } = usePool()
const { t, n } = useLocale()

const roleLabelKeys: Record<Role, keyof Catalog> = {
  TOP: 'roleTop',
  JUNGLE: 'roleJungle',
  MIDDLE: 'roleMiddle',
  BOTTOM: 'roleBottom',
  SUPPORT: 'roleSupport'
}
const roleLabel = (role: Role): string => t(roleLabelKeys[role])

onMounted(async () => {
  if (!championsLoaded.value) await refreshPool()
  await Promise.all([loadSession(), loadSettings(), loadRecommendation()])
})

const activeRole = computed<Role | null>(() => recommendation.value?.role ?? null)
const entries = computed(() => recommendation.value?.entries ?? [])
const topPick = computed(() => entries.value[0] ?? null)
const restPicks = computed(() => entries.value.slice(1))

// Whether the ally-synergy signal came from a live render (vs. the overall-WR
// fallback) — drives the "Synergy: live / estimated" chip (spec 004 US3).
const synergyLive = computed(() => recommendation.value?.synergySource === 'rendered')

const manualRoleModel = computed<Role | null>({
  get: () => settings.value?.manualRole ?? null,
  set: (role) => {
    void applyManualRole(role)
  }
})

async function applyManualRole(role: Role | null): Promise<void> {
  await setManualRole(role)
  await loadRecommendation()
}

const iconById = computed(() => {
  const map = new Map<number, string>()
  for (const champ of champions.value) map.set(champ.championId, champ.iconPath)
  return map
})

const enemyChampions = computed(() =>
  (session.value?.enemyChampionIds ?? []).map((id) => ({
    id,
    iconPath: iconById.value.get(id) ?? ''
  }))
)

const allyChampions = computed(() =>
  (recommendation.value?.allyChampionIds ?? []).map((id) => ({
    id,
    iconPath: iconById.value.get(id) ?? ''
  }))
)

// Which signals are active is a property of the whole recommendation context, so
// all entries share the same weighting (FR-009 / US3).
const hasEnemy = computed(() => (recommendation.value?.enemyChampionIds.length ?? 0) > 0)
const hasAlly = computed(() => (recommendation.value?.allyChampionIds.length ?? 0) > 0)
const signalWeight = computed(() => (hasEnemy.value && hasAlly.value ? '50%' : '100%'))

interface SignalBlock {
  key: string
  label: string
  value: string
  weight: string
  available: boolean
}

// Only the numeric components are read here (not activeSignals), so accept a
// minimal shape — this also avoids the DeepReadonly array mismatch from the
// composable's readonly() wrapper.
type BreakdownScores = Pick<ScoreBreakdown, 'enemyMatchupScore' | 'allysSynergyScore' | 'combinedScore'>

/** Per-signal blocks for the score-breakdown panel. When a signal is inactive it
 *  is shown as "Not available" with no weight (US3 AC3). */
function breakdownBlocks(bd: BreakdownScores): SignalBlock[] {
  if (!hasEnemy.value && !hasAlly.value) {
    return [
      { key: 'overall', label: t('champSelectOverallWinRate'), value: formatScore(bd.combinedScore), weight: '100%', available: true }
    ]
  }
  return [
    {
      key: 'enemy',
      label: t('champSelectEnemyMatchup'),
      value: hasEnemy.value ? formatScore(bd.enemyMatchupScore) : t('champSelectNotAvailable'),
      weight: hasEnemy.value ? signalWeight.value : '—',
      available: hasEnemy.value
    },
    {
      key: 'ally',
      label: t('champSelectAllySynergy'),
      value: hasAlly.value ? formatScore(bd.allysSynergyScore) : t('champSelectNotAvailable'),
      weight: hasAlly.value ? signalWeight.value : '—',
      available: hasAlly.value
    }
  ]
}

/** Compact one-line breakdown for the ranked list rows. */
function breakdownSummary(bd: BreakdownScores): string {
  if (!hasEnemy.value && !hasAlly.value) {
    return `${t('champSelectSummaryOverall')} ${formatScore(bd.combinedScore)}`
  }
  const parts: string[] = []
  if (hasEnemy.value) parts.push(`${t('champSelectSummaryEnemy')} ${formatScore(bd.enemyMatchupScore)}`)
  if (hasAlly.value) parts.push(`${t('champSelectSummaryAlly')} ${formatScore(bd.allysSynergyScore)}`)
  return parts.join(' · ')
}

function formatScore(score: number): string {
  return `${n(score, 'decimal1')}%`
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-1">
      <h1 class="text-h4 me-4">{{ t('champSelectTitle') }}</h1>
      <v-chip v-if="activeRole" color="primary" variant="flat" class="me-2">
        {{ roleLabel(activeRole) }}
      </v-chip>
      <v-chip v-if="session?.active" size="small" color="success" variant="tonal" class="me-2">
        <v-icon start icon="mdi-circle" size="x-small" /> {{ t('champSelectLiveChip') }}
      </v-chip>
      <v-spacer />
      <!-- spec 004 US3: ally-synergy provenance — live render vs. overall-WR fallback. -->
      <v-chip
        v-if="recommendation"
        size="small"
        variant="tonal"
        :color="synergyLive ? 'success' : undefined"
        class="me-2"
      >
        <v-icon
          start
          :icon="synergyLive ? 'mdi-check-circle' : 'mdi-information-outline'"
          size="x-small"
        />
        {{ synergyLive ? t('champSelectSynergyLive') : t('champSelectSynergyEstimated') }}
      </v-chip>
      <FreshnessIndicator
        v-if="recommendation"
        :freshness="recommendation.freshness"
        :last-updated-at="recommendation.lastUpdatedAt"
      />
    </div>

    <p class="text-medium-emphasis mb-6">{{ t('champSelectSubtitle') }}</p>

    <v-card border flat class="mb-6">
      <v-card-text>
        <div class="d-flex align-center flex-wrap ga-4">
          <div>
            <div class="text-caption text-medium-emphasis mb-1">{{ t('champSelectRoleOverrideLabel') }}</div>
            <v-btn-toggle
              :model-value="manualRoleModel"
              color="primary"
              density="comfortable"
              variant="outlined"
              divided
              @update:model-value="manualRoleModel = $event"
            >
              <v-btn v-for="role in ROLES" :key="role" :value="role" size="small">
                {{ roleLabel(role) }}
              </v-btn>
            </v-btn-toggle>
          </div>
          <v-btn
            v-if="settings?.manualRole"
            variant="text"
            size="small"
            prepend-icon="mdi-backup-restore"
            @click="applyManualRole(null)"
          >
            {{ t('champSelectAutoDetect') }}
          </v-btn>
          <v-spacer />
          <div v-if="allyChampions.length" class="text-end">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('champSelectAlliesLockedIn') }}</div>
            <div class="d-flex ga-1 justify-end">
              <v-avatar v-for="ally in allyChampions" :key="ally.id" size="32">
                <v-img :src="ally.iconPath" />
              </v-avatar>
            </div>
          </div>
          <div v-if="enemyChampions.length" class="text-end">
            <div class="text-caption text-medium-emphasis mb-1">{{ t('champSelectEnemiesRevealed') }}</div>
            <div class="d-flex ga-1 justify-end">
              <v-avatar v-for="enemy in enemyChampions" :key="enemy.id" size="32">
                <v-img :src="enemy.iconPath" />
              </v-avatar>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <!-- FR-007: no role resolved → prompt for manual selection -->
    <v-alert v-if="activeRole === null" type="info" variant="tonal" class="mb-4">
      {{ t('champSelectRolePrompt') }}
    </v-alert>

    <!-- FR-013: empty role-filtered pool -->
    <v-alert
      v-else-if="entries.length === 0"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      {{ t('champSelectEmptyPool').replace('{role}', roleLabel(activeRole)) }}
    </v-alert>

    <template v-else>
      <v-card v-if="topPick" color="primary" variant="tonal" border class="mb-4">
        <v-card-text class="d-flex align-center">
          <v-avatar size="64" class="me-4">
            <v-img :src="topPick.iconPath" :alt="topPick.championName" />
          </v-avatar>
          <div class="flex-grow-1">
            <div class="text-overline">{{ t('champSelectBestPick') }}</div>
            <div class="text-h5 font-weight-bold">
              {{ topPick.championName }}
              <v-chip v-if="topPick.isFlagged" size="x-small" color="warning" variant="flat">
                {{ t('champSelectInactiveChip') }}
              </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ t('champSelectCombinedScore').replace('{score}', formatScore(topPick.score)) }}
            </div>

            <!-- FR-009 / US3: score breakdown — enemy-matchup and ally-synergy shown
                 separately, with weight; an inactive signal reads "Not available". -->
            <div class="d-flex ga-6 flex-wrap mt-3">
              <div v-for="block in breakdownBlocks(topPick.scoreBreakdown)" :key="block.key">
                <div class="text-caption text-medium-emphasis d-flex align-center ga-1">
                  {{ block.label }}
                  <v-chip
                    size="x-small"
                    :color="block.available ? 'primary' : undefined"
                    variant="tonal"
                  >
                    {{ block.weight }}
                  </v-chip>
                </div>
                <div
                  class="text-body-1"
                  :class="block.available ? 'font-weight-medium' : 'text-disabled font-italic'"
                >
                  {{ block.value }}
                </div>
              </div>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-list v-if="restPicks.length" border rounded lines="two">
        <v-list-item v-for="(entry, index) in restPicks" :key="entry.championId">
          <template #prepend>
            <div class="text-medium-emphasis me-3 text-body-2">#{{ index + 2 }}</div>
            <v-avatar size="40">
              <v-img :src="entry.iconPath" :alt="entry.championName" />
            </v-avatar>
          </template>
          <v-list-item-title>
            {{ entry.championName }}
            <v-chip v-if="entry.isFlagged" size="x-small" color="warning" variant="flat" class="ms-1">
              {{ t('champSelectInactiveChip') }}
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>{{ breakdownSummary(entry.scoreBreakdown) }}</v-list-item-subtitle>
          <template #append>
            <span class="text-body-1 font-weight-medium">{{ formatScore(entry.score) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>
  </div>
</template>
