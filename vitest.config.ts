import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Vitest runs in a plain Node environment (no Electron). This is intentional:
// `src/recommendation/` is pure TS (Principle IV) and the DB repositories use
// `better-sqlite3` against temp files, both of which run without an Electron runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@recommendation': resolve('src/recommendation'),
      '@main': resolve('src/main')
    }
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.{test,spec}.ts',
      'tests/contract/**/*.{test,spec}.ts',
      'tests/integration/**/*.{test,spec}.ts'
    ],
    globals: false
  }
})
