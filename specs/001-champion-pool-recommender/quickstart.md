# Quickstart: Champion Pool Recommender

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Prerequisites

- Node.js ≥ 20 (matches the Node runtime bundled with current Electron releases)
- Windows 10/11 (primary dev/target platform; the League Client itself is
  Windows/macOS only)
- (Optional, for live champ-select testing) the League of Legends client
  installed and logged in

## Setup

```powershell
npm install
npm run dev          # electron-vite dev: launches Electron with HMR for the Vue renderer
```

On first run, the app:
1. Creates/migrates the SQLite database (`src/main/db/migrations/001_initial.sql`
   and any later migrations) in the app's user-data directory.
2. Seeds `champions` from the bundled Data Dragon snapshot.
3. Seeds `champion_stats` from the bundled baseline statistics snapshot (so a
   recommendation can be shown before any network fetch completes — SC-006).
4. Kicks off a background `UggStatsProvider` refresh (research.md §1).
5. Attempts an LCU connection (no-op, non-fatal if the League Client isn't
   running — research.md §2).

## Running Tests

```powershell
npm run test          # vitest run — unit + contract tests
npm run test:watch    # vitest watch mode during development
```

`tests/unit/recommendation/` requires no Electron runtime (pure TypeScript,
Constitution Principle IV) and is the fastest feedback loop when changing
ranking/tie-break/fallback logic.

## Manual Verification (per User Story)

These mirror each user story's "Independent Test" in [spec.md](./spec.md) and
should be run against the built app (`npm run dev` or a packaged build).

### US1 — Manage My Champion Pool by Role (P1)

1. Open the **Pool Management** screen (empty on first run).
2. Add a champion, assign it one or more roles (e.g., Ahri → Middle).
3. Confirm it appears under each assigned role.
4. Remove one role tag from a champion that has multiple roles; confirm the
   champion remains under its other role(s) and disappears from the removed
   role's recommendations.
5. Re-add the same champion/role pair; confirm no duplicate entry is created
   (FR-005).
6. Restart the app (`npm run dev` again, or close/reopen the packaged app);
   confirm the pool — including role tags — is unchanged (FR-004).

### US2 — Best Pick Recommendation During Champion Select (P2)

> Requires a running League Client (or recorded LCU fixtures wired into a dev
> "simulate champ select" mode, if implemented).

1. Ensure the pool has ≥ 1 champion tagged for the role you intend to play.
2. Enter a custom/practice game champion select (or use a dev fixture) so the
   LCU reports `assignedPosition`.
3. Open the app's **Champion Select** view; confirm:
   - The top recommendation is a pool champion tagged for your assigned role
     (SC-002).
   - With no enemies revealed yet, champions are ranked by overall win rate
     (FR-011).
4. Lock in / reveal an enemy champion; confirm the recommendation list re-ranks
   within ~1 second (FR-010, SC-003).
5. If automatic role detection is unavailable, confirm the app offers a manual
   role selector (FR-007) and that selecting a role immediately scopes
   recommendations to that role's pool entries.
6. Temporarily empty the pool for the assigned role; confirm the empty-state
   message appears (FR-013) instead of a recommendation.

### US3 — Cached Recommendation When Data Is Stale / Disconnected (P3)

1. With the app already showing a `live` recommendation, disconnect network
   access (or stop whatever the `UggStatsProvider` talks to).
2. Trigger a refresh (or wait for the scheduled one); confirm the previous
   recommendation remains visible with a `cached` indicator and a "last updated"
   timestamp (US3 AC1, FR-014).
3. Manually set `app_settings.stats_freshness_hours` very low (e.g., `0`) via the
   Settings screen, or back-date `last_stats_fetch_at` in the dev database;
   confirm the indicator switches to `stale` (US3 AC2).
4. Quit the League Client (or never start it) and launch the app; confirm a
   role-eligible, pool-based recommendation still renders using cached/baseline
   stats — no error or blank screen (US3 AC3, SC-005).
5. Restore connectivity and trigger a refresh; confirm the indicator returns to
   `live` and the recommendation reflects refreshed data (US3 AC4).

## LCU Integration Manual Checklist

Per the constitution's Development Workflow gate, any change touching
`src/main/lcu/` must be exercised against a real League Client covering:
**connect**, **champion-select start**, **pick/ban update**, and
**disconnect/reconnect** — record the steps performed in the PR description.
