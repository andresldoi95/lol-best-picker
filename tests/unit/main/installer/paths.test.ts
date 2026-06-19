import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  DATA_DIR_NAME,
  DB_FILE_NAME,
  ENV_LOCAL_FILE_NAME,
  INSTALL_LOG_FILE_NAME,
  pathEnvironmentFromProcess,
  resolveDataDir,
  resolveDbPath,
  resolveEnvLocalPath,
  resolveInstallLogPath
} from '@main/installer/paths'

describe('installer/paths — data directory resolution (spec 005 FR-001)', () => {
  it('prefers an explicit LOLBESTPICKER_DATA_DIR override above all else', () => {
    const dir = resolveDataDir({
      dataDirOverride: 'D:\\portable\\data',
      localAppData: 'C:\\Users\\me\\AppData\\Local',
      home: 'C:\\Users\\me'
    })
    expect(dir).toBe('D:\\portable\\data')
  })

  it('uses %LOCALAPPDATA%\\LolBestPicker when no override is set', () => {
    const localAppData = 'C:\\Users\\me\\AppData\\Local'
    expect(resolveDataDir({ localAppData })).toBe(join(localAppData, DATA_DIR_NAME))
  })

  it('reconstructs LocalAppData from the home directory as a last resort', () => {
    const dir = resolveDataDir({ home: 'C:\\Users\\me' })
    expect(dir).toBe(join('C:\\Users\\me', 'AppData', 'Local', DATA_DIR_NAME))
  })

  it('throws rather than writing to an unknown location when nothing resolves', () => {
    expect(() => resolveDataDir({})).toThrow(/Cannot resolve data directory/)
  })

  it('ignores blank/whitespace-only override and LocalAppData values', () => {
    const dir = resolveDataDir({ dataDirOverride: '   ', localAppData: '', home: 'C:\\Users\\me' })
    expect(dir).toBe(join('C:\\Users\\me', 'AppData', 'Local', DATA_DIR_NAME))
  })
})

describe('installer/paths — file paths inside the data directory', () => {
  const env = { localAppData: 'C:\\Local' }
  const dataDir = join('C:\\Local', DATA_DIR_NAME)

  it('places the SQLite db, .env.local and install.log inside the data dir', () => {
    expect(resolveDbPath(env)).toBe(join(dataDir, DB_FILE_NAME))
    expect(resolveEnvLocalPath(env)).toBe(join(dataDir, ENV_LOCAL_FILE_NAME))
    expect(resolveInstallLogPath(env)).toBe(join(dataDir, INSTALL_LOG_FILE_NAME))
  })
})

describe('installer/paths — pathEnvironmentFromProcess', () => {
  it('maps the relevant env vars onto a PathEnvironment', () => {
    expect(
      pathEnvironmentFromProcess({
        LOCALAPPDATA: 'C:\\Local',
        LOLBESTPICKER_DATA_DIR: 'D:\\override',
        USERPROFILE: 'C:\\Users\\me'
      } as NodeJS.ProcessEnv)
    ).toEqual({
      localAppData: 'C:\\Local',
      dataDirOverride: 'D:\\override',
      home: 'C:\\Users\\me'
    })
  })

  it('falls back to HOME when USERPROFILE is absent', () => {
    const env = pathEnvironmentFromProcess({ HOME: '/home/me' } as NodeJS.ProcessEnv)
    expect(env.home).toBe('/home/me')
  })
})
