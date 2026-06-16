# Quickstart: Composition-Aware Recommendations

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

End-to-end guide for developing, testing, and verifying this feature.

---

## Prerequisites

Same as spec 001 quickstart. Run these if setting up from scratch:

```bash
npm install
npm run typecheck    # must pass before starting
npm test             # all existing tests must pass before you touch anything
```

---

## Development Flow

### 1. Apply the migration

The migration runner applies pending files on startup — no manual SQL execution needed.

To verify the new schema in isolation:

```bash
# Open a SQLite shell against the dev database (location: %APPDATA%\lol-best-picker\db.sqlite)
# or create a temp file:
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(require('fs').readFileSync('src/main/db/migrations/001_initial.sql', 'utf8'));
  db.exec(require('fs').readFileSync('src/main/db/migrations/002_add_synergy.sql', 'utf8'));
  console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());
"
```

Expected output includes `champion_synergy` and the existing five tables.

### 2. Run unit tests first (Principle VI)

Write tests in `tests/unit/recommendation/` **before** modifying `engine.ts`:

```bash
npm run test:unit -- --reporter=verbose
```

Required new fixtures:
- No allies locked in → falls back to enemy-only scoring (equals spec 001 behavior)
- No synergy data for any ally pair → uses overall WR for ally component
- Single ally locked in, synergy data present → 50/50 combined score
- Multiple allies locked in → average pairwise synergy, 50/50 combined
- Pool champion already locked by an ally → excluded from recommendations
- Conflicting signals (counters enemies, bad synergy) → ranking reflects combined score

### 3. Start the dev server

```bash
npm run dev
```

The Electron window opens. In `ChampSelectView.vue`, the recommendation panel should
still work as before — ally-aware scoring is transparent when `allyChampionIds` is `[]`.

### 4. Trigger a synergy fetch

Synergy data is fetched on the same cycle as overall stats. Force a manual refresh:

```ts
// In the Electron DevTools console (main process remote):
// Or add a temporary "Refresh Stats" button wired to startStatsRefresh()
```

After the fetch, verify rows in the `champion_synergy` table via the SQLite shell.

### 5. Simulate champion select with ally picks

To test without a live League Client, use the `FixtureLcuAdapter` and populate
`allyChampionIds` in the returned session:

```ts
// tests/contract/fixtures/fixtureLcuAdapter.ts
mockSession.allyChampionIds = [21, 412]   // e.g., MissFortune + Thresh
```

Then call `recommendation.get()` via the IPC bridge (or `DevTools → Console`) and
verify:
- `entries[0].scoreBreakdown.activeSignals` includes `'ally-synergy'`
- `entries[0].scoreBreakdown.enemyMatchupScore` and `allysSynergyScore` are both
  non-zero
- `entries[0].score === entries[0].scoreBreakdown.combinedScore`

### 6. Manual LCU test checklist (constitution requirement)

Required for any PR touching `src/main/lcu/`:

- [ ] Connect the app with the League Client running (not in champion select).
      Verify `champSelect.getStatus()` returns `{ active: false, allyChampionIds: [] }`.
- [ ] Enter champion select in a ranked queue.
      Verify `allyChampionIds` is `[]` before any ally locks in.
- [ ] Wait for a teammate to lock in a champion.
      Verify `allyChampionIds` updates within 1 second and the recommendation panel
      refreshes with the new combined score.
- [ ] Wait for additional ally lock-ins.
      Verify each successive lock-in updates `allyChampionIds` and re-ranks recommendations.
- [ ] Verify `scoreBreakdown` panel shows distinct enemy and ally scores for each
      recommended champion.
- [ ] Disconnect the League Client mid-session.
      Verify the recommendation panel shows the last-known state (cached indicator).
- [ ] Reconnect the League Client.
      Verify the panel resumes live updates and the cached indicator clears.

---

## Key File Locations

| What | File |
|---|---|
| Migration | `src/main/db/migrations/002_add_synergy.sql` |
| Synergy table CRUD | `src/main/db/repositories/synergyRepository.ts` |
| Synergy provider interface | `src/main/stats/synergyProvider.ts` |
| Lolalytics implementation | `src/main/stats/lolalyticsMatchupProvider.ts` |
| Ally score pure function | `src/recommendation/synergy.ts` |
| Extended engine | `src/recommendation/engine.ts` |
| Extended LCU normalization | `src/main/lcu/normalize.ts` |
| Extended snapshot repository | `src/main/db/repositories/snapshotRepository.ts` |
| Extended types | `src/shared/types.ts` |
| Score breakdown UI | `src/renderer/src/pages/ChampSelectView.vue` (or recommendation component) |
| Unit tests | `tests/unit/recommendation/` |
| Synergy contract test | `tests/contract/synergy-provider.test.ts` |
