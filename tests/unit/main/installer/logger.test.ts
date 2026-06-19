import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  formatLogLine,
  createInstallerLogger,
  createNoopLogger
} from '@main/installer/logger'

describe('installer/logger — formatLogLine', () => {
  it('formats an ISO-timestamped, leveled line ending in a newline', () => {
    const line = formatLogLine('INFO', 'hello', new Date('2026-06-18T10:00:00.000Z'))
    expect(line).toBe('[2026-06-18T10:00:00.000Z] INFO hello\n')
  })
})

describe('installer/logger — createInstallerLogger (spec 005 FR-010)', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('appends lines, creating the parent directory on first write', () => {
    dir = mkdtempSync(join(tmpdir(), 'lbp-log-'))
    const logPath = join(dir, 'nested', 'install.log')
    const logger = createInstallerLogger(logPath)

    logger.info('first')
    logger.warn('second')
    logger.error('third')

    const contents = readFileSync(logPath, 'utf8')
    expect(contents).toContain('INFO first')
    expect(contents).toContain('WARN second')
    expect(contents).toContain('ERROR third')
    expect(contents.trimEnd().split('\n')).toHaveLength(3)
  })

  it('never throws even when the path is unwritable', () => {
    // A path whose "directory" is actually a file cannot be created — logging
    // must swallow the error rather than crash startup.
    dir = mkdtempSync(join(tmpdir(), 'lbp-log-'))
    const fileAsDir = join(dir, 'afile')
    writeFileSync(fileAsDir, 'x')
    const logger = createInstallerLogger(join(fileAsDir, 'install.log'))
    expect(() => logger.info('should not throw')).not.toThrow()
  })
})

describe('installer/logger — createNoopLogger', () => {
  it('silently discards all messages', () => {
    const logger = createNoopLogger()
    expect(() => {
      logger.info('x')
      logger.warn('y')
      logger.error('z')
    }).not.toThrow()
  })
})
