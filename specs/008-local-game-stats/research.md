# Phase 0 Research: Local Game Statistics & Personal Counters

**Date**: 2026-06-19  
**Status**: Complete — no clarifications required

## Summary

All technical decisions are grounded in the existing project stack and architecture. No external research needed.

---

## Findings

### 1. LCU Game Outcome Capture

**Decision**: Capture game outcomes via LCU `/lol-match-history/v1/products/lol/current-summoner/matches` endpoint (read-only).

**Rationale**: 
- This endpoint is part of Riot's published LCU API and is already in use elsewhere in the codebase (`src/main/lcu/`).
- Returns match ID, timestamp, and participants; full match details via `/lol-match-history/v1/products/lol/current-summoner/matches/{matchId}`.
- Fully compliant with Constitution II (read-only, no automation).

**Alternatives considered**:
- In-game memory scanning or window hooking: Violates Riot ToS and is fragile across patches.
- Riot Games API (public): Lacks real-time granularity; designed for public leaderboards, not personal stats.
- Manual entry: Places burden on player; error-prone and defeats automation value.

**Selected**: LCU endpoint. The `champSelectAdapter.ts` module already establishes LCU polling patterns; game recording will follow the same architecture.

---

### 2. Storage: GameRecord Schema

**Decision**: SQLite table `game_records` with columns:
- `id` (INTEGER PRIMARY KEY)
- `timestamp` (INTEGER, Unix epoch ms)
- `player_champion` (TEXT, champion key)
- `player_role` (TEXT, lane from champion select: TOP, JUNGLE, MID, BOTTOM, SUPPORT)
- `allied_champions` (TEXT, JSON array of 4 keys)
- `enemy_champions` (TEXT, JSON array of 5 keys)
- `result` (TEXT, 'win' or 'loss')
- `player_tier` (TEXT, normalized elo: IRON, BRONZE, ..., CHALLENGER)

**Rationale**:
- Reuses existing SQLite infrastructure (Constitution III).
- JSON columns allow flexible ally/enemy lists without additional normalization tables.
- Timestamp + role enables role-filtered queries and historical slicing (tier-based archiving in v1).

**Alternative**: Normalized `game_participants` table for each player. Rejected: over-engineered for this scope; JSON is sufficient for 5k games.

---

### 3. Threat Score Calculation

**Decision**: `threat_score = (50 - win_rate%) × frequency_weight`

Where:
- `win_rate%` = (wins / games_played) × 100
- `frequency_weight` = min(1.0, games_played / 5) capped at 1.0 by games ≥ 5

This ensures a champion with 20% win rate in 5 games (threat = 0.30 × 1.0 = 0.30) ranks higher than a champion with 30% win rate in 1 game (threat = 0.20 × 0.2 = 0.04).

**Rationale**:
- Penalizes high win rates that haven't been faced frequently (low-sample bias).
- Keeps confidence tier logic orthogonal (a separate concern: "Potential" / "Likely" / "Confirmed").
- Symmetric around 50%: a 60% win rate (friendly) becomes a −0.10 threat.

**Alternative**: Raw win rate only. Rejected: surfaces low-frequency outliers as threats.

---

### 4. UI: Personal Counters View

**Decision**: Dedicated `/counters` route with:
- Role filter (radio buttons: All Roles, TOP, JUNGLE, MID, BOTTOM, SUPPORT)
- Counter list ranked by threat score, grouped by confidence tier
- Empty state if no games recorded
- Tier context badge: "Showing counters from Emerald + X games from Diamond"

**Rationale**:
- Mirrors existing champion-select recommendation view pattern (separate routes for different data types).
- Role filtering aligns with Spec FR-006.
- Confidence tiers provide sampling context without cluttering the primary threat ranking.

**Alternative**: Embed counters in the Pool view. Rejected: pollutes the pool-management UX; counters are threat analysis, not pool configuration.

---

### 5. Role-Based Filtering & Tier Archival

**Decision** (from spec clarification Q1):
- Counter view shows counters filtered by player's current tier only.
- A badge shows: "Includes X games from [previous tier]" to surface historical context.
- No UI tier-selector in v1; archival/filtering is automatic on tier change.

**Rationale**:
- Keeps the threat ranking relevant to the player's current skill level.
- Prevents stale low-tier counters from shadowing current threats.
- Badge provides transparency without requiring extra clicks.

**Alternative**: Show all counters across all tiers. Rejected: less actionable; a hard-counter in Bronze is not a threat in Diamond.

---

### 6. Role Detection: Champion-Select vs. In-Game

**Decision** (from spec clarification Q2):
- Use role from champion select as authoritative (via LCU `/lol-champ-select/v1/session`).
- Do **not** attempt to detect actual in-game role via post-game LCU endpoint.

**Rationale**:
- Champion-select role is explicit and always available.
- In-game role detection would require parsing match details and inferring role from CS/gold/position—fragile and over-engineered.
- If player was autofilled (pick 6, role: ADC, but played Support), the threat against ADC is still recorded and valid (it reflects their pool matchup).

**Alternative**: Detect in-game role from match details. Rejected: complex post-game parsing; champion-select intent is the right signal.

---

## Conclusion

All technical paths are clear. No external dependencies, APIs, or design decisions are blocked. Proceed to **Phase 1: Design & Contracts**.
