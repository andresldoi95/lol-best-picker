<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocale as useVuetifyLocale } from 'vuetify'
import { useSettings } from '@renderer/composables/useSettings'
import { useChampSelect } from '@renderer/composables/useChampSelect'
import { useLocale } from '@renderer/i18n/useLocale'

const route = useRoute()
const router = useRouter()
const { settings, load } = useSettings()
const { session, load: loadChampSelect } = useChampSelect()
const { t, setLocale } = useLocale()
const vuetifyLocale = useVuetifyLocale()

const CHAMP_SELECT_PATH = '/champ-select'

/** US2 / FR-004: jump to the Champ Select view when a live champion select begins.
 *  Only navigates when not already there, and is invoked on the transition into an
 *  active session (not on every subsequent update) so a user who deliberately
 *  switches away mid-select is not yanked back (US2 AC2). */
function autoNavigateToChampSelect(): void {
  if (route.path !== CHAMP_SELECT_PATH) void router.push(CHAMP_SELECT_PATH)
}

// Keep both the app's own locale and Vuetify's built-in locale in sync.
function applyLanguage(lang: 'en' | 'es'): void {
  setLocale(lang)
  vuetifyLocale.current.value = lang
}

onMounted(async () => {
  if (!settings.value) await load()
  if (settings.value) applyLanguage(settings.value.language)

  // Establish the global champ-select subscription here (App is always mounted,
  // unlike ChampSelectView) so auto-navigation fires from any view, then handle the
  // app launching while already in champ select (spec 006 US2 / FR-004).
  await loadChampSelect()
  if (session.value?.active) autoNavigateToChampSelect()
})

// React to language changes (first load + live switch from Settings, spec 003 US2).
watch(
  () => settings.value?.language,
  (lang) => {
    if (lang) applyLanguage(lang)
  }
)

// US2 / FR-004: navigate on the transition into an active champion select.
watch(
  () => session.value?.active,
  (active, wasActive) => {
    if (active === true && wasActive !== true) autoNavigateToChampSelect()
  }
)

const navItems = computed(() => [
  { to: '/', label: t('navPool'), icon: 'mdi-account-multiple' },
  { to: '/champ-select', label: t('navChampSelect'), icon: 'mdi-sword-cross' },
  { to: '/settings', label: t('navSettings'), icon: 'mdi-cog' }
])
</script>

<template>
  <v-app>
    <v-app-bar color="surface" flat density="comfortable">
      <v-app-bar-title>
        <span class="text-primary font-weight-bold">LoL</span> Best Picker
      </v-app-bar-title>
      <v-spacer />
      <v-btn
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :prepend-icon="item.icon"
        variant="text"
        :active="route.path === item.to"
      >
        {{ item.label }}
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
