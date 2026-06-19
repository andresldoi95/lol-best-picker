import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeInstallerConfig } from '@main/installer'
import { writeEnvLocal } from '@main/installer/storage'
import { ENV_LOCAL_FILE_NAME, INSTALL_LOG_FILE_NAME } from '@main/installer/paths'

describe('installer/index — initializeInstallerConfig (spec 005 US2)', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  function freshDataDir(): string {
    dir = mkdtempSync(join(tmpdir(), 'lbp-init-'))
    return dir
  }

  it('creates the data dir and applies .env.local overrides onto the target env', () => {
    const dataDir = freshDataDir()
    writeEnvLocal(join(dataDir, ENV_LOCAL_FILE_NAME), { LCU_API_KEY: 'app-key' })

    const target: NodeJS.ProcessEnv = { HTTPS_PROXY: 'http://sys:1' }
    const result = initializeInstallerConfig({ dataDirOverride: dataDir }, target)

    expect(result.dataDir).toBe(dataDir)
    expect(result.appliedKeys).toEqual(['LCU_API_KEY'])
    expect(target.LCU_API_KEY).toBe('app-key')
    // System-provided value is preserved untouched.
    expect(target.HTTPS_PROXY).toBe('http://sys:1')
    expect(existsSync(dataDir)).toBe(true)
  })

  it('drops invalid override keys and records them, applying only valid ones', () => {
    const dataDir = freshDataDir()
    writeEnvLocal(join(dataDir, ENV_LOCAL_FILE_NAME), {
      LCU_API_KEY: 'good-key',
      HTTPS_PROXY: 'not-a-url'
    })

    const target: NodeJS.ProcessEnv = {}
    const result = initializeInstallerConfig({ dataDirOverride: dataDir }, target)

    expect(result.invalidKeys).toEqual(['HTTPS_PROXY'])
    expect(result.appliedKeys).toEqual(['LCU_API_KEY'])
    expect(target.LCU_API_KEY).toBe('good-key')
    expect(target.HTTPS_PROXY).toBeUndefined()
  })

  it('writes an install log and succeeds when no .env.local exists', () => {
    const dataDir = freshDataDir()

    const result = initializeInstallerConfig({ dataDirOverride: dataDir }, {})

    expect(result.appliedKeys).toEqual([])
    expect(result.invalidKeys).toEqual([])
    const log = readFileSync(join(dataDir, INSTALL_LOG_FILE_NAME), 'utf8')
    expect(log).toContain('Applied override keys: (none)')
  })
})
