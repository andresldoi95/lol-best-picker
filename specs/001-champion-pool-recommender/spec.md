# Feature Specification: Champion Pool Recommender

**Feature Branch**: `001-champion-pool-recommender`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "As a ranked League of Legends player, during champion select I want to see my best pick recommendation drawn only from my personal champion pool, ranked by win rate against the enemies already picked. I can manage my pool (add/remove champions) from a settings screen. If my pool's data is stale or the game client isn't connected, I still see my last-known recommendation with an indicator that it's cached."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage My Champion Pool by Role (Priority: P1)

As a player, I want to build and maintain a personal list of champions I actually play, tagged by the role(s) I play them in (Top, Jungle, Middle, Bottom, Support), so that every recommendation the tool ever shows me is something I'm willing and able to pick **for the role I'm assigned that game**.

**Why this priority**: This is the foundational data every other capability depends on. Without a role-tagged pool, there is nothing to recommend from, and recommendations cannot be matched to the player's assigned role. It also delivers immediate standalone value — a persistent, personal record of the player's mains per role.

**Independent Test**: Can be fully tested by opening the pool management screen, adding several champions with one or more role tags each, removing a champion/role combination, and confirming — including after closing and reopening the app — that the pool contains exactly the expected champion/role entries.

**Acceptance Scenarios**:

1. **Given** an empty champion pool, **When** the player adds a champion and assigns it one or more roles, **Then** that champion appears in the pool under each assigned role and becomes eligible for recommendations when the player is assigned that role.
2. **Given** a champion pool containing at least one entry, **When** the player removes a champion from a specific role, **Then** that champion no longer appears in the pool (or in recommendations) for that role, but remains for any other roles it is still tagged with.
3. **Given** a player has configured their pool, **When** they close and reopen the application, **Then** their pool — including all role tags — is unchanged.
4. **Given** a champion is already in the player's pool under a given role, **When** the player attempts to add it again under that same role, **Then** the system does not create a duplicate entry.
5. **Given** a champion is already in the player's pool under one role, **When** the player adds an additional role tag to that champion, **Then** the champion becomes eligible for recommendations in both roles.

---

### User Story 2 - See Best Pick Recommendation During Champion Select (Priority: P2)

As a player, during champion select I want the tool to detect the role I've been assigned and show me, from only the pool champions I've tagged for that role, which one gives me the best chance to win against the enemies already picked — ranked from best to worst.

**Why this priority**: This is the core value proposition of the tool — turning the player's curated, role-tagged pool and real statistics into an actionable, in-the-moment decision during the highest-pressure phase of a ranked game.

**Independent Test**: Can be fully tested by configuring a pool with champions tagged for a given role, entering champion select assigned to that role, revealing one or more enemy champions, and confirming the displayed top recommendation is always a pool champion tagged for the assigned role, ordered by win rate (for that role) against the revealed enemies.

**Acceptance Scenarios**:

1. **Given** a champion pool with at least one champion tagged for the player's assigned role, and an active champion select where at least one enemy champion is locked in, **When** the player views the recommendation panel, **Then** the system displays the role-eligible pool champion with the highest win rate (for the assigned role) against the revealed enemy champion(s) as the top recommendation.
2. **Given** champion select where additional enemy champions are revealed over time, **When** a new enemy pick is locked in, **Then** the recommendation list re-ranks among role-eligible pool champions to reflect the updated matchup information.
3. **Given** a pool with champions tagged for the assigned role and a champion select where no enemy champions have been revealed yet, **When** the player views the recommendation panel, **Then** the system displays role-eligible pool champions ranked by their overall win rate for that role.
4. **Given** every role-eligible pool champion has an unfavorable matchup against the revealed enemies, **When** the player views recommendations, **Then** the system still shows the least-unfavorable role-eligible champion as the top pick — never a champion outside the pool, and never a champion tagged only for a different role.
5. **Given** the player's pool has no champions tagged for their assigned role (whether or not the pool has entries for other roles), **When** champion select begins, **Then** the system displays a message indicating no pool champions are configured for the current role, and shows no recommendation.
6. **Given** the system cannot automatically detect the player's assigned role, **When** champion select begins, **Then** the player can manually select their role for that session to receive role-eligible recommendations.

---

### User Story 3 - See a Cached Recommendation When Data Is Stale or the Client Is Disconnected (Priority: P3)

As a player, if the live game connection drops or fresh statistics aren't available, I still want to see my last-known recommendation, clearly marked as cached, rather than an error or a blank screen.

**Why this priority**: Ensures the tool remains useful and trustworthy under real-world conditions (network hiccups, client not running yet) — a graceful-degradation enhancement on top of the core experience in User Story 2.

**Independent Test**: Can be fully tested by populating the cache once (a successful fetch), then simulating loss of connection to the statistics source and/or the game client, and confirming the last-known recommendation is still shown with a visible "cached" / "last updated" indicator.

**Acceptance Scenarios**:

1. **Given** champion statistics were successfully fetched and cached previously, **When** the statistics source becomes unreachable, **Then** the system displays the most recent cached recommendation along with a visible indicator of when the data was last updated.
2. **Given** cached data has exceeded the freshness threshold, **When** the player views the recommendation panel, **Then** the system displays a "stale data" indicator alongside the recommendation.
3. **Given** the game client is not running or not detected, **When** the player opens the application, **Then** the system displays role-eligible, pool-based recommendations using cached/baseline statistics rather than an error or blank screen.
4. **Given** connectivity is restored and statistics are successfully refreshed, **When** the player next views the recommendation panel, **Then** the "cached" / "stale" indicator is cleared and the recommendation reflects the refreshed data.

---

### Edge Cases

- What happens when the player's pool contains a champion that no longer exists in current game data (e.g., removed or merged by the game publisher)? The pool list must still render correctly, and that entry should be flagged or excluded from recommendations without breaking the rest of the pool.
- How does the system handle a tie — two or more role-eligible pool champions with identical win-rate scores against the revealed enemies? A deterministic tie-breaking rule must apply so the displayed order is stable and repeatable.
- What happens when statistics for a specific pool-champion-vs-enemy-champion matchup (for the assigned role) have never been recorded (not just stale, but entirely absent)? The system must fall back to that champion's overall win rate for the role rather than omitting the champion or failing.
- What happens if the player opens the tool before champion select has started? The system shows the role-eligible pool ranked by overall win rate for that role (consistent with Acceptance Scenario US2-3), using the role from the player's most recent game or a manually selected role.
- What happens if the player's role-eligible pool becomes empty while champion select is already active (e.g., they removed their last champion for that role)? The system immediately reflects the empty-state messaging from US2-5.
- What happens if the player is auto-filled into a role they have no pool entries for at all? Same empty-state messaging (US2-5); the player's pool for their preferred roles remains untouched for future games.
- What happens if the detected assigned role changes mid-session (e.g., a swap is agreed in champion select)? The system re-detects the role and refreshes recommendations to match the new role's eligible pool champions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the player to add any valid champion to their personal champion pool.
- **FR-002**: System MUST allow the player to tag each champion pool entry with one or more roles/positions (Top, Jungle, Middle, Bottom, Support).
- **FR-003**: System MUST allow the player to remove a champion from their pool, either entirely or for a specific role only (leaving other role tags for that champion intact).
- **FR-004**: System MUST persist the player's champion pool, including all role tags, across application restarts.
- **FR-005**: System MUST prevent duplicate pool entries for the same champion under the same role; the same champion MAY appear in the pool under multiple different roles.
- **FR-006**: System MUST detect when the player enters champion select in a ranked game.
- **FR-007**: System MUST detect the player's assigned role/position for the current champion select, and MUST allow the player to manually select or override the role for that session if automatic detection is unavailable or incorrect.
- **FR-008**: System MUST limit every recommendation shown during champion select exclusively to champions in the player's pool that are tagged for the player's assigned (or manually selected) role — never recommending a champion outside the pool, and never a champion tagged only for a different role.
- **FR-009**: System MUST rank role-eligible pool champions by their win rate, for the assigned role, against the specific enemy champions already revealed in the current champion select.
- **FR-010**: System MUST update the recommendation ranking whenever the set of revealed enemy champions changes during champion select.
- **FR-011**: System MUST rank role-eligible pool champions by their overall win rate for the assigned role when no enemy champions have been revealed yet.
- **FR-012**: System MUST display the least-unfavorable role-eligible pool champion as the top recommendation even when every role-eligible champion has an unfavorable matchup against the revealed enemies.
- **FR-013**: System MUST display a clear empty-state message instead of a recommendation when the player has no pool champions tagged for their assigned (or manually selected) role.
- **FR-014**: System MUST display the most recently cached recommendation, with a visible "last updated" indicator, when current statistics cannot be retrieved.
- **FR-015**: System MUST visually distinguish a "live" recommendation from a "cached" or "stale" one.
- **FR-016**: System MUST apply a defined, deterministic tie-breaking rule when two or more role-eligible pool champions have equal win-rate scores for the current matchup context.
- **FR-017**: System MUST fall back to a champion's overall win rate for the assigned role when matchup-specific statistics against a particular revealed enemy are unavailable.
- **FR-018**: System MUST flag or exclude pool champions that are no longer valid in current game data, without removing them from the player's saved pool or breaking the pool display.

### Key Entities *(include if feature involves data)*

- **Champion Pool Entry**: A (champion, role) pairing the player has chosen as part of their personal pool. Attributes: champion identity, role/position tag, date added.
- **Champion Statistics**: Win-rate data for a champion within a specific role. Attributes: champion identity, role, opposing champion identity (optional, for matchup-specific records), win rate, number of games the statistic is based on, last-fetched timestamp.
- **Champion Select Session**: The live state of an in-progress champion select. Attributes: revealed enemy champion picks, player's assigned or manually selected role, session active/inactive status, last-updated timestamp.
- **Recommendation**: The computed output shown to the player. Attributes: ranked list of role-eligible pool champions with scores, data freshness status (live / cached / stale), timestamp of the underlying data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player with role-eligible pool champions sees a ranked recommendation within 2 seconds of champion select beginning.
- **SC-002**: 100% of champions ever shown in a recommendation are members of the player's pool AND tagged for the player's assigned (or manually selected) role — zero exceptions.
- **SC-003**: When an enemy champion pick changes during champion select, the displayed recommendation reflects the change within 1 second.
- **SC-004**: A player can add, remove, or change the role tags of a pool champion in under 10 seconds from opening the pool management screen.
- **SC-005**: 100% of recommendation views display a visible data-freshness indicator (live, cached, or stale) — the system never fails silently or shows a blank/error screen when statistics are unavailable.
- **SC-006**: A new player can configure an initial pool for at least one role and receive their first recommendation in under 2 minutes from first launch.

## Assumptions

- "Win rate against enemies already picked" refers to aggregate matchup statistics (how the champion has historically performed in the given role against the revealed enemy champion(s)) — not the player's personal match history. This matches the project's stated recommendation approach of ranking by statistical win rate vs. opponents.
- "Enemies already picked" refers to enemy champions that have been locked in and become visible during champion select under normal draft-pick visibility rules; champions that are only banned (not picked) are not treated as "picked" for ranking purposes.
- The player's own team's picks are out of scope for ranking in this feature — recommendations are based on the player's role-eligible pool and the enemy team's revealed picks only.
- Role detection relies on assignment information made available by the game client during champion select; when unavailable, the player selects their role manually (FR-007).
- The five standard roles (Top, Jungle, Middle, Bottom, Support) are the role taxonomy used for tagging and statistics. Queue types without role assignment (e.g., ARAM) are out of scope, consistent with the "ranked game" focus below.
- "Stale" data is defined relative to a freshness threshold appropriate to the game's patch cycle (statistics meaningfully shift only when champion balance changes); the exact threshold is an implementation detail to be defined during planning.
- The champion pool has no fixed maximum size; the UI is assumed to comfortably support a few dozen entries across all roles.
- A single local player profile is assumed; multi-account or profile-switching is out of scope for this feature.
- "Ranked game" detection covers standard ranked queue types (Solo/Duo and Flex); champion-select detection is not restricted further by this spec.
