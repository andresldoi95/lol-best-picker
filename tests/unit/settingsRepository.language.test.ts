import { describe, it, expect, afterEach } from 'vitest'
import { SettingsRepository } from '@main/db/repositories/settingsRepository'
import { createTempDbFile, openSeededDb } from '../helpers/db'
import type { DB } from '@main/db'

describe('SettingsRepository — language (spec 003)', () => {
  let db: DB | undefined
  let cleanup: (() => void) | undefined

  afterEach(() => {
    db?.close()
    db = undefined
    cleanup?.()
  })

  function freshRepo(): SettingsRepository {
    const file = createTempDbFile()
    cleanup = file.cleanup
    db = openSeededDb(file.path)
    return new SettingsRepository(db)
  }

  it('get() returns the language stored in the database', () => {
    const repo = freshRepo()
    repo.setLanguage('es')
    expect(repo.get().language).toBe('es')
  })

  it('get() returns "en" when the column is still NULL (unset)', () => {
    const repo = freshRepo()
    // Migration 003 adds the column with a NULL default; renderer-facing default is 'en'.
    expect(repo.get().language).toBe('en')
  })

  it('setLanguage("es") writes and get() reads it back', () => {
    const repo = freshRepo()
    repo.setLanguage('es')
    expect(repo.get().language).toBe('es')
    repo.setLanguage('en')
    expect(repo.get().language).toBe('en')
  })

  it('initLanguageIfUnset("en") writes when the column is NULL', () => {
    const repo = freshRepo()
    repo.initLanguageIfUnset('en')
    expect(repo.get().language).toBe('en')
  })

  it('initLanguageIfUnset does NOT overwrite an existing explicit choice', () => {
    const repo = freshRepo()
    repo.setLanguage('es')
    repo.initLanguageIfUnset('en')
    expect(repo.get().language).toBe('es')
  })
})
