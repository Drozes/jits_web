# 005 — Backend Reference

**Source:** `/Users/msponagle/code/experiments/jr_be/`
**Last reviewed:** 2026-02-13

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
| current_weight | DECIMAL(5,2) | NULL | CHECK: 0-500 |
| current_elo | INTEGER | 1000 | CHECK: >= 0, cached from elo_history |
| highest_elo | INTEGER | 1000 | CHECK: >= current_elo |
| status | VARCHAR(32) | 'pending' | pending, active, inactive, suspended, banned |
| primary_gym_id | UUID | NULL | FK → gyms, ON DELETE SET NULL |
| created_at | TIMESTAMPTZ | now() | |

### Updatable Fields (RLS)

Athletes can only update their own record (`auth.uid() = auth_user_id`):
- `display_name` — must remain unique
- `current_weight`
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

### Recording Match Outcome

After a match completes, update both tables:

```ts
// 1. Update match
await supabase.from('matches').update({
  status: 'completed',
  result: 'submission', // or 'draw'
  completed_at: new Date().toISOString(),
}).eq('id', matchId);

// 2. Update winner participant
await supabase.from('match_participants').update({
  outcome: 'win',
  elo_before: winnerCurrentElo,
  elo_after: winnerNewElo,
  elo_delta: winnerNewElo - winnerCurrentElo,
}).eq('match_id', matchId).eq('athlete_id', winnerId);

// 3. Update loser participant
await supabase.from('match_participants').update({
  outcome: 'loss',
  elo_before: loserCurrentElo,
  elo_after: loserNewElo,
  elo_delta: loserNewElo - loserCurrentElo,
}).eq('match_id', matchId).eq('athlete_id', loserId);

// 4. Update athletes ELO (ranked only)
await supabase.from('athletes').update({
  current_elo: winnerNewElo,
  highest_elo: Math.max(winnerNewElo, winnerHighestElo),
}).eq('id', winnerId);
```

**Note:** ELO calculation service doesn't exist in the backend yet. Frontend is responsible for computing new ELO values using the formula below and updating all records.

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

---

## Frontend/Backend Discrepancies

| Issue | Current Frontend | Backend Expects | Priority |
|-------|-----------------|-----------------|----------|
| Activation signal | `current_weight == null` → needs setup | `primary_gym_id IS NOT NULL` triggers activation | **HIGH** — setup must include gym picker |
| Weight units | Setup says "lbs" | `athletes.current_weight` has no unit spec (0-500 range). Challenge weights are explicitly lbs | **MEDIUM** — clarify with BE |
| Status filtering | Leaderboard/arena show all athletes | RLS only returns `active`/`inactive` to other users | **LOW** — RLS handles this |
| Challenge creation | Button disabled, not implemented | Full flow exists: insert with RLS validation | **HIGH** — next feature to build |
| Gym selection | Not in setup flow | Required for activation (`primary_gym_id` must be set) | **HIGH** — add gym picker to setup |
| Match start | Not implemented | Use `start_match_from_challenge()` RPC | **HIGH** — needed for match flow |
| ELO updates | Not implemented | Frontend responsible for computing + writing ELO | **MEDIUM** — needed when matches work |
