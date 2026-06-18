# Feature Specification: Live Synergy Data via Browser Rendering

**Feature Branch**: `004-puppeteer-synergy-render`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Feature: Live Synergy Data via Browser Rendering — use headless browser rendering to extract real ally synergy win rates from the community stats site, replacing the current fallback-to-overall-win-rate behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Recommendations With Accurate Ally Synergy Scores (Priority: P1)

As a player, during champion select I want the ally synergy component of my recommendations to reflect real champion-pair win rates rather than the champion's overall win rate, so that when allies are locked in the tool gives me genuinely informed guidance on who to pick.

**Why this priority**: This is the entire motivation for the feature. Currently the synergy label is displayed but the underlying data is the overall win rate fallback — the signal carries no real information. Fixing this is the primary user value.

**Independent Test**: Can be fully tested by entering champion select with at least one ally locked in, then comparing the recommended champion's displayed synergy score against the overall win rate for the same champion. If they differ, live synergy data is being used.

**Acceptance Scenarios**:

1. **Given** the app has completed a successful synergy data refresh, **When** a player enters champion select with one or more allies locked in, **Then** the recommendation panel shows ally synergy scores that reflect champion-pair win rates from the stats source (not identical to each champion's overall win rate).
2. **Given** a recommendation is displayed with a synergy component, **When** the player views the score breakdown, **Then** the synergy figure is traceable to the ally pair combination actually present in the session.
3. **Given** synergy data has been fetched for the current pool, **When** the player changes their ally composition (different ally locks in), **Then** the synergy component updates to reflect the pair involving the newly locked-in ally.

---

### User Story 2 - App Remains Fully Functional When Live Data Cannot Be Fetched (Priority: P2)

As a player, I want the app to keep showing recommendations even when the synergy data refresh fails or the stats site is unreachable, so that a network outage or site change never blocks me from using the tool during champion select.

**Why this priority**: Reliability is table-stakes. A feature that works 90% of the time but breaks the rest is worse than the current fallback-only behavior, which is silent and consistent.

**Independent Test**: Can be fully tested by blocking network access during a refresh cycle and confirming recommendations still appear (using cached or fallback data) with no error state that prevents the user from seeing picks.

**Acceptance Scenarios**:

1. **Given** the stats site is unreachable during a scheduled refresh, **When** the refresh cycle runs, **Then** the app continues to display recommendations using previously cached synergy data (or overall win rate if no cache exists), with no crash or empty recommendation panel.
2. **Given** the data extraction process exceeds the allowed time limit, **When** the timeout occurs, **Then** the app logs the failure, preserves any existing cached data, and proceeds normally on the next refresh cycle.
3. **Given** the stats site's page structure has changed and synergy data cannot be located, **When** the extraction attempt fails, **Then** the app falls back gracefully and the player is not shown an error that interrupts champion select.

---

### User Story 3 - Data Freshness Indicator Distinguishes Live From Cached Synergy (Priority: P3)

As a player, I want to see whether the synergy component of my recommendations came from a recent live fetch or from older cached data, so I know how much to trust the synergy signal when making my pick decision.

**Why this priority**: Transparency about data quality lets informed players weight the signal appropriately. This is a visibility improvement, not a core correctness issue, hence P3.

**Independent Test**: Can be fully tested by observing the freshness indicator in the recommendation panel after a successful live fetch vs. after deliberately triggering a fallback (e.g., by blocking the network during refresh), and confirming the label differs between the two states.

**Acceptance Scenarios**:

1. **Given** synergy data was obtained from a successful live fetch during the most recent refresh, **When** the player views the recommendation panel, **Then** the freshness label for synergy data reflects that it was recently and successfully sourced from the live stats site.
2. **Given** the most recent refresh failed and the app is using data from a prior successful fetch, **When** the player views the recommendation panel, **Then** the freshness label for synergy data reflects that it is from a cached fetch, including how old that data is.
3. **Given** no synergy data has ever been fetched (first run), **When** the player views the recommendation panel, **Then** the freshness label indicates that live synergy data is not yet available, and the fallback (overall win rate) is being used.

---

### Edge Cases

- What happens when the stats site loads but the synergy table never appears within the allowed time? The refresh records a timeout failure for that champion and moves to the next, preserving any previously cached data.
- What if a pool champion has no synergy data on the stats site (new champion, low sample size)? The system falls back to that champion's overall win rate for the synergy component, silently and consistently.
- What happens when a synergy data refresh is already in progress when champion select begins? The in-progress refresh is not interrupted; champion select uses whichever data is already cached in storage.
- What if the user's pool changes (champion added/removed) between refresh cycles? The next scheduled refresh automatically targets the updated pool; mid-cycle pool changes do not alter the running refresh.
- What happens when the app is offline for multiple days and cached synergy data is very old? The freshness indicator shows the age accurately; no data is discarded simply because it is old.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch live ally synergy win rates for each pool champion from the community stats site during each scheduled refresh cycle.
- **FR-002**: System MUST only fetch synergy data for champions currently in the user's pool — not for all champions in the game.
- **FR-003**: System MUST incorporate live synergy win rates into ally-aware recommendations when that data is available in storage.
- **FR-004**: System MUST fall back to cached synergy data from a prior successful fetch when the current refresh fails.
- **FR-005**: System MUST fall back to a pool champion's overall win rate for the synergy component when no synergy data (live or cached) is available for a particular champion.
- **FR-006**: System MUST complete a synergy data refresh for a pool of up to 10 champions within 60 seconds, including all network and page-loading overhead.
- **FR-007**: System MUST store fetched synergy data persistently so it is available across app restarts.
- **FR-008**: System MUST record a data-source attribute for each stored synergy record, distinguishing live-fetched data from cached/fallback data.
- **FR-009**: System MUST display a freshness indicator in the recommendation panel that reflects the source and age of the synergy data currently in use.
- **FR-010**: System MUST NOT disrupt or delay the champion select recommendation display while a background synergy refresh is in progress.
- **FR-011**: System MUST apply a maximum wait time per champion during page rendering; if a synergy table does not appear within this limit, the system records a failure for that champion and continues with the rest of the pool.
- **FR-012**: System MUST trigger synergy data refresh on the same schedule as the existing matchup data refresh (24-hour cycle), not on every champion select session.
- **FR-013**: System MUST document the rationale for adding a headless browser dependency in the project's architecture reference, per the minimal-dependencies principle.

### Key Entities *(include if feature involves data)*

- **Ally Synergy Record** (extended): Existing entity that stores per-champion pair win rate and timestamp. Extended to add a `source` field indicating whether the record was obtained from a live page render or read from a prior cache, and a `fetch_status` field (success / timeout / extraction-failure) for the most recent refresh attempt.
- **Synergy Refresh Job**: Represents one scheduled execution of the synergy data refresh cycle. Attributes: start time, end time, number of champions targeted, number succeeded, number failed, overall status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a successful refresh, at least one pool champion's displayed synergy score differs from that champion's overall win rate — demonstrating real pair data is in use.
- **SC-002**: A complete synergy refresh for a 10-champion pool finishes in under 60 seconds from start to storage commit.
- **SC-003**: When all live fetches fail during a refresh, 100% of recommendations remain visible with no error state blocking the recommendation panel.
- **SC-004**: The recommendation panel shows a freshness indicator for synergy data that correctly reflects "live" vs. "cached" vs. "unavailable" across all three scenarios.
- **SC-005**: A unit test that feeds a sample HTML document to the extraction function produces the correct `NormalizedSynergyRow[]` output — validating the parsing logic in isolation from network or rendering.

## Assumptions

- The community stats site is lolalytics.com, already used for matchup data; synergy tables are present on champion build/matchup pages and are reachable without authentication.
- The scheduled refresh cycle (every 24 hours) is shared with matchup data; no separate scheduling infrastructure is needed.
- No new user-facing settings are introduced; the headless rendering runs transparently in the background.
- The existing freshness indicator infrastructure (from spec 001) is extended rather than replaced; only the synergy-specific label needs to be added.
- Pool size for the 60-second performance requirement is capped at 10 champions, representing a typical user pool; users with larger pools may experience proportionally longer refresh times.
- The app is not expected to run headless rendering during active champion select — only during the background scheduled refresh.
- Constitution VII compliance requires documenting the new dependency's justification (the only way to access lazy-loaded synergy data client-side is to execute the page's JavaScript); this documentation is a deliverable, not optional.
