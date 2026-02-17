# 009 — Matching, Challenges & Lobby Reference

**Date:** 2026-02-17
**Status:** Implemented
**Related:** [005-backend-reference.md](005-backend-reference.md), [004-plan.md](004-plan.md)

---

## Overview

The matching system connects two athletes through a challenge → lobby → match → results pipeline. Every challenge interaction happens inside the **Match Lobby** (`/match/lobby/[id]`), which adapts its UI based on the challenge status and the current user's role.

---

## Challenge Lifecycle

```
CREATE (challenger sends)
  │
  ▼
PENDING ──→ ACCEPTED ──→ STARTED (match created)
  │            │
  ├→ DECLINED  ├→ CANCELLED
  └→ EXPIRED   └→ (either party)
```

### Rules

- Max **3 pending outgoing** challenges per athlete (`can_create_challenge` RPC)
- Opponent must have `status = 'active'`
- No self-challenges
- Challenges expire after **7 days** (frontend-enforced, no DB cron)
- Only the **opponent** can accept or decline
- **Either party** can cancel an accepted challenge
- Terminal states (`declined`, `expired`, `cancelled`, `started`) are immutable

### Weight Tracking

- Challenger sets `challenger_weight` at challenge creation time
- Opponent sets `opponent_weight` at acceptance time (via lobby weight input)
- Both weights used for weight-aware ELO calculation in ranked matches

---

## Match Lobby (`/match/lobby/[id]`)

The lobby is the **single destination** for all challenge interactions. Clicking any challenge card (from dashboard, pending page, or notifications) navigates here.

### Three Lobby States

| State | Who Sees It | UI |
|-------|-------------|-----|
| **Pending — Challenger** | The person who sent the challenge | VS header, "Waiting for opponent..." message, Cancel button |
| **Pending — Opponent** | The person who received the challenge | VS header, weight input, Accept/Decline buttons |
| **Accepted** | Both athletes | VS header, ELO stakes (ranked), Start Match/Cancel buttons |

### Lobby Page Architecture

```
page.tsx                    — Sync wrapper with Suspense
  └── lobby-content.tsx     — Server: fetches challenge data, determines role
        └── lobby-actions.tsx — Client: handles all interactions per state
```

**Key files:**
- `app/(app)/match/lobby/[id]/page.tsx` — page shell
- `app/(app)/match/lobby/[id]/lobby-content.tsx` — server component, VS header, ELO stakes
- `app/(app)/match/lobby/[id]/lobby-actions.tsx` — client component, state-dependent actions

### Data Fetching

`getLobbyData(supabase, challengeId)` in `lib/api/queries.ts`:
- Fetches challenge with `.in("status", ["pending", "accepted"])` (not just accepted)
- Joins challenger + opponent athlete data (name, ELO, weight)
- Joins gym data if a gym was proposed
- Returns `null` for cancelled/declined/started/expired challenges → redirects to `/match/pending`

### Realtime Sync (Broadcast)

The **lobby broadcast channel** (`lobby:{challengeId}`) coordinates both athletes in real-time:

| Event | Sent By | Received By | Effect |
|-------|---------|-------------|--------|
| `challenge_accepted` | Opponent (after accepting) | Challenger | `router.refresh()` → lobby reloads with "Accepted" state |
| `match_started` | Either (after starting match) | Other party | `router.push(/match/{matchId}/live)` |
| `lobby_cancelled` | Either (after cancelling) | Other party | `router.push(/match/pending)` |

**Implementation:** `hooks/use-lobby-sync.ts` — Supabase Broadcast channel with `useRef` for stable callbacks.

---

## Match Flow (Post-Lobby)

```
LOBBY (accepted)
  │
  ▼ Start Match (start_match_from_challenge RPC)
MATCH PENDING (/match/[id]/live)
  │
  ▼ Both Ready (start_match RPC)
MATCH IN PROGRESS (timer running)
  │
  ▼ Timer ends or submission
RESULTS (/match/[id]/results)
  │
  ▼ Record outcome (record_match_result RPC)
COMPLETED (ELO updated for ranked)
```

### Match RPCs

| RPC | Purpose | Key Behavior |
|-----|---------|--------------|
| `start_match_from_challenge` | Creates match from accepted challenge | Idempotent — returns existing match if called twice (race condition safe) |
| `start_match` | Transitions `pending` → `in_progress` | Timer starts |
| `record_match_result` | Records outcome + auto-calculates ELO | Atomic: updates match, participants, ELO history |

### Match Pages

| Route | Purpose |
|-------|---------|
| `/match/lobby/[id]` | Pre-match staging (challenge ID in URL) |
| `/match/[id]/live` | Live timer during match (match ID in URL) |
| `/match/[id]/results` | Record outcome or view completed results (match ID in URL) |

---

## Presence Model (Two-Tier)

The app uses **two Supabase Presence channels** to distinguish general online status from active matchmaking:

| Channel | Who Joins | Purpose | Tracked On |
|---------|-----------|---------|------------|
| `app:online` | Every authenticated athlete with app open | Chat online indicators (green dots) | App layout bootstrap |
| `lobby:online` | Athletes with `looking_for_casual` OR `looking_for_ranked` = true | Matchmaking lobby | App layout bootstrap (conditional) |

### Implementation Pattern

Both channels use the **external store pattern** (`useSyncExternalStore`) instead of React Context:

```
Module-level Set<string>  ←  Presence sync events update this
        │
        ▼
useSyncExternalStore()    ←  Any client component subscribes
        │
        ▼
Re-render on change       ←  No Context Provider needed
```

### `app:online` (General Presence)

- **Hook:** `hooks/use-online-presence.ts`
- **Bootstrap:** `components/layout/online-presence-bootstrap.tsx`
- **Consumer:** `useOnlineStatus(athleteId): boolean`
- **Indicator:** `components/domain/online-indicator.tsx` — green dot wrapper
- **Payload:** `{ athlete_id }`
- Everyone with the app open tracks automatically

### `lobby:online` (Matchmaking Presence)

- **Hook:** `hooks/use-lobby-presence.ts`
- **Bootstrap:** `components/layout/lobby-presence-bootstrap.tsx`
- **Consumers:**
  - `useLobbyStatus(athleteId): boolean` — single athlete check
  - `useLobbyIds(): Set<string>` — full set for filtering
- **Indicator:** `components/domain/lobby-active-indicator.tsx` — pulsing green dot + "Active now"
- **Payload:** `{ athlete_id, looking_for_casual, looking_for_ranked }`
- **Imperative API:** `joinLobby(payload)` / `leaveLobby()` — called from toggle without channel teardown
- Only tracks if `looking_for_casual || looking_for_ranked`; everyone subscribes to read

### Toggle Integration

The "Looking for Match" toggle on the Arena page (`looking-for-match-toggle.tsx`):
1. Updates DB flags (`looking_for_casual`, `looking_for_ranked`)
2. Calls `joinLobby()` or `leaveLobby()` imperatively
3. Calls `router.refresh()` to update server-rendered data

---

## Arena Page Structure

The Arena page (`/arena`) shows athletes available for matchmaking, split by presence:

### Sections

| Section | Filter | Icon | Badge |
|---------|--------|------|-------|
| **Ready to Fight** | `looking_for_*` = true AND in `lobby:online` | Green Swords | `variant="success"` |
| **Looking for Match** | `looking_for_*` = true AND NOT in `lobby:online` | Muted Circle | `variant="secondary"` |
| **Recent Activity** | Last 10 completed matches | Activity icon | — |

- "Ready to Fight" subtitle: *Online athletes looking for a match*
- "Looking for Match" subtitle: *Athletes open to challenges but currently offline*
- Empty state shown when both lists are empty
- Each competitor card shows: name, ELO (with diff), gym, weight, casual/ranked badges, online indicator, lobby active indicator, pending challenge badge

### Data Flow

1. Server: `getArenaData(supabase)` returns `looking_athletes` + `recent_activity` + `challenged_opponent_ids`
2. Client: `useLobbyIds()` returns real-time set of athletes in lobby
3. Client: `lookingCompetitors.filter()` splits into `readyToFight` vs `lookingOffline`

---

## Where Challenges Appear

All challenge cards link to `/match/lobby/[challengeId]`:

| Location | What Shows | Badge |
|----------|-----------|-------|
| **Dashboard** (`/`) | Accepted challenges (top) + pending incoming/sent | Green "Accepted" with "Go to Lobby" / "Incoming" / "Sent" |
| **Pending page** (`/match/pending`) | Separated tabs: Received / Sent / Active Matches | With Respond/Cancel action buttons |
| **Arena cards** | Pending challenge badge on competitor cards | Orange challenge icon |
| **Toast notifications** | Real-time challenge received alerts | — |

---

## Weight-Aware ELO

For ranked matches, ELO stakes account for weight differences:

- `calculate_elo_stakes(challenger_elo, opponent_elo, challenger_weight?, opponent_weight?)` RPC
- Heavier athletes get a phantom ELO offset (+50 per IBJJF division gap)
- **Draws always cost ELO** (Pressure Score) — both athletes lose rating
- Stakes shown in lobby for ranked matches: Win (green) / Draw (amber) / Loss (red)
- `weight_division_gap` displayed when > 0

---

## Key Database Fields

### Athletes (matchmaking-relevant)

| Column | Type | Purpose |
|--------|------|---------|
| `looking_for_casual` | BOOLEAN | Toggle for casual match availability |
| `looking_for_ranked` | BOOLEAN | Toggle for ranked match availability |
| `current_weight` | DECIMAL(5,2) | Weight in lbs for ELO calculations |
| `current_elo` | INTEGER | Current rating (default 1000) |
| `status` | VARCHAR(32) | Must be `active` to participate |

### Challenges

| Column | Type | Purpose |
|--------|------|---------|
| `challenger_id` | UUID | Who sent the challenge |
| `opponent_id` | UUID | Who received the challenge |
| `match_type` | ENUM | `ranked` or `casual` |
| `status` | VARCHAR(32) | `pending`, `accepted`, `declined`, `cancelled`, `started`, `expired` |
| `challenger_weight` | DECIMAL(5,2) | Set at creation |
| `opponent_weight` | DECIMAL(5,2) | Set at acceptance |
| `expires_at` | TIMESTAMPTZ | 7 days from creation |
