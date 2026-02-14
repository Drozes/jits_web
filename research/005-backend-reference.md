# 005 — Backend Reference

**Source:** `/Users/msponagle/code/experiments/jr_be/`
**Last reviewed:** 2026-02-13
**Backend status:** Alpha (4 features complete, 260+ pgTAP tests passing)

---

## Athlete Lifecycle

### Auto-Creation (Signup Trigger)

When a user signs up via Supabase Auth, `handle_new_user()` fires and creates an athlete:

```sql
INSERT INTO athletes (auth_user_id, display_name, current_elo, highest_elo, status)
VALUES (NEW.id, generated_name, 1000, 1000, 'pending');
```

Display name is generated via fallback: `raw_user_meta_data->>'display_name'` → email prefix → `'Athlete_' + uuid_prefix`.

If the insert fails (e.g. display_name collision), the entire signup rolls back — no orphaned auth users.

### Auto-Activation Trigger

`handle_athlete_activation()` fires on every UPDATE to athletes:

```sql
IF OLD.status = 'pending'
  AND NEW.status = 'pending'     -- not manually changed
  AND NEW.primary_gym_id IS NOT NULL
  AND NEW.display_name IS NOT NULL
THEN
  NEW.status := 'active';
END IF;
```

**Key:** Activation requires `primary_gym_id` to be set, not `current_weight`.

### Athletes Table Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| auth_user_id | UUID | — | UNIQUE, FK → auth.users, ON DELETE CASCADE |
| display_name | VARCHAR(100) | — | NOT NULL, UNIQUE |
| current_weight | DECIMAL(5,2) | NULL | CHECK: 0-500, kilograms |
| current_elo | INTEGER | 1000 | CHECK: >= 0, cached from elo_history |
| highest_elo | INTEGER | 1000 | CHECK: >= current_elo |
| looking_for_match | BOOLEAN | FALSE | Availability toggle |
| status | VARCHAR(32) | 'pending' | pending, active, inactive, suspended, banned |
| primary_gym_id | UUID | NULL | FK → gyms, ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | now() | |

### Updatable Fields (RLS)

Athletes can only update their own record (`auth.uid() = auth_user_id`):
- `display_name` — must remain unique
- `current_weight`
- `looking_for_match`
- `primary_gym_id`

Protected (never client-updated): `current_elo`, `highest_elo`, `status`, `auth_user_id`

### RLS Visibility

- **Own profile:** full access to all fields
- **Other athletes:** only visible if `status IN ('active', 'inactive')`. App should avoid exposing `current_weight` and `auth_user_id` for others.

---

## Gyms Table

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| name | VARCHAR(150) | — | NOT NULL |
| address | VARCHAR(255) | NULL | |
| city | VARCHAR(100) | NULL | |
| region | VARCHAR(100) | NULL | |
| country | VARCHAR(100) | NULL | |
| latitude | DECIMAL(9,6) | NULL | |
| longitude | DECIMAL(9,6) | NULL | |
| status | VARCHAR(32) | 'active' | active, inactive |
| is_verified | BOOLEAN | FALSE | |
| created_at | TIMESTAMPTZ | now() | |

**RLS:** All authenticated users can read all gyms. No insert/update/delete for regular users.

**Seed data:** 5 gyms in Toronto/GTA area (3 verified, 2 not).

---

## Submission Types (Read-Only)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| code | VARCHAR(50) | Machine key (e.g., `rear_naked_choke`) |
| display_name | VARCHAR(100) | Human label (e.g., `Rear Naked Choke`) |
| category | VARCHAR(32) | `choke`, `joint_lock`, `leg_lock`, `other` |
| sort_order | INTEGER | Display ordering |

**23 seeded submissions** across 4 categories. Use `code` (not `id`) when calling `record_match_result`.

```ts
const { data } = await supabase
  .from('submission_types')
  .select('*')
  .eq('status', 'active')
  .order('category')
  .order('sort_order');
```

---

## Challenge Flow

### Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| challenger_id | UUID | — | FK → athletes, NOT NULL |
| opponent_id | UUID | — | FK → athletes, NOT NULL, != challenger_id |
| proposed_gym_id | UUID | NULL | FK → gyms |
| challenger_weight | DECIMAL(5,2) | NULL | In lbs (per DB comments) |
| opponent_weight | DECIMAL(5,2) | NULL | In lbs, set on accept |
| match_type | match_type_enum | — | 'ranked' or 'casual' |
| status | VARCHAR(32) | 'pending' | See transitions below |
| expires_at | TIMESTAMPTZ | now() + 7 days | |
| created_at | TIMESTAMPTZ | now() | |
| updated_at | TIMESTAMPTZ | now() | |

### Status Transitions

```
pending ──→ accepted ──→ started (via start_match_from_challenge RPC)
        ├→ declined (terminal)        └→ cancelled (terminal)
        └→ expired (frontend-enforced, no DB auto-expire)
```

Terminal states (`declined`, `expired`, `cancelled`, `started`) are immutable.

### Creating a Challenge

```ts
const { error } = await supabase.from('challenges').insert({
  challenger_id: currentAthleteId,  // must match auth_athlete_id()
  opponent_id: targetAthleteId,     // must be 'active' status
  match_type: 'ranked',             // or 'casual'
  proposed_gym_id: gymId,           // optional
  challenger_weight: 155,           // optional, in lbs
});
```

**RLS enforces:**
- `challenger_id = auth_athlete_id()` (you are the challenger)
- `can_create_challenge(opponent_id)` passes:
  - Max 3 pending outgoing challenges
  - Opponent has `status = 'active'`
- No self-challenges

### Accepting a Challenge

```ts
const { error } = await supabase.from('challenges')
  .update({
    status: 'accepted',
    opponent_weight: 160,  // confirm weight in lbs
    updated_at: new Date().toISOString(),
  })
  .eq('id', challengeId)
  .eq('status', 'pending');
```

**RLS:** Only opponent can accept/decline. Only pending challenges can be updated.

### Declining a Challenge

```ts
const { error } = await supabase.from('challenges')
  .update({ status: 'declined', updated_at: new Date().toISOString() })
  .eq('id', challengeId)
  .eq('status', 'pending');
```

### Cancelling an Accepted Challenge

```ts
const { error } = await supabase.from('challenges')
  .update({ status: 'cancelled', updated_at: new Date().toISOString() })
  .eq('id', challengeId)
  .eq('status', 'accepted');
```

Either party (challenger or opponent) can cancel.

### Expiration

No automatic DB expiration. Frontend must check `expires_at > now()` and hide/disable expired challenges.

---

## Match Flow

### Starting a Match (RPC)

Use the `start_match_from_challenge` RPC — never insert directly:

```ts
const { data, error } = await supabase.rpc('start_match_from_challenge', {
  p_challenge_id: challengeId,
});
```

**Returns:**
```json
{
  "match_id": "uuid",
  "challenge_id": "uuid",
  "gym_id": "uuid or null",
  "match_type": "ranked",
  "duration_seconds": 600,
  "status": "pending",
  "created_at": "timestamp",
  "already_exists": false
}
```

**What it does atomically:**
1. Validates challenge is `accepted` and caller is a participant
2. Creates match (status: `pending`, duration: 600s)
3. Creates 2 `match_participants` records (both as `competitor`)
4. Sets challenge status to `started`

**Race condition handling:** If both athletes click Start simultaneously, the second call gets a unique violation, catches it, and returns the existing match with `already_exists: true`.

### Transitioning to In-Progress (RPC)

```ts
const { data } = await supabase.rpc('start_match', { p_match_id: matchId });
// Returns: { success: true, match_id }
```

Moves match from `pending` → `in_progress`. Call this when both athletes are ready and the timer should start.

### Match Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| challenge_id | UUID | — | UNIQUE FK → challenges |
| gym_id | UUID | NULL | FK → gyms |
| initiated_by_athlete_id | UUID | NULL | FK → athletes (who clicked Start) |
| match_type | match_type_enum | — | Copied from challenge |
| duration_seconds | INTEGER | 600 | CHECK: 1-3600 |
| result | match_result_enum | NULL | 'submission' or 'draw', set on completion |
| status | VARCHAR(32) | 'pending' | pending, in_progress, completed, disputed |
| completed_at | TIMESTAMPTZ | NULL | Set on completion |
| created_at | TIMESTAMPTZ | now() | |

### Match Participants Schema

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | PK |
| match_id | UUID | — | FK → matches |
| athlete_id | UUID | — | FK → athletes, UNIQUE per match |
| role | participant_role_enum | 'competitor' | 'competitor' or 'referee' |
| outcome | participant_outcome_enum | NULL | 'win', 'loss', 'draw' |
| elo_before | INTEGER | NULL | Snapshot before match |
| elo_after | INTEGER | NULL | After ELO calc |
| elo_delta | INTEGER | 0 | Change amount |
| status | VARCHAR(32) | 'active' | 'active' or 'removed' |

### Recording Match Outcome (RPC)

Use the `record_match_result` RPC — it handles match completion, participant outcomes, and ELO updates atomically:

```ts
// Submission win
const { data } = await supabase.rpc('record_match_result', {
  p_match_id: matchId,
  p_result: 'submission',
  p_winner_id: winnerId,
  p_submission_type_code: 'rear_naked_choke',  // use submission_types.code
  p_finish_time_seconds: 245
});

// Draw
const { data } = await supabase.rpc('record_match_result', {
  p_match_id: matchId,
  p_result: 'draw'
});
```

**Returns:**
```json
{
  "success": true,
  "match_id": "uuid",
  "result": "submission",
  "elo_changes": {
    "winner": { "before": 1000, "after": 1016, "delta": 16 },
    "loser": { "before": 1000, "after": 984, "delta": -16 }
  }
}
```

`elo_changes` is `null` for casual matches.

**This replaces manual multi-table updates.** The RPC handles: match status → completed, participant outcomes, ELO snapshots, athlete ELO updates, and highest_elo tracking.

---

## Match History & ELO History (RPCs)

### `get_match_history(p_athlete_id)`

Get completed matches with full details (opponent, submission, ELO):

```ts
const { data } = await supabase.rpc('get_match_history', { p_athlete_id: athleteId });
```

Returns array of:
```json
{
  "match_id": "uuid",
  "match_type": "ranked",
  "result": "submission",
  "completed_at": "timestamp",
  "opponent_id": "uuid",
  "opponent_display_name": "string",
  "athlete_outcome": "win",
  "submission_type_code": "rear_naked_choke",
  "submission_type_display_name": "Rear Naked Choke",
  "finish_time_seconds": 245,
  "elo_before": 1000,
  "elo_after": 1016,
  "elo_delta": 16,
  "opponent_elo_at_time": 1000
}
```

### `get_elo_history(p_athlete_id)`

Get rating change history (own profile only):

```ts
const { data } = await supabase.rpc('get_elo_history', { p_athlete_id: athleteId });
```

Returns array of:
```json
{ "match_id": "uuid", "rating_before": 1000, "rating_after": 1016, "delta": 16, "created_at": "timestamp" }
```

---

## ELO System

### Formula (Standard ELO, K=32)

```
Expected win probability:
  E = 1 / (1 + 10^((opponent_elo - your_elo) / 400))

New rating after match:
  new_elo = old_elo + K * (W - E)
  where W = 1 (win), 0 (loss), 0.5 (draw)
```

### Stakes Preview (RPC)

```ts
const { data } = await supabase.rpc('calculate_elo_stakes', {
  challenger_elo: 1200,
  opponent_elo: 1000,
});
// Returns: {
//   challenger_win: 10, challenger_loss: -22,
//   opponent_win: 22, opponent_loss: -10,
//   challenger_expected: 0.76, opponent_expected: 0.24
// }
```

**Only for ranked matches.** Casual matches have zero ELO impact.

### Competition Rules

- Match duration: 10 minutes (600 seconds)
- Scoring: submission only
- Outcomes: submission win OR draw (time expiration)
- **Draws penalize both athletes' ELO**
- Ranked: exactly 2 competitors, ELO changes applied
- Casual: no ELO impact

---

## Database Functions Reference

| Function | Params | Returns | Purpose |
|----------|--------|---------|---------|
| `auth_athlete_id()` | none | UUID | Current user's athlete ID (used in RLS) |
| `can_create_challenge(p_opponent_id)` | UUID (optional) | BOOLEAN | Rate limit (< 3 pending) + opponent active check |
| `calculate_elo_stakes(challenger_elo, opponent_elo, k_factor)` | INT, INT, INT(32) | JSONB | Preview ELO changes for display |
| `start_match_from_challenge(p_challenge_id)` | UUID | JSONB | Atomic challenge → match conversion |
| `start_match(p_match_id)` | UUID | JSONB | Transition match pending → in_progress |
| `record_match_result(p_match_id, p_result, p_winner_id?, p_submission_type_code?, p_finish_time_seconds?)` | UUID, TEXT, UUID?, TEXT?, INT? | JSONB | Record outcome + auto ELO |
| `get_match_history(p_athlete_id)` | UUID | JSONB[] | Completed matches with opponent/ELO details |
| `get_elo_history(p_athlete_id)` | UUID | JSONB[] | Rating change timeline |

---

## Enum Reference

| Enum | Values |
|------|--------|
| `match_type_enum` | `ranked`, `casual` |
| `match_result_enum` | `submission`, `draw` |
| `participant_role_enum` | `competitor`, `referee` |
| `participant_outcome_enum` | `win`, `loss`, `draw` |

---

## Business Rules Summary

| Rule | Detail |
|------|--------|
| **Athlete auto-activation** | Setting `primary_gym_id` when `status = 'pending'` auto-activates. Guide new users through profile completion. |
| **Challenge limit** | Max 3 pending outgoing challenges. Use `can_create_challenge()` to check before showing the button. |
| **Challenge expiry** | Challenges expire after 7 days. Display `expires_at` countdown. |
| **No self-challenge** | `challenger_id ≠ opponent_id` enforced at DB level. |
| **Match duration** | Default 600s (10 min), max 3600s (1 hr). Frontend timer should use `duration_seconds`. |
| **ELO only for ranked** | `elo_changes` is `null` for casual matches. Don't show ELO UI for casual. |
| **ELO floor** | Ratings cannot go below 0. |
| **Submission codes** | Use `submission_types.code` (not `id`) when calling `record_match_result`. |
| **Idempotent match start** | `start_match_from_challenge` is safe to call multiple times — returns `already_exists: true` on repeat. |

---

## Frontend/Backend Discrepancies

| Issue | Current Frontend | Backend Expects | Priority |
|-------|-----------------|-----------------|----------|
| Activation signal | `current_weight == null` → needs setup | `primary_gym_id IS NOT NULL` triggers activation | **HIGH** — setup must include gym picker |
| Weight units | Setup says "lbs" | `athletes.current_weight` is kilograms. Challenge weights are explicitly lbs | **MEDIUM** — clarify with BE |
| `looking_for_match` | Not surfaced in UI | Available toggle, updatable by own athlete | **LOW** — add to profile/arena |
| Status filtering | Leaderboard/arena show all athletes | RLS only returns `active`/`inactive` to other users | **LOW** — RLS handles this |
| Challenge creation | Button disabled, not implemented | Full flow exists: insert with RLS validation | **HIGH** — next feature to build |
| Gym selection | Not in setup flow | Required for activation (`primary_gym_id` must be set) | **HIGH** — add gym picker to setup |
| Match start | Not implemented | Use `start_match_from_challenge()` RPC | **HIGH** — needed for match flow |
| Match recording | Not implemented | Use `record_match_result()` RPC (auto ELO) | **HIGH** — needed when matches work |
| Match history | Not implemented | Use `get_match_history()` RPC | **MEDIUM** — for profile/stats |
| ELO history | Not implemented | Use `get_elo_history()` RPC | **LOW** — for ELO chart |
| Submission types | Not fetched | 23 seeded types, needed for match result recording | **MEDIUM** — needed for match flow |

---

## Next Three Planned Backend Tasks

### 1. Dispute Resolution System (Feature 005)
**Priority**: High — Completes the match lifecycle
**What**: Allow athletes to dispute match results within a time window after completion. Includes a `disputes` table, status workflow (`opened` → `under_review` → `resolved`/`dismissed`), and RPC functions to open, review, and resolve disputes. Resolving a dispute may reverse ELO changes for ranked matches.
**Frontend impact**: Dispute button on completed matches, dispute detail view, notification for opponent.

### 2. Real-Time Challenge & Match Notifications (Supabase Realtime)
**Priority**: High — Critical for UX
**What**: Enable Supabase Realtime subscriptions on `challenges` and `matches` tables so both athletes receive instant updates when a challenge is accepted/declined or a match status changes. No new tables needed — requires configuring Realtime publication policies and documenting subscription patterns for the frontend.
**Frontend impact**: Subscribe to challenge/match changes via `supabase.channel()`, handle real-time status transitions, push notifications.

### 3. Leaderboard & Public Rankings API
**Priority**: Medium — Key engagement feature
**What**: Create an RPC function `get_leaderboard(p_limit, p_offset, p_gym_id?)` that returns ranked athletes ordered by `current_elo DESC` with win/loss/draw stats. Optionally filter by gym. Requires a `matches_played` materialized view or computed query joining `match_participants` for aggregate stats. Relaxes RLS to allow public read of leaderboard data.
**Frontend impact**: Leaderboard page with global/gym-filtered rankings, athlete cards with W/L/D records.
