<!--
Sync Impact Report
==================
Version change: [TEMPLATE] → 1.0.0 (initial ratification)
Modified principles: N/A (first version, all principles newly defined)
Added sections:
  - I. Pool-Constrained Recommendations (NON-NEGOTIABLE)
  - II. Riot API & LCU Compliance (NON-NEGOTIABLE)
  - III. Local-First Data Architecture
  - IV. Business Logic Isolation
  - V. Real-Time Champion Select Responsiveness
  - VI. Test-First for Recommendation Logic
  - VII. Minimal, Justified Dependencies
  - Technology Stack & Architecture Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: None (initial ratification from template placeholders)
Templates requiring updates:
  - .specify/templates/plan-template.md ........ ✅ no changes needed (Constitution
    Check gate is generic/dynamic, derives from this file at plan time)
  - .specify/templates/spec-template.md ........ ✅ no changes needed (generic)
  - .specify/templates/tasks-template.md ........ ✅ no changes needed (generic)
  - .specify/templates/checklist-template.md .... ✅ no changes needed (generic)
  - No command files found under .specify/templates/commands/
  - No project README.md or docs/ found to reconcile
Follow-up TODOs: None
-->

# LoL Best Picker Constitution

## Core Principles

### I. Pool-Constrained Recommendations (NON-NEGOTIABLE)

The recommendation engine MUST NEVER suggest a champion that is not present in the
user's manually curated champion pool. Pool membership is the primary filter,
applied before any statistical ranking; win-rate, matchup, and meta data are used
only to ORDER champions already in the pool, never to introduce champions outside
it. If no pool champion is statistically favorable for the current matchup, the
system MUST still surface the least-unfavorable pool option rather than fall back
to non-pool suggestions. Any future "explore beyond your pool" feature MUST live in
a visually distinct, opt-in section and MUST NOT be blended into the primary
recommendation list.

**Rationale**: This constraint is the product's core value proposition — a focused
tool for players who only want guidance on champions they actually intend to play.
Diluting it with generic meta picks defeats the purpose and erodes user trust.

### II. Riot API & LCU Compliance (NON-NEGOTIABLE)

All interactions with the Riot Games Developer API and the local League Client
Update (LCU) API MUST be read-only and MUST comply with Riot's Developer Policies
and API Terms of Service. The application MUST NOT automate in-game actions
(auto-pick/auto-ban), modify game files or memory, or interact with the game
process directly. Riot API keys MUST be stored outside source control (local
config/SQLite or environment variables) and MUST NEVER be logged or transmitted to
any third party. All Riot API requests MUST respect published rate limits with
backoff/retry handling.

**Rationale**: Violating Riot's policies risks the application being blocked, the
developer's API access being revoked, and end users' accounts being flagged.
Compliance is a hard requirement, not a best-effort goal.

### III. Local-First Data Architecture

SQLite is the single source of truth for the user's champion pool, app
preferences, and cached champion/matchup statistics. The application MUST remain
fully functional for pool management and last-known recommendations when the Riot
API or LCU connection is unavailable, using cached data with a visible "last
updated" indicator. No user data is transmitted to any service other than Riot's
official APIs; the application MUST NOT include third-party analytics, telemetry,
or crash-reporting SDKs by default.

**Rationale**: A desktop tool that becomes useless without connectivity, or that
quietly phones home, fails both the reliability and privacy expectations of its
users.

### IV. Business Logic Isolation

The recommendation algorithm (pool filtering, matchup win-rate scoring,
ranking/tie-breaking) MUST be implemented as pure, framework-agnostic
TypeScript/JavaScript modules with no imports from Electron, Vue, or Vuetify.
These modules MUST be callable and testable in isolation, without launching the
app or mocking IPC/Electron APIs.

**Rationale**: This is the part of the app users are trusting to be correct.
Isolating it from UI/runtime concerns keeps it fast to test, easy to reason about,
and reusable if the UI layer changes later.

### V. Real-Time Champion Select Responsiveness

Once champion select begins, the application MUST detect pick/ban state changes
via the LCU API and refresh on-screen recommendations within 1 second of a
detected change. All LCU polling/event handling MUST run in the Electron main
process and communicate with the renderer via IPC — the Vue renderer MUST NOT
block on network or LCU I/O. Recommendation computation against already-cached
SQLite data MUST complete in under 100ms.

**Rationale**: Champion select has a strict per-pick timer (~30s); a sluggish or
blocking UI during this window makes the tool worse than useless.

### VI. Test-First for Recommendation Logic

Any change to pool-filtering, matchup scoring, or ranking logic MUST be
accompanied by unit tests using realistic fixture data (sample champion pools,
matchup win rates, edge cases) written and reviewed BEFORE the implementation
change is merged. Required edge cases include: empty pool, no cached data for a
matchup, tied scores, and an opposing pick that counters every champion in the
pool.

**Rationale**: Incorrect recommendations directly affect the user's ranked games.
This logic carries the highest trust burden in the app and is cheap to test in
isolation per Principle IV.

### VII. Minimal, Justified Dependencies

New runtime dependencies MUST be justified against what Electron, Node's standard
library, Vue 3, and Vuetify already provide. Prefer Vuetify components over
additional UI/component libraries, and a single well-maintained SQLite driver over
multiple data-access layers.

**Rationale**: Electron applications already ship a full Chromium + Node runtime;
every additional dependency compounds install size, attack surface, and update
burden.

## Technology Stack & Architecture Constraints

- **Application shell**: Electron, with `contextIsolation: true` and
  `nodeIntegration: false` in all renderer windows. All privileged operations
  (SQLite access, LCU API calls, Riot API calls, filesystem) occur in the main
  process and are exposed to the renderer via a typed `contextBridge` preload API.
- **UI**: Vue 3 (Composition API) with Vuetify as the component library. No
  competing CSS or component frameworks.
- **Storage**: SQLite via a single embedded driver, owning three concerns: (1) the
  user's champion pool, (2) cached champion/matchup statistics with fetch
  timestamps, (3) app settings, including the Riot API key.
- **External data**: Riot Games Developer API for champion/matchup statistics; the
  League Client Update (LCU) API (`127.0.0.1` + dynamic port/auth token from the
  running client's lockfile) for live champion-select state.
- **Recommendation engine**: Lives in a dedicated module with zero Electron/Vue
  imports, consumed by the main process and exposed to the renderer via IPC.

## Development Workflow & Quality Gates

- Every pull request touching the recommendation engine (Principle IV) MUST
  include or update unit tests per Principle VI; CI MUST run these tests on every
  push.
- Every pull request MUST state, in its description, how it complies with or
  affects Principles I (pool constraint) and II (Riot/LCU compliance) — "No
  effect" is an acceptable answer when true.
- Since automated end-to-end testing against a live League Client is impractical,
  changes to LCU integration MUST include a manual test checklist (steps performed
  against a real client) in the PR description, covering: connect, champion-select
  start, pick/ban update, and disconnect/reconnect.
- Schema changes to SQLite tables MUST ship with a migration script; the app MUST
  NOT silently drop or ignore user pool data on upgrade.

## Governance

This constitution supersedes all other project practices and ad-hoc conventions.
All pull requests and code reviews MUST verify compliance with the Core Principles
above, with particular attention to Principles I and II, which are
NON-NEGOTIABLE.

Amendments require: (1) a written rationale for the change, (2) an update to this
document via the `/speckit-constitution` workflow including a Sync Impact Report,
and (3) review of dependent templates (plan, spec, tasks) for needed updates.
Versioning follows semantic versioning: MAJOR for removal or redefinition of a
principle, MINOR for adding a new principle or materially expanding guidance,
PATCH for clarifications and wording fixes.

Any deviation from a NON-NEGOTIABLE principle (I or II) MUST be documented in the
relevant plan's Complexity Tracking section with explicit justification and a
remediation plan, and MUST be called out in PR descriptions for reviewer sign-off.

**Version**: 1.0.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-14
