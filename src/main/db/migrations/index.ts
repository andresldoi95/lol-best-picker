import initial001 from './001_initial.sql?raw'

export interface Migration {
  /** Stable, sortable identifier — the migration filename without extension. */
  id: string
  sql: string
}

/** Ordered list of migrations. Append new entries; never reorder or mutate
 *  already-shipped ones (the app applies pending ones by `id` on startup). */
export const migrations: Migration[] = [{ id: '001_initial', sql: initial001 }]
