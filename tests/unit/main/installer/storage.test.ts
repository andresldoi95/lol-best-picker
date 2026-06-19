import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseEnvFile,
  serializeEnvFile,
  readEnvLocal,
  writeEnvLocal
} from '@main/installer/storage'

describe('installer/storage — parseEnvFile (spec 005 FR-004)', () => {
  it('parses simple KEY=VALUE pairs', () => {
    expect(parseEnvFile('LCU_API_KEY=abc123\nHTTPS_PROXY=http://p:8080')).toEqual({
      LCU_API_KEY: 'abc123',
      HTTPS_PROXY: 'http://p:8080'
    })
  })

  it('ignores blank lines and # comments', () => {
    const body = '# managed file\n\nLCU_API_KEY=abc\n\n  # indented comment\n'
    expect(parseEnvFile(body)).toEqual({ LCU_API_KEY: 'abc' })
  })

  it('tolerates an optional `export ` prefix', () => {
    expect(parseEnvFile('export LCU_API_KEY=abc')).toEqual({ LCU_API_KEY: 'abc' })
  })

  it('strips surrounding double and single quotes, keeping inner content', () => {
    expect(parseEnvFile('A="hello world"\nB=\'single quoted\'')).toEqual({
      A: 'hello world',
      B: 'single quoted'
    })
  })

  it('keeps = characters inside the value', () => {
    expect(parseEnvFile('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' })
  })

  it('skips malformed lines (no =) and invalid keys', () => {
    expect(parseEnvFile('NOTAPAIR\n1BAD=x\nVALID_KEY=ok')).toEqual({ VALID_KEY: 'ok' })
  })

  it('handles CRLF line endings', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })
})

describe('installer/storage — serializeEnvFile', () => {
  it('sorts keys and emits KEY=VALUE lines under a header comment', () => {
    const out = serializeEnvFile({ B: '2', A: '1' })
    const lines = out.split('\n')
    expect(lines[0].startsWith('#')).toBe(true)
    expect(out).toContain('A=1')
    expect(out).toContain('B=2')
    expect(out.indexOf('A=1')).toBeLessThan(out.indexOf('B=2'))
  })

  it('quotes values that contain whitespace or special characters', () => {
    expect(serializeEnvFile({ A: 'hello world' })).toContain('A="hello world"')
    expect(serializeEnvFile({ EMPTY: '' })).toContain('EMPTY=""')
  })

  it('round-trips through parseEnvFile for arbitrary valid values', () => {
    const values = {
      LCU_API_KEY: 'abc123',
      HTTPS_PROXY: 'http://user:pass@proxy:8080',
      WITH_SPACE: 'a b c',
      WITH_EQUALS: 'x=y',
      WITH_QUOTE: 'he said "hi"'
    }
    expect(parseEnvFile(serializeEnvFile(values))).toEqual(values)
  })
})

describe('installer/storage — readEnvLocal / writeEnvLocal', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('returns {} when the file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'lbp-env-'))
    expect(readEnvLocal(join(dir, 'nope', '.env.local'))).toEqual({})
  })

  it('writes the file, creating the parent directory, and reads it back', () => {
    dir = mkdtempSync(join(tmpdir(), 'lbp-env-'))
    const file = join(dir, 'nested', '.env.local')
    writeEnvLocal(file, { LCU_API_KEY: 'abc', HTTPS_PROXY: 'http://p:8080' })

    expect(readFileSync(file, 'utf8')).toContain('LCU_API_KEY=abc')
    expect(readEnvLocal(file)).toEqual({ LCU_API_KEY: 'abc', HTTPS_PROXY: 'http://p:8080' })
  })
})
