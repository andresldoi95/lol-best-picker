import initial001 from './001_initial.sql?raw'
import addSynergy002 from './002_add_synergy.sql?raw'
import addLanguage003 from './003_add_language.sql?raw'
import addSynergySource004 from './004_add_synergy_source.sql?raw'
import addBanStats005 from './005_add_ban_stats.sql?raw'

export interface Migration {
  /** Stable, sortable identifier — the migration filename without extension. */
  id: string
  sql: string
}

/** Ordered list of migrations. Append new entries; never reorder or mutate
 *  already-shipped ones (the app applies pending ones by `id` on startup). */
export const migrations: Migration[] = [
  { id: '001_initial', sql: initial001 },
  { id: '002_add_synergy', sql: addSynergy002 },
  { id: '003_add_language', sql: addLanguage003 },
  { id: '004_add_synergy_source', sql: addSynergySource004 },
  { id: '005_add_ban_stats', sql: addBanStats005 }
]
