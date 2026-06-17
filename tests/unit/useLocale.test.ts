import { describe, it, expect, beforeEach } from 'vitest'
import { useLocale } from '../../src/renderer/src/i18n/useLocale'
import { en } from '../../src/renderer/src/i18n/en'
import { es } from '../../src/renderer/src/i18n/es'
import type { Catalog } from '../../src/renderer/src/i18n/types'

const { t, n, d, setLocale } = useLocale()

// useLocale is a module-level singleton — reset to English before each test so
// state doesn't leak between cases.
beforeEach(() => {
  setLocale('en')
})

describe('useLocale composable', () => {
  it('t() returns the English string for a known key', () => {
    expect(t('poolTitle')).toBe(en.poolTitle)
  })

  it('t() returns the Spanish string after setLocale("es")', () => {
    setLocale('es')
    expect(t('poolTitle')).toBe(es.poolTitle)
  })

  it('t() falls back to English when a key is missing from the active catalog', () => {
    const key: keyof Catalog = 'poolTitle'
    const saved = es[key]
    // Simulate a Spanish catalog that is missing this key.
    delete (es as Partial<Catalog>)[key]
    try {
      setLocale('es')
      expect(t(key)).toBe(en[key])
    } finally {
      ;(es as Catalog)[key] = saved
    }
  })

  it('t() returns the raw key string when the key is absent from both catalogs', () => {
    const unknown = 'totallyUnknownKey' as keyof Catalog
    expect(t(unknown)).toBe('totallyUnknownKey')
  })

  it('n() formats a decimal with the locale separator', () => {
    expect(n(53.2, 'decimal1')).toBe('53.2')
    setLocale('es')
    expect(n(53.2, 'decimal1')).toBe('53,2')
  })

  it('d() formats an ISO timestamp differently per locale', () => {
    const iso = '2026-06-17T14:30:00.000Z'
    const enText = d(iso)
    setLocale('es')
    const esText = d(iso)
    expect(typeof enText).toBe('string')
    expect(enText.length).toBeGreaterThan(0)
    expect(esText.length).toBeGreaterThan(0)
    expect(esText).not.toBe(enText)
  })
})
