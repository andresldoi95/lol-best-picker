<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ROLES, type Role } from '@shared/types'
import { useSettings } from '@renderer/composables/useSettings'

const { settings, load, setManualRole, setStatsFreshnessHours } = useSettings()

const roleLabels: Record<Role, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Middle',
  BOTTOM: 'Bottom',
  SUPPORT: 'Support'
}

onMounted(() => {
  if (!settings.value) void load()
})

const manualRole = computed<Role | null>({
  get: () => settings.value?.manualRole ?? null,
  set: (role) => void setManualRole(role)
})

const freshnessHours = ref<number>(24)
watch(
  settings,
  (value) => {
    if (value) freshnessHours.value = value.statsFreshnessHours
  },
  { immediate: true }
)

async function saveFreshnessHours(): Promise<void> {
  const hours = Math.max(1, Math.floor(Number(freshnessHours.value) || 1))
  freshnessHours.value = hours
  await setStatsFreshnessHours(hours)
}

const lastFetchText = computed(() => {
  const at = settings.value?.lastStatsFetchAt
  const status = settings.value?.lastStatsFetchStatus
  if (!at) return 'No live stats fetch has succeeded yet — using bundled/cached data.'
  return `Last fetch ${status ?? 'unknown'} at ${new Date(at).toLocaleString()}.`
})
</script>

<template>
  <div>
    <h1 class="text-h4 mb-6">Settings</h1>

    <v-card border flat class="mb-6">
      <v-card-title>Role Override</v-card-title>
      <v-card-subtitle>
        Force recommendations to a specific role when auto-detection isn't available (FR-007).
      </v-card-subtitle>
      <v-card-text>
        <v-btn-toggle
          :model-value="manualRole"
          color="primary"
          variant="outlined"
          divided
          @update:model-value="manualRole = $event"
        >
          <v-btn v-for="role in ROLES" :key="role" :value="role">
            {{ roleLabels[role] }}
          </v-btn>
        </v-btn-toggle>
        <div class="mt-3">
          <v-btn
            :disabled="!manualRole"
            variant="text"
            size="small"
            prepend-icon="mdi-backup-restore"
            @click="manualRole = null"
          >
            Clear (auto-detect role)
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card border flat>
      <v-card-title>Statistics Freshness</v-card-title>
      <v-card-subtitle>
        How long cached stats stay "live" before they're marked stale (research.md §5).
      </v-card-subtitle>
      <v-card-text>
        <v-row align="center" dense>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model.number="freshnessHours"
              type="number"
              label="Freshness threshold (hours)"
              variant="outlined"
              density="comfortable"
              :min="1"
              hide-details
              @change="saveFreshnessHours"
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-btn color="primary" prepend-icon="mdi-content-save" @click="saveFreshnessHours">
              Save
            </v-btn>
          </v-col>
        </v-row>
        <p class="text-caption text-medium-emphasis mt-3">{{ lastFetchText }}</p>
      </v-card-text>
    </v-card>
  </div>
</template>
