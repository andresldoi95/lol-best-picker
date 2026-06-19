import { describe, it, expect } from 'vitest'
import {
  mergeConfig,
  applyMergedConfig,
  validateEnvOverrides
} from '@main/installer/config'

describe('installer/config — mergeConfig precedence (spec 005 FR-005)', () => {
  it('app overrides take precedence over system env', () => {
    const merged = mergeConfig({
      systemEnv: { LCU_API_KEY: 'system-key' },
      appOverrides: { LCU_API_KEY: 'app-key' }
    })
    expect(merged.LCU_API_KEY).toEqual({ value: 'app-key', source: 'app' })
  })

  it('a blank app override falls back to the system value (US2 AC3)', () => {
    const merged = mergeConfig({
      systemEnv: { HTTPS_PROXY: 'http://sys:1' },
      appOverrides: { HTTPS_PROXY: '   ' }
    })
    expect(merged.HTTPS_PROXY).toEqual({ value: 'http://sys:1', source: 'system' })
  })

  it('falls back to defaults when neither app nor system provide a value', () => {
    const merged = mergeConfig({
      defaults: { LOLALYTICS_BASE_URL: 'https://default' },
      systemEnv: {},
      appOverrides: {}
    })
    expect(merged.LOLALYTICS_BASE_URL).toEqual({ value: 'https://default', source: 'default' })
  })

  it('omits known keys that have no value at any layer', () => {
    const merged = mergeConfig({ systemEnv: {}, appOverrides: {} })
    expect(merged.HTTP_PROXY).toBeUndefined()
    expect(merged.LCU_API_KEY).toBeUndefined()
  })

  it('includes ad-hoc app override keys beyond the known set', () => {
    const merged = mergeConfig({ systemEnv: {}, appOverrides: { CUSTOM_FLAG: 'on' } })
    expect(merged.CUSTOM_FLAG).toEqual({ value: 'on', source: 'app' })
  })
})

describe('installer/config — applyMergedConfig', () => {
  it('writes app- and default-sourced values but leaves system values untouched', () => {
    const target: Record<string, string | undefined> = { HTTPS_PROXY: 'http://sys:1' }
    const merged = mergeConfig({
      defaults: { LOLALYTICS_BASE_URL: 'https://default' },
      systemEnv: { HTTPS_PROXY: 'http://sys:1' },
      appOverrides: { LCU_API_KEY: 'app-key' }
    })

    const applied = applyMergedConfig(target, merged)

    expect(applied).toEqual(['LCU_API_KEY', 'LOLALYTICS_BASE_URL'])
    expect(target.LCU_API_KEY).toBe('app-key')
    expect(target.LOLALYTICS_BASE_URL).toBe('https://default')
    // System value was already present; not rewritten, not reported as applied.
    expect(target.HTTPS_PROXY).toBe('http://sys:1')
  })
})

describe('installer/config — validateEnvOverrides (spec 005 FR-011)', () => {
  it('accepts valid http(s)/socks URLs for URL- and proxy-like keys', () => {
    expect(
      validateEnvOverrides({
        LOLALYTICS_BASE_URL: 'https://lolalytics.com',
        HTTPS_PROXY: 'http://proxy:8080',
        HTTP_PROXY: 'socks5://127.0.0.1:1080'
      })
    ).toEqual([])
  })

  it('rejects malformed URLs and wrong protocols for URL-like keys', () => {
    const errors = validateEnvOverrides({
      LOLALYTICS_BASE_URL: 'not a url',
      HTTPS_PROXY: 'ftp://nope'
    })
    expect(errors.map((e) => e.key).sort()).toEqual(['HTTPS_PROXY', 'LOLALYTICS_BASE_URL'])
  })

  it('rejects credential values containing whitespace or control characters', () => {
    const errors = validateEnvOverrides({ LCU_API_KEY: 'abc 123' })
    expect(errors).toHaveLength(1)
    expect(errors[0].key).toBe('LCU_API_KEY')
  })

  it('accepts a clean credential value and skips empty values', () => {
    expect(validateEnvOverrides({ LCU_API_KEY: 'abc123', BLANK: '' })).toEqual([])
  })
})
