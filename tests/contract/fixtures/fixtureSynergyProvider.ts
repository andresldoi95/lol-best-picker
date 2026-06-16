import type {
  NormalizedSynergyRow,
  SynergyProvider,
  SynergyProviderTarget
} from '@main/stats/synergyProvider'

/**
 * Test double for `SynergyProvider` (contracts/synergy-provider.md §FixtureSynergyProvider).
 * Returns the subset of its fixed rows whose (championKey, role) matches a requested
 * target — no network calls. Used by unit/integration tests for the recommendation
 * pipeline.
 */
export class FixtureSynergyProvider implements SynergyProvider {
  constructor(private readonly rows: NormalizedSynergyRow[]) {}

  async fetchSynergyStats(targets: SynergyProviderTarget[]): Promise<NormalizedSynergyRow[]> {
    const targetKeys = new Set(targets.map((t) => `${t.championKey}:${t.role}`))
    return this.rows.filter((r) => targetKeys.has(`${r.championKey}:${r.role}`))
  }
}
