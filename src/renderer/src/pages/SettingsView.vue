<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ROLES, type Language, type Role } from '@shared/types'
import { useSettings } from '@renderer/composables/useSettings'
import { useLocale } from '@renderer/i18n/useLocale'
import type { Catalog } from '@renderer/i18n/types'

const { settings, load, setManualRole, setStatsFreshnessHours, setLanguage } = useSettings()
const { t, d, setLocale } = useLocale()

const roleLabelKeys: Record<Role, keyof Catalog> = {
  TOP: 'roleTop',
  JUNGLE: 'roleJungle',
  MIDDLE: 'roleMiddle',
  BOTTOM: 'roleBottom',
  SUPPORT: 'roleSupport'
}
const roleLabel = (role: Role): string => t(roleLabelKeys[role])

// Language endonyms are intentionally not translated (each shown in its own language).
const languageOptions: { value: Language; title: string }[] = [
  { value: 'en', title: 'English' },
  { value: 'es', title: 'Español' }
]

const languageModel = computed<Language>({
  get: () => settings.value?.language ?? 'en',
  set: (lang) => void applyLanguage(lang)
})

async function applyLanguage(lang: Language): Promise<void> {
  await setLanguage(lang)
  setLocale(lang)
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

const statusLabelKeys: Record<'success' | 'error', keyof Catalog> = {
  success: 'settingsStatusSuccess',
  error: 'settingsStatusError'
}

const lastFetchText = computed(() => {
  const at = settings.value?.lastStatsFetchAt
  const status = settings.value?.lastStatsFetchStatus
  if (!at) return t('settingsLastFetchNever')
  const statusLabel = status ? t(statusLabelKeys[status]) : t('settingsStatusUnknown')
  return t('settingsLastFetchAt').replace('{status}', statusLabel).replace('{time}', d(at))
})
</script>

<template>
  <div>
    <h1 class="text-h4 mb-6">{{ t('settingsTitle') }}</h1>

    <v-card border flat class="mb-6">
      <v-card-title>{{ t('settingsLanguageTitle') }}</v-card-title>
      <v-card-subtitle>{{ t('settingsLanguageSubtitle') }}</v-card-subtitle>
      <v-card-text>
        <v-btn-toggle
          :model-value="languageModel"
          color="primary"
          variant="outlined"
          divided
          mandatory
          @update:model-value="languageModel = $event"
        >
          <v-btn v-for="option in languageOptions" :key="option.value" :value="option.value">
            {{ option.title }}
          </v-btn>
        </v-btn-toggle>
      </v-card-text>
    </v-card>

    <v-card border flat class="mb-6">
      <v-card-title>{{ t('settingsRoleOverrideTitle') }}</v-card-title>
      <v-card-subtitle>{{ t('settingsRoleOverrideSubtitle') }}</v-card-subtitle>
      <v-card-text>
        <v-btn-toggle
          :model-value="manualRole"
          color="primary"
          variant="outlined"
          divided
          @update:model-value="manualRole = $event"
        >
          <v-btn v-for="role in ROLES" :key="role" :value="role">
            {{ roleLabel(role) }}
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
            {{ t('settingsClearAutoDetect') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card border flat>
      <v-card-title>{{ t('settingsFreshnessTitle') }}</v-card-title>
      <v-card-subtitle>{{ t('settingsFreshnessSubtitle') }}</v-card-subtitle>
      <v-card-text>
        <v-row align="center" dense>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model.number="freshnessHours"
              type="number"
              :label="t('settingsFreshnessFieldLabel')"
              variant="outlined"
              density="comfortable"
              :min="1"
              hide-details
              @change="saveFreshnessHours"
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-btn color="primary" prepend-icon="mdi-content-save" @click="saveFreshnessHours">
              {{ t('settingsSaveButton') }}
            </v-btn>
          </v-col>
        </v-row>
        <p class="text-caption text-medium-emphasis mt-3">{{ lastFetchText }}</p>
      </v-card-text>
    </v-card>
  </div>
</template>
