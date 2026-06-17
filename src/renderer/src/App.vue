<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useLocale as useVuetifyLocale } from 'vuetify'
import { useSettings } from '@renderer/composables/useSettings'
import { useLocale } from '@renderer/i18n/useLocale'

const route = useRoute()
const { settings, load } = useSettings()
const { t, setLocale } = useLocale()
const vuetifyLocale = useVuetifyLocale()

// Keep both the app's own locale and Vuetify's built-in locale in sync.
function applyLanguage(lang: 'en' | 'es'): void {
  setLocale(lang)
  vuetifyLocale.current.value = lang
}

onMounted(async () => {
  if (!settings.value) await load()
  if (settings.value) applyLanguage(settings.value.language)
})

// React to language changes (first load + live switch from Settings, spec 003 US2).
watch(
  () => settings.value?.language,
  (lang) => {
    if (lang) applyLanguage(lang)
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
