import Database from 'better-sqlite3'
import { migrations } from './migrations'

export type DB = Database.Database

/**
 * Apply any not-yet-applied migrations, tracked in `schema_migrations`. Each
 * migration runs in its own transaction so a failure leaves the DB at the last
 * good migration. Idempotent: already-applied migrations are skipped.
 */
export function runMigrations(db: DB): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id         TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`
  )

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => (r as { id: string }).id)
  )

  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    const apply = db.transaction(() => {
      db.exec(migration.sql)
      insert.run(migration.id, new Date().toISOString())
    })
    apply()
  }
}

/**
 * Open (or create) the SQLite database at `filePath`, set pragmas, and run
 * pending migrations. Pure with respect to Electron — `filePath` is injected so
 * integration tests can point at a temp file (no Electron runtime required).
 */
export function createDatabase(filePath: string): DB {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}
