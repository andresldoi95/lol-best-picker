# Feature Specification: Live Champion Selection State Management

**Feature Branch**: `006-live-champ-select`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "well... we need to handle two things, first if an enemy selects my champion, it should not appear as selectable for me... secondly, the same if an ally select one of my champions! and finally, if game selection is ended, the select champ should be cleared, so maybe we need to create an empty state for that one... also, if the app detects it is entering to champion selection, it should automatically move to the champion selection section of the app"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hide Already-Selected Champions (Priority: P1)

During champion select, the user's available pool should dynamically update to exclude champions that have been selected by either allies or enemies. This ensures the recommendation engine always reflects realistic options and prevents users from accidentally attempting to select unavailable champions.

**Why this priority**: This is the core feature request addressing both ally and enemy champion blocking. It directly prevents invalid selections and maintains recommendation accuracy.

**Independent Test**: Can be fully tested by verifying that when an ally or enemy selects a champion from the user's pool, that champion immediately disappears from the selectable list and recommendation view.

**Acceptance Scenarios**:

1. **Given** the app has the user's champion pool loaded, **When** an ally selects a champion in that pool during champion select, **Then** that champion should no longer appear as selectable and should be visually removed from the recommendation view.

2. **Given** the app has the user's champion pool loaded, **When** an enemy selects a champion in that pool during champion select, **Then** that champion should no longer appear as selectable and should be visually removed from the recommendation view.

3. **Given** multiple champions are available in the user's pool, **When** allies and enemies collectively select multiple champions from the pool, **Then** all selected champions should be filtered out, leaving only truly available options.

---

### User Story 2 - Auto-Navigate to Champion Select View (Priority: P2)

When the app detects that the game has entered the champion select phase, it should automatically navigate the user to the champion selection section of the application without requiring manual tab/view switching.

**Why this priority**: Improves user experience by eliminating the manual navigation step. High-value UX improvement that reduces friction during time-sensitive champion select phase.

**Independent Test**: Can be fully tested by verifying that when the LCU emits a champion select enter event, the app automatically displays the champion selection view without user interaction.

**Acceptance Scenarios**:

1. **Given** the app is running and monitoring the LCU, **When** the user enters champion select phase in League of Legends, **Then** the app should automatically switch to the champion selection view.

2. **Given** the app is displaying a different view (e.g., settings, pool management), **When** champion select begins, **Then** the automatic navigation should override the current view and display the champion selection view.

---

### User Story 3 - Clear Selection and Show Empty State on Phase End (Priority: P3)

When champion select phase ends (either due to ban/pick phase completion or player leaving), the selected champion recommendation should be cleared and the view should display an empty/idle state, making it clear that the selection opportunity has closed.

**Why this priority**: Provides visual clarity to the user about the phase transition. Prevents confusion about stale recommendations after the selection period has ended.

**Independent Test**: Can be fully tested by verifying that when champion select phase ends, the selected champion is cleared and an appropriate empty state message is displayed.

**Acceptance Scenarios**:

1. **Given** a champion is currently displayed as selected/recommended during champion select, **When** the champion select phase ends, **Then** the selected champion should be cleared and an empty state should be displayed.

2. **Given** the user is viewing a recommended champion, **When** they are removed from champion select (e.g., player left queue), **Then** the recommendation should clear and display an appropriate message indicating selection is no longer available.

---

### Edge Cases

- What happens if the LCU connection is lost during champion select? (System should gracefully handle disconnection and restore state when reconnected)
- How does the system handle the case where the user's own champion is selected by themselves? (Should immediately be removed from available selections)
- What if a champion is selected/deselected rapidly by allies? (System should handle fast state updates without UI glitches)
- What happens if champion select restarts unexpectedly? (System should reset empty state and allow fresh selection when champion select begins again)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST monitor LCU game phase and detect when champion select begins
- **FR-002**: System MUST track which champions have been selected by allies and enemies in real-time
- **FR-003**: System MUST filter the user's champion pool to exclude already-selected champions before generating recommendations
- **FR-004**: System MUST automatically navigate to the champion selection view when champion select phase is detected
- **FR-005**: System MUST display a clear empty state when champion select phase ends
- **FR-006**: System MUST persist and display the current selected recommendation while champion select is active
- **FR-007**: System MUST clear the selected champion recommendation when champion select phase ends
- **FR-008**: System MUST handle rapid state changes (champions being selected/deselected) without UI lag or inconsistencies

### Key Entities

- **ChampionSelect Phase**: Represents the state of the ongoing/active champion select in League of Legends (active/ended)
- **Selected Champions**: Tracks which champions have been picked/banned by all players (user, allies, enemies)
- **Available Pool**: The user's champion pool filtered to exclude already-selected champions
- **Recommendation State**: Current selected/recommended champion for the user, cleared when select phase ends

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Recommended champion updates within 500ms of a player selecting a champion from the user's pool
- **SC-002**: App automatically navigates to champion select view within 1 second of detecting champion select phase
- **SC-003**: Empty state displays within 500ms of champion select phase ending
- **SC-004**: User can complete champion selection without encountering recommendations for unavailable champions
- **SC-005**: Recommendations remain consistent and accurate even with 5+ rapid champion selections/deselections

## Assumptions

- The LCU is available and accessible for game phase detection and player selection tracking
- The user's champion pool is already loaded in the app before champion select begins
- The recommendation engine can handle dynamic pool filtering without performance degradation
- The app maintains a stable connection to the LCU during champion select (with graceful degradation on disconnect)
- Navigation to the champion select view should not require user input (automatic)
- The empty state should be clearly distinguished from an error state
