<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ROLES, type Role } from '@shared/types'
import { useRecommendation } from '@renderer/composables/useRecommendation'
import { useChampSelect } from '@renderer/composables/useChampSelect'
import { useSettings } from '@renderer/composables/useSettings'
import { usePool } from '@renderer/composables/usePool'
import FreshnessIndicator from '@renderer/components/FreshnessIndicator.vue'

const { recommendation, loading, load: loadRecommendation } = useRecommendation()
const { session, load: loadSession } = useChampSelect()
const { settings, load: loadSettings, setManualRole } = useSettings()
const { champions, loaded: championsLoaded, refresh: refreshPool } = usePool()

const roleLabels: Record<Role, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Middle',
  BOTTOM: 'Bottom',
  SUPPORT: 'Support'
}

onMounted(async () => {
  if (!championsLoaded.value) await refreshPool()
  await Promise.all([loadSession(), loadSettings(), loadRecommendation()])
})

const activeRole = computed<Role | null>(() => recommendation.value?.role ?? null)
const entries = computed(() => recommendation.value?.entries ?? [])
const topPick = computed(() => entries.value[0] ?? null)
const restPicks = computed(() => entries.value.slice(1))

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

function formatScore(score: number): string {
  return `${score.toFixed(1)}%`
}
function scoreBasisLabel(basis: string): string {
  return basis === 'matchup' ? 'vs. revealed enemies' : 'overall win rate'
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-1">
      <h1 class="text-h4 me-4">Champion Select</h1>
      <v-chip v-if="activeRole" color="primary" variant="flat" class="me-2">
        {{ roleLabels[activeRole] }}
      </v-chip>
      <v-chip v-if="session?.active" size="small" color="success" variant="tonal" class="me-2">
        <v-icon start icon="mdi-circle" size="x-small" /> Live
      </v-chip>
      <v-spacer />
      <FreshnessIndicator
        v-if="recommendation"
        :freshness="recommendation.freshness"
        :last-updated-at="recommendation.lastUpdatedAt"
      />
    </div>

    <p class="text-medium-emphasis mb-6">
      Best pick from <strong>your pool</strong> for the active role, ranked by win rate.
    </p>

    <v-card border flat class="mb-6">
      <v-card-text>
        <div class="d-flex align-center flex-wrap ga-4">
          <div>
            <div class="text-caption text-medium-emphasis mb-1">Role (overrides auto-detection)</div>
            <v-btn-toggle
              :model-value="manualRoleModel"
              color="primary"
              density="comfortable"
              variant="outlined"
              divided
              @update:model-value="manualRoleModel = $event"
            >
              <v-btn v-for="role in ROLES" :key="role" :value="role" size="small">
                {{ roleLabels[role] }}
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
            Auto-detect
          </v-btn>
          <v-spacer />
          <div v-if="enemyChampions.length" class="text-end">
            <div class="text-caption text-medium-emphasis mb-1">Enemies revealed</div>
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
      Select your role above to see recommendations from your pool.
    </v-alert>

    <!-- FR-013: empty role-filtered pool -->
    <v-alert
      v-else-if="entries.length === 0"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      No champions in your pool for {{ roleLabels[activeRole] }}. Add some on the
      <strong>Pool</strong> tab.
    </v-alert>

    <template v-else>
      <v-card v-if="topPick" color="primary" variant="tonal" border class="mb-4">
        <v-card-text class="d-flex align-center">
          <v-avatar size="64" class="me-4">
            <v-img :src="topPick.iconPath" :alt="topPick.championName" />
          </v-avatar>
          <div>
            <div class="text-overline">Best Pick</div>
            <div class="text-h5 font-weight-bold">
              {{ topPick.championName }}
              <v-chip v-if="topPick.isFlagged" size="x-small" color="warning" variant="flat">
                inactive
              </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ formatScore(topPick.score) }} · {{ scoreBasisLabel(topPick.scoreBasis) }}
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
              inactive
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle>{{ scoreBasisLabel(entry.scoreBasis) }}</v-list-item-subtitle>
          <template #append>
            <span class="text-body-1 font-weight-medium">{{ formatScore(entry.score) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>
  </div>
</template>
