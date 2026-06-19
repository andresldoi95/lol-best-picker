# Feature Specification: Local Game Statistics & Personal Counters

**Feature Branch**: `008-local-game-stats`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "Store game results (allies and enemies) to build local statistics identifying which enemies are personal counters, independent of official champion statistics and without requiring the player to specify their current pick."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record Game Outcomes (Priority: P1)

At the end of each League of Legends game, the app automatically captures the player's performance data—who they faced, who their allies were, which role they played, and whether they won or lost. This data becomes the foundation for personal counter analysis.

**Why this priority**: Without captured game data, no personal statistics can be built. This is the essential input mechanism.

**Independent Test**: Can be fully tested by: running a game, closing champion select, verifying the game outcome appears in a local game history. Delivers: persistent, queryable game records.

**Acceptance Scenarios**:

1. **Given** a game has concluded and the app is running, **When** the player navigates to the app, **Then** the game (allied champions, enemy champions, player's champion, player's role, result: win/loss) is captured once
2. **Given** multiple games have been played, **When** the player views their game history, **Then** all recorded games are displayed in reverse chronological order
3. **Given** a game was already recorded, **When** the app is restarted, **Then** the recorded game persists in the database

---

### User Story 2 - View Personal Counters (Priority: P1)

The player can view which enemy champions most frequently result in their losses, ranked by threat level. This analysis is specific to their own win/loss history, not official statistics—so a champion with a 49% pub win rate but 20% win rate against *this player* is flagged as a personal counter.

**Why this priority**: This is the core value—identifying personal weaknesses and threat champions. Without this view, the feature delivers no actionable insight.

**Independent Test**: Can be fully tested by: recording 10+ games with varied outcomes, viewing the counter ranking, verifying that champions with low personal win rates appear higher in the threat ranking. Delivers: actionable personal threat assessment.

**Acceptance Scenarios**:

1. **Given** the player has recorded games with wins and losses, **When** the player opens the "Personal Counters" view, **Then** enemy champions are ranked by a threat score (low win rate + high frequency = high threat)
2. **Given** a champion appears in 5 games with 1 win and 4 losses against the player, **When** calculating threat, **Then** that champion ranks higher in threat than a champion with similar win rate but lower frequency
3. **Given** the player has no recorded games, **When** the player opens "Personal Counters", **Then** a message explains "No games recorded yet" with guidance

---

### User Story 3 - Filter Counters by Role (Priority: P2)

The player's threat landscape varies by role (e.g., a champion might be a personal counter in mid-lane but not bot-lane). The counter view allows filtering by the role the player was playing, so the ranking reflects role-specific matchups.

**Why this priority**: Adds relevance—a player might want to know "what counters me in mid?" vs. "what counters me everywhere?" This enables targeted champion pool decisions by role.

**Independent Test**: Can be fully tested by: recording games across multiple roles, filtering by one role, verifying threat list matches only games in that role. Delivers: role-contextual threat assessment.

**Acceptance Scenarios**:

1. **Given** the player has recorded games in multiple roles, **When** filtering by a specific role, **Then** counter ranking reflects only games where the player played that role
2. **Given** the player has no games recorded in a selected role, **When** filtering by that role, **Then** the view shows "No games played in this role"
3. **Given** role filtering is active, **When** the player switches roles, **Then** the counter list updates to show threats for the new role

---

### User Story 4 - Confidence Indicators (Priority: P2)

Because personal statistics rely on a limited sample (unlike official data), the counter view displays a confidence indicator—showing that a champion is a "Confirmed threat" (10+ games), "Likely threat" (3–9 games), or "Potential threat" (1–2 games). This prevents over-weighting low-sample-size matchups.

**Why this priority**: Prevents the feature from surfacing noise as insight. A 0% win rate in 1 game is not actionable the same way a 20% win rate in 15 games is.

**Independent Test**: Can be fully tested by: recording games with different sample sizes against specific champions, viewing confidence labels, verifying labels align with game count. Delivers: statistically-grounded recommendations.

**Acceptance Scenarios**:

1. **Given** the player has faced a champion in 1–2 games, **When** viewing counters, **Then** that champion is labeled "Potential threat"
2. **Given** the player has faced a champion in 3–9 games, **When** viewing counters, **Then** that champion is labeled "Likely threat"
3. **Given** the player has faced a champion in 10+ games, **When** viewing counters, **Then** that champion is labeled "Confirmed threat"

---

### Edge Cases

- What happens when the player has not yet played a game? → Display empty state with guidance to play games.
- What if the app is closed during a game? → Attempt to capture the outcome when the app restarts (via LCU); if LCU data is unavailable, skip that game.
- What if the player plays the same champion repeatedly in the same role against the same opponent? → All matchups are recorded independently; the system aggregates to show win/loss rate.
- What if the player switches roles mid-lane vs. role in champion select? → Record the role from champion select; do not attempt to detect actual in-game role via LCU.
- What if the player's elo changes (promotion/demotion)? → Counter view shows counters for the player's current tier only; a notification/badge indicates "This includes X games from when you were in [lower tier]" so the player understands the historical context. Games are not deleted or re-indexed, only filtered.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture the end-game state (allied champions, enemy champions, player's champion, player's role, win/loss result) from each ranked or normal game
- **FR-002**: System MUST persist all game records to SQLite with no data loss on app restart
- **FR-003**: System MUST calculate a personal win rate for each opponent champion (wins / total games vs. that champion)
- **FR-004**: System MUST calculate a threat score for each opponent champion = (50 - win_rate%) × frequency_weight, where frequency is the count of games vs. that champion
- **FR-005**: System MUST rank opponent champions by threat score (highest threat first) and expose this ranking via an API endpoint
- **FR-006**: System MUST support filtering personal counters by the player's role at the time of the game
- **FR-007**: System MUST categorize counter confidence as "Potential threat" (1–2 games), "Likely threat" (3–9 games), or "Confirmed threat" (10+ games)
- **FR-008**: System MUST provide a UI view listing personal counters ranked by threat score with confidence labels
- **FR-009**: System MUST handle the case where the player has no recorded games by displaying an appropriate empty state
- **FR-010**: System MUST use champion-select role as the authoritative role for counter tracking, even if the player was autofilled or played a different role in-game

### Key Entities

- **GameRecord**: Represents a single completed game
  - `id` (primary key)
  - `timestamp` (when game ended)
  - `player_champion` (champion the player picked)
  - `player_role` (lane/role the player was assigned)
  - `allied_champions` (list of 4 other champions on player's team)
  - `enemy_champions` (list of 5 enemy champions)
  - `result` (win/loss)
  - `player_tier` (ranked tier at time of game)

- **PersonalCounter**: Derived from aggregated GameRecords
  - `opponent_champion` (champion that counters the player)
  - `player_role` (role in which this is a counter; null = all roles)
  - `games_played` (count of games vs. this opponent)
  - `wins` (count of wins vs. this opponent)
  - `win_rate` (wins / games_played)
  - `threat_score` (derived metric)
  - `confidence_tier` ("Potential", "Likely", "Confirmed")

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All game outcomes (allied/enemy champions, result) are captured and persisted; 100% of completed games appear in game history
- **SC-002**: Personal counter threat scores are calculated correctly; a champion with 20% win rate in 10 games against the player ranks higher than a champion with 40% win rate in 1 game
- **SC-003**: Role filtering works accurately; when filtered to "Mid", only games where player role = "Mid" are included in counter calculations
- **SC-004**: Confidence tiers are applied correctly; champions with 1–2 games show "Potential threat", 3–9 show "Likely threat", 10+ show "Confirmed threat"
- **SC-005**: Empty-state messaging is clear; when no games are recorded, the UI guides the player to play games and return
- **SC-006**: Game history persists after app restart; restarting the app does not lose any previously recorded games

## Assumptions

- The League of Legends client (LCU) provides an endpoint to query completed game outcomes (ally/enemy champions, result). If unavailable, the system will display an empty state and prompt the user to play games.
- The player will play multiple games over time, enabling statistically meaningful counter identification. Single-game counters are still captured but labeled with low confidence.
- Role information from champion select is reliable; if the player's actual in-game role differs, it is secondary to champion-select intent.
- The feature applies only to Ranked and Normal games; URF, ARAM, and custom games are out of scope for v1.
- Personal counters are independent of the player's current champion pool; a champion the player doesn't own can still be identified as a personal counter (useful for identifying threats to watch for or prioritize learning against).
- Player tier/elo is captured at game time but not used for filtering in v1; all games contribute to counter calculation regardless of tier at time of game. (Future: role-specific tier-based filtering.)
