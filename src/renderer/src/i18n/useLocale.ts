import { ref, readonly, type Ref } from 'vue'
import type { Language } from '@shared/types'
import type { Catalog } from './types'
import { en } from './en'
import { es } from './es'

/**
 * Module-level singleton locale composable (same pattern as `useSettings` /
 * `usePool`). Backed by Vue reactivity + native `Intl` — no `vue-i18n` runtime
 * dependency (research.md § Decision 1, Constitution VII).
 */

const catalogs: Record<Language, Catalog> = { en, es }

// Reactive active language. Changing it re-renders every consumer that called t/n/d.
const locale = ref<Language>('en') as Ref<Language>

/** Look up a message key in the active locale, falling back to English, then to
 *  the raw key string so the UI never renders blank (data-model.md § Fallback). */
function t(key: keyof Catalog): string {
  const active = catalogs[locale.value]
  if (active && active[key] != null) return active[key]
  const fallback = catalogs.en[key]
  return fallback ?? String(key)
}

/** Locale-aware number formatting via `Intl.NumberFormat`. `'decimal1'` → one
 *  decimal place (win-rate scores); `'percent'` → locale percentage format. */
function n(value: number, style: 'decimal1' | 'percent'): string {
  if (style === 'percent') {
    return new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(
      value
    )
  }
  return new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value)
}

/** Locale-aware date+time formatting via `Intl.DateTimeFormat`. */
function d(isoString: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(isoString))
}

/** Update the active language. Called on startup and from the Settings UI. */
function setLocale(lang: Language): void {
  locale.value = lang
}

export function useLocale() {
  return {
    locale: readonly(locale),
    t,
    n,
    d,
    setLocale
  }
}
