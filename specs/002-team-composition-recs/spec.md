# Feature Specification: Composition-Aware Recommendations

**Feature Branch**: `002-team-composition-recs`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "now we need to add a new feature... right now it is calculating wr against enemy team... but what about our composition? we will need to also show recommendations based in our composition and enemies..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Recommendations That Account for Both Allies and Enemies (Priority: P1)

As a player, during champion select I want my pool recommendations to reflect not only how well each champion counters the enemy picks but also how well they synergize with my allies already locked in, so that my pick strengthens the overall team composition rather than just countering opponents in isolation.

**Why this priority**: This is the core value of the new feature — expanding the existing enemy-only ranking signal to a combined score that captures both counter-picking and team synergy. It directly extends the existing recommendation flow (US2 from the base feature) and gives the player a more holistic decision.

**Independent Test**: Can be fully tested by configuring a pool, entering champion select with at least one ally and one enemy locked in, and confirming that the displayed ranking differs from the enemy-only ranking in a way consistent with the ally synergy data for the champions involved.

**Acceptance Scenarios**:

1. **Given** one or more ally champions are locked in and one or more enemy champions are revealed, **When** the player views the recommendation panel, **Then** the recommendation ranking reflects a combined score that incorporates both ally synergy and enemy matchup performance.
2. **Given** the ally-aware recommendation is displayed, **When** the player inspects any recommended champion, **Then** they can see the breakdown showing the ally synergy contribution and the enemy matchup contribution to that champion's score.
3. **Given** no ally champions have been locked in yet but enemies are visible, **When** the player views recommendations, **Then** the system falls back to enemy-only scoring identical to the existing behavior.
4. **Given** ally champions are locked in but no enemy champions have been revealed, **When** the player views recommendations, **Then** the system ranks role-eligible pool champions by their synergy with the current ally picks.
5. **Given** neither allies nor enemies have locked in yet, **When** the player views recommendations, **Then** the system ranks role-eligible pool champions by their overall win rate for the assigned role (identical to the existing baseline behavior).

---

### User Story 2 - Recommendations Update When Allies Lock In Champions (Priority: P2)

As a player, I want the recommendation list to refresh automatically each time a teammate locks in their champion during draft, so that the synergy scoring always reflects the most current state of my team.

**Why this priority**: Champion select is a sequential process — allies lock in one by one. Real-time responsiveness to ally picks is what makes the synergy signal actionable, not just informational after the fact.

**Independent Test**: Can be fully tested by observing the recommendation list before and after a simulated ally lock-in event, confirming the ranking updates within an acceptable time and the new ranking reflects the updated ally composition.

**Acceptance Scenarios**:

1. **Given** a recommendation list is visible, **When** a teammate locks in a champion, **Then** the recommendation ranking refreshes to incorporate the newly locked-in ally pick into the synergy score.
2. **Given** multiple allies lock in champions in sequence, **When** each successive ally lock-in occurs, **Then** the recommendation ranking updates each time to reflect the growing ally composition.
3. **Given** a recommendation list is visible and an ally pick is detected, **When** the ranking refreshes, **Then** the update is visible to the player within 1 second of the lock-in event.

---

### User Story 3 - Understand the Score Breakdown for Any Recommendation (Priority: P3)

As a player, I want to see what drives each champion's combined score — specifically how much of the ranking is from enemy counter-picking vs. ally synergy — so I can make an informed decision when the two signals conflict (e.g., great counter but poor synergy with allies).

**Why this priority**: Transparency in the combined score prevents the recommendation from being a black box. When a player disagrees with the top pick, understanding the signal split lets them override intelligently rather than blindly.

**Independent Test**: Can be fully tested by hovering or selecting a recommended champion in a champion select state with both ally and enemy picks present, and confirming the displayed breakdown shows distinct, accurate contributions from the enemy matchup and ally synergy components.

**Acceptance Scenarios**:

1. **Given** a combined recommendation is displayed, **When** the player selects or expands a champion entry, **Then** the system shows the enemy-matchup score contribution and the ally-synergy score contribution separately.
2. **Given** a champion scores very well against enemies but poorly with allies (or vice versa), **When** the breakdown is shown, **Then** the diverging signals are clearly legible so the player understands the trade-off.
3. **Given** only one signal is active (allies only, or enemies only), **When** the player views the breakdown, **Then** the breakdown correctly shows 100% weight on the active signal and indicates the other is not yet available.

---

### Edge Cases

- What happens when synergy data for a specific ally-champion pair is unavailable? The system must fall back to the pool champion's overall win rate for the assigned role for the synergy component, rather than omitting the champion or failing.
- What if an ally champion that was already locked in is swapped out during champion select? The system must remove the swapped-out ally from the synergy calculation and re-rank accordingly.
- What happens when all role-eligible pool champions have equally poor synergy with the ally composition? The system still shows the least-unfavorable option ranked first — never an empty recommendation.
- What if the same champion appears on both the ally team and as a pool recommendation candidate? That pool champion becomes ineligible for recommendation (cannot play the same champion as a teammate) and is excluded with a clear reason.
- What happens when there are conflicting signals — a pool champion counters every enemy but has low synergy with allies? The combined score determines ranking; the breakdown makes the conflict visible to the player (US3).
- What if the player has no pool champions with any recorded synergy data? The system falls back to enemy-only scoring and notifies the player that synergy data is unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect which ally champions have been locked in during the current champion select session.
- **FR-002**: System MUST retrieve ally-synergy statistics for each role-eligible pool champion relative to the currently locked-in ally composition.
- **FR-003**: System MUST compute a combined score for each role-eligible pool champion that incorporates both enemy matchup performance (existing) and ally synergy performance (new).
- **FR-004**: System MUST rank role-eligible pool champions by their combined score when at least one ally pick has been locked in.
- **FR-005**: System MUST update the combined-score ranking each time an ally champion locks in or the enemy lineup changes during champion select.
- **FR-006**: System MUST fall back to enemy-only scoring (existing behavior) when no ally champions have been locked in yet.
- **FR-007**: System MUST fall back to ally-synergy-only scoring when ally picks are present but no enemy champions have been revealed.
- **FR-008**: System MUST rank role-eligible pool champions by overall win rate for the assigned role when neither ally picks nor enemy picks are present.
- **FR-009**: System MUST display, for each recommended champion, a visible breakdown of the score showing the enemy matchup contribution and the ally synergy contribution as separate values.
- **FR-010**: System MUST exclude from recommendations any pool champion that is already locked in by an ally on the player's team.
- **FR-011**: System MUST fall back to a pool champion's overall win rate for the assigned role for the synergy component when matchup-specific ally synergy data is unavailable for a particular pairing.
- **FR-012**: System MUST handle ally champion swaps (one ally replaces their locked champion with a different one) by recalculating the synergy component and re-ranking recommendations.
- **FR-013**: System MUST apply the combined score using an equal 50/50 weighting between the enemy matchup component and the ally synergy component.
- **FR-014**: System MUST notify the player when no synergy data is available for any role-eligible pool champion, and fall back to enemy-only scoring in that case.

### Key Entities *(include if feature involves data)*

- **Champion Select Session** *(extended)*: Adds a list of locked-in ally champions (by champion identity) to the existing session state. Attribute: `ally_picks` (ordered list of champion identities currently locked in by teammates).
- **Ally Synergy Record**: Aggregated performance data for a champion played alongside a specific ally champion. Attributes: pool champion identity, ally champion identity, pool champion's role, synergy win rate, number of games, last-fetched timestamp.
- **Combined Score**: The computed ranking value for a pool champion in a given champion select context. Attributes: pool champion identity, enemy matchup component (score), ally synergy component (score), combined score (weighted aggregate), weighting configuration snapshot.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When at least one ally champion is locked in, the recommendation ranking updates within 1 second of each ally lock-in event.
- **SC-002**: 100% of combined-score recommendations displayed during a champion select with ally picks show a score breakdown distinguishing the enemy matchup and ally synergy components — no black-box scores.
- **SC-003**: When synergy data is unavailable for any pool champion, the player receives a visible fallback notice rather than a silent omission or blank screen.
- **SC-004**: A pool champion that is already locked in by an ally is never shown as a recommendation — 0 exceptions.
- **SC-005**: The recommendation panel remains responsive (updates visible within 1 second) for pools of up to 30 champions and ally compositions of up to 4 champions.

## Assumptions

- "Ally picks" means champions locked in by teammates during champion select under normal draft-pick visibility rules; champions merely hovered (not locked) are not included.
- Ally synergy statistics are sourced from the same external statistics provider already used for enemy matchup data (lolalytics), using their champion-with-champion win rate data for the assigned role.
- The weighting between enemy matchup score and ally synergy score is a configurable value that must be clarified (see FR-013) — no default is assumed until the clarification question is answered.
- Ally synergy is scored per individual ally-champion pair; when multiple allies are locked in, the synergy component is the average (or aggregate) of pair-wise synergy scores — the exact aggregation method is an implementation detail for planning.
- The existing enemy-matchup logic, caching behavior, and data-freshness indicators from the base feature (spec 001) are reused and extended, not replaced.
- Champion select role detection and manual role override remain as specified in the base feature — this feature does not change how the player's role is determined.
- Only ranked queue champion select sessions are in scope, consistent with the base feature's "ranked game" focus.
