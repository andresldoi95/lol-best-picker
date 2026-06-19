# Feature Specification: Role-Based Ban Recommendations

**Feature Branch**: `007-role-based-bans`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "I would like to show recommended bans for my current session elo, at least top 3 for each role without caring the current role i was assigned! for example, 3 for top, 3 for jg, 3 for mid, 3 for adc and 3 for support..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Ban Recommendations Before Champion Select (Priority: P1)

A player opens the app before entering champion select and needs to see which champions are strongest to ban in their current Elo bracket, organized by role so they can make an informed banning decision regardless of their assigned role.

**Why this priority**: This is the core value—enabling informed ban decisions is the primary user need.

**Independent Test**: The app displays a ban recommendations view with top 3 champions per role (top, jungle, mid, adc, support) based on win rate at the user's session Elo. This alone delivers complete value.

**Acceptance Scenarios**:

1. **Given** the user is logged into a League account, **When** they open the app before champion select, **Then** they see a "Recommended Bans" section showing top 3 champions per role ranked by win rate at their Elo
2. **Given** the app has loaded live win rate data, **When** the user views the ban recommendations, **Then** each role (top, jungle, mid, adc, support) displays exactly 3 champions in descending order of win rate
3. **Given** the user has an assigned role during champion select, **When** they view ban recommendations, **Then** the display includes recommendations for all 5 roles, not just their assigned role
4. **Given** ban data is available but a specific role has fewer than 3 strong champions, **When** the user views that role's recommendations, **Then** the app shows all available recommendations (fewer than 3) with clear indication of data availability

---

### User Story 2 - Distinguish Recommended Bans from Pick Recommendations (Priority: P1)

The user needs a clear visual separation between recommended champions to **ban** and recommended champions to **pick** so they don't confuse which list is which.

**Why this priority**: Critical for usability—confusion between bans and picks could lead to poor decisions.

**Independent Test**: The UI clearly labels and visually separates "Recommended Bans" from "Recommended Picks" in a way that's immediately distinguishable at a glance.

**Acceptance Scenarios**:

1. **Given** the app displays both pick and ban recommendations, **When** the user views the interface, **Then** the ban recommendations section is distinctly labeled (e.g., "Recommended Bans") and visually differentiated from picks (e.g., different color, section, or icon)
2. **Given** the user is viewing the app, **When** they look at the ban list, **Then** they can immediately identify it as bans without reading help text

---

### User Story 3 - See Freshness Indicator for Ban Data (Priority: P2)

The user needs to know whether the ban recommendations are based on live data or cached/stale data, following the same freshness pattern as pick recommendations.

**Why this priority**: Consistency with existing pattern and user trust—stale data should be clearly marked.

**Independent Test**: Ban recommendations display a freshness indicator (live/cached/stale) similar to pick recommendations, allowing users to gauge data confidence.

**Acceptance Scenarios**:

1. **Given** live ban data has been successfully fetched, **When** the user views recommendations, **Then** a "Live" freshness indicator is shown next to the ban section
2. **Given** ban data could not be fetched but cached data exists, **When** the user views recommendations, **Then** a "Cached" or "Estimated" freshness indicator is displayed
3. **Given** no fresh data is available, **When** the user views recommendations, **Then** a "Stale" indicator is shown with a clear visual distinction (e.g., muted color, warning icon)

---

### Edge Cases

- What happens when live Elo data is unavailable—does the app use cached data or show no recommendations?
- If the user hasn't ranked yet this season (no Elo assigned), how should the app display ban recommendations (use all-rank data, show a message)?
- What if a role has fewer than 3 ban-worthy champions at a given Elo (e.g., very high Elo with narrow meta)—should the app show fewer than 3 or pad with fallback picks?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch live ban recommendation data (champion win rates per role) from stats provider at user's current Elo
- **FR-002**: System MUST display at least 3 recommended ban champions per role (top, jungle, mid, adc, support), ranked by win rate descending
- **FR-003**: System MUST display ban recommendations independently of the user's assigned role during champion select
- **FR-004**: System MUST provide cached/fallback ban recommendations when live data fetch fails, using the same data freshness approach as pick recommendations
- **FR-005**: System MUST display a freshness indicator (live/cached/stale) alongside ban recommendations
- **FR-006**: System MUST use the same stats provider (lolalytics) for ban recommendations as for pick recommendations to ensure data consistency
- **FR-007**: Users MUST be able to visually distinguish ban recommendations from pick recommendations in the UI (e.g., separate section, distinct color scheme, or icon)
- **FR-008**: System MUST rank champions by win rate at the user's current session Elo (from LCU rank/division data)
- **FR-009**: System MUST degrade gracefully when Elo data is unavailable—either use a default Elo tier or show a message explaining why recommendations are limited

### Key Entities

- **Ban Recommendation**: A champion recommended for banning in a specific role, with associated win rate and ranking
- **Role**: One of five League positions (top, jungle, mid, adc, support) for organizing ban recommendations
- **Elo/Rank Tier**: User's current ranked tier (e.g., Gold, Platinum, Diamond) used to filter appropriate ban statistics

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ban recommendations load within 2 seconds of the app opening (or instantly if cached)
- **SC-002**: Users can view 15 ban recommendations (3 per role × 5 roles) in a single screen without excessive scrolling
- **SC-003**: Freshness indicator clearly distinguishes live from cached/stale data in under 1 second of viewing
- **SC-004**: Users can make a ban decision within 30 seconds of viewing recommendations (UX metric: no confusion between ban and pick lists)
- **SC-005**: 90% of displayed ban recommendations align with meta data (top 10 pick rate / win rate champions at each Elo tier when validated against external stats)

## Assumptions

- **User's Elo is available**: The app can query LCU to retrieve the user's current ranked tier and division. If unavailable, the app falls back to a default tier or disables ban recommendations.
- **Stats provider coverage**: Lolalytics provides win rate data for all champions at all Elo tiers; gaps are filled with cached data or a note to the user.
- **Ban recommendations use existing stats infrastructure**: The app reuses the existing lolalytics integration (FetchStatsProvider, parseSynergyDom, caching layer) rather than adding a new provider.
- **UI framework ready**: Vuetify and Vue 3 components can accommodate a new ban recommendations section without major layout redesign; positioning and styling follow existing design patterns (e.g., similar card layout to pick recommendations).
- **No synergy data required for bans**: Ban recommendations are based on win rate only, not synergy (unlike pick recommendations which may consider team composition). Synergy data is not fetched for ban recommendations.
- **Offline fallback**: When offline, cached ban recommendations are displayed with a "Stale" indicator; the app remains usable.
