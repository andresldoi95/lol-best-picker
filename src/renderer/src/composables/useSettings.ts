import { ref, readonly } from 'vue'
import type { AppSettings, Language, Role } from '@shared/types'

// Shared reactive app settings (manual role, freshness threshold, fetch status).
const settings = ref<AppSettings | null>(null)

async function load(): Promise<void> {
  settings.value = await window.api.settings.get()
}

async function setManualRole(role: Role | null): Promise<void> {
  await window.api.settings.setManualRole(role)
  await load()
}

async function setStatsFreshnessHours(hours: number): Promise<void> {
  await window.api.settings.setStatsFreshnessHours(hours)
  await load()
}

async function setLanguage(lang: Language): Promise<void> {
  await window.api.settings.setLanguage(lang)
  await load()
}

export function useSettings() {
  return {
    settings: readonly(settings),
    load,
    setManualRole,
    setStatsFreshnessHours,
    setLanguage
  }
}
