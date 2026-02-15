# 007 — Frontend / Backend Integration Brief

**Date:** 2026-02-14
**From:** Frontend (jits_web)
**To:** Backend (jr_be)
**Purpose:** Align on integration status, propose a typed data access layer, and flag gaps before we build the match flow.

---

## 1. What the Backend Got Right

Before anything else — the backend is in excellent shape. Some highlights:

- **11 RPC functions** covering the full challenge → match → result → ELO pipeline. Clean function signatures, proper error returns as JSONB `{ success, match_id, error }`.
- **177+ pgTAP tests** across 9 test files. The match resolution suite alone has 71 tests. That's real coverage.
- **Atomic ELO calculation** inside `record_match_result()` — no split-brain risk between recording the outcome and updating ratings. This is the hardest thing to get right and it's already done.
- **Idempotent match creation** via unique constraint on `challenge_id` + race condition handling in `start_match_from_challenge()`. Exactly the right approach for two clients hitting the same endpoint.
- **Clean state machine** — challenge and match statuses use VARCHAR with RPC-enforced transitions, not database enums. Easy to extend, hard to corrupt.
- **RLS policies that actually work** — 18 policies that let the frontend operate without a middleware layer. Challenger can't challenge themselves, opponent can't accept their own challenge, participants can only see their own matches. All enforced at the database level.

The backend is not the bottleneck. The frontend is.

---

## 2. Current Integration Status

### Fully Wired

| Feature | Backend | Frontend | Notes |
|---------|---------|----------|-------|
| Auth → Athlete creation | `handle_new_user()` trigger | Supabase Auth | Auto-creates athlete on signup |
| Profile setup + activation | `handle_athlete_activation()` trigger | Setup form with gym picker | Sets display_name, weight, gym → auto-activates |
| Gym browsing | `gyms` table + RLS | Gym dropdown in setup + profile | 5 seed gyms available |
| Challenge creation | `challenges` INSERT + RLS | `ChallengeSheet` component | Validates match type, weight, creates challenge |
| Challenge accept/decline | `challenges` UPDATE + RLS | `ChallengeResponseSheet` component | Opponent can accept (sets weight) or decline |
| Challenge cancellation | `challenges` UPDATE + RLS | Cancel button on sent challenges | Either party can cancel accepted challenges |
| ELO stakes preview | `calculate_elo_stakes()` RPC | Displayed in `ChallengeSheet` | Shows predicted ELO win/loss before sending |
| Challenge rate limiting | `can_create_challenge()` RPC | Used in challenge validation | Max 3 pending outgoing |
| Looking-for-match toggle | `athletes.looking_for_match` column | Toggle in Arena page | Signals availability |
| Free agent activation | `free_agent` column + updated trigger | Setup form | Can activate without gym |

### Not Yet Wired (Backend Ready, Frontend Missing)

| Feature | RPC / Table | Frontend Status | Priority |
|---------|-------------|-----------------|----------|
| Start match from challenge | `start_match_from_challenge()` | No UI | **P0** — core flow |
| Start match timer | `start_match()` | No UI | **P0** — core flow |
| Record match result | `record_match_result()` | No UI | **P0** — core flow |
| Match history | `get_match_history()` | No UI | **P1** — key screen |
| ELO history | `get_elo_history()` | No UI | **P1** — motivation feature |
| Submission types catalog | `submission_types` table | Never queried | **P1** — needed for result recording |
| ELO history table | `elo_history` table | Not in generated types | **P1** — needed for ELO chart |

### Not Yet Built (Neither Side)

| Feature | Status | Notes |
|---------|--------|-------|
| Realtime challenge notifications | Spec exists (006) | Frontend needs Supabase Realtime channels |
| Leaderboard query | No backend RPC | Frontend has mock data, needs a real query |
| Dispute flow | Backend spec pending (Step 4) | No frontend design yet |
| Match timer sync | No mechanism | Both athletes need to see the same clock |

---

## 3. What We're Building: A Typed Data Access Layer

We're adding a thin `lib/api/` module that wraps Supabase calls with domain semantics. Not a framework — roughly 300 lines total. Here's why it matters and what it looks like.

### Problem: Raw Queries Everywhere

Today, every component that touches data does this:

```ts
const supabase = await createClient();
const { data, error } = await supabase
  .from('athletes')
  .select('*, gyms!fk_athletes_primary_gym(name)')
  .eq('id', id)
  .single();

// FK joins return arrays, must unpack
const gymArr = data?.gyms as { name: string }[] | null;
const gymName = gymArr?.[0]?.name ?? null;

// Stats are computed, not stored
const { data: outcomes } = await supabase
  .from('match_participants')
  .select('outcome')
  .eq('athlete_id', id);
const stats = computeStats(outcomes);
```

This is duplicated across 6+ components. FK join unpacking is error-prone. RPC calls use string names with no type safety.

### Solution: Domain Query Functions

```
lib/api/
  queries.ts    — Server-side data fetching (athlete, challenges, matches, elo)
  mutations.ts  — Client-side actions (challenge CRUD, match lifecycle RPCs)
  realtime.ts   — Subscription hooks (challenge updates, match status, lobby presence)
  errors.ts     — Domain error types (MAX_PENDING, OPPONENT_INACTIVE, etc.)
```

#### Server Queries (`queries.ts`)

Functions that encode FK joins + type unpacking + stats computation:

```ts
// queries.athlete.byId(supabase, id) returns:
{
  id, display_name, current_elo, highest_elo, status,
  gymName: string | null,        // FK join unpacked
  stats: { wins, losses, winRate }, // Computed from match_participants
  winStreak: number,             // Computed from match_participants
}

// queries.matches.history(supabase, athleteId) wraps get_match_history RPC:
{
  matchId, opponentName, result, matchType,
  eloChange: { before, after, delta }, // Already in RPC response
  submission: { typeName, finishTime } | null,
  completedAt: Date,
}
```

#### Client Mutations (`mutations.ts`)

Typed wrappers around RPCs with domain error handling:

```ts
// mutations.match.startFromChallenge(supabase, challengeId) wraps the RPC:
type StartMatchResult =
  | { ok: true; matchId: string }
  | { ok: false; error: 'CHALLENGE_NOT_ACCEPTED' | 'MATCH_ALREADY_EXISTS' | 'NOT_PARTICIPANT' }

// mutations.match.recordResult(supabase, { matchId, result, winnerId?, submissionTypeCode?, finishTime? })
type RecordResultResult =
  | { ok: true; matchId: string }
  | { ok: false; error: 'MATCH_NOT_IN_PROGRESS' | 'INVALID_RESULT' | 'NOT_PARTICIPANT' }
```

The error codes map directly to what the RPCs already return — we're just making them typed instead of parsing JSONB strings.

#### Realtime Hooks (`realtime.ts`)

```ts
// Subscribe to challenge changes for the current athlete
useChallengeUpdates(athleteId) → { challenges: Challenge[], isConnected: boolean }

// Subscribe to match status during an active match
useMatchStatus(matchId) → { match: Match, status: MatchStatus }

// Lobby presence for the Arena screen
useLobbyPresence() → { online: { athleteId, displayName, elo }[] }
```

### Match Flow State Machine

The challenge → match → result pipeline has 6 phases. We'll encode these as a discriminated union so UI components just switch on `phase`:

```ts
type MatchFlow =
  | { phase: 'challenge_pending'; challenge; canCancel: boolean }
  | { phase: 'challenge_accepted'; challenge; canStartMatch: boolean }
  | { phase: 'match_pending'; match; canBegin: boolean }
  | { phase: 'match_active'; match; startedAt; durationSeconds: number }
  | { phase: 'match_recording'; match; submissionTypes: SubmissionType[] }
  | { phase: 'match_completed'; match; result; eloDelta?: number }
```

This means every future screen just asks "what phase am I in?" and renders accordingly. No scattered business logic.

---

## 4. Requests for Backend

### Immediate (Unblocks P0 Work)

**4.1 — Leaderboard Query**

We need a way to fetch the top N athletes by ELO. Currently the frontend has mock data. Options:

- **Option A: Simple query** — We can do `from('athletes').select(...).order('current_elo', { ascending: false }).limit(N)` if RLS allows reading other athletes' ELO. Current `athletes_select_public` policy restricts to active/inactive athletes but includes `current_elo` in the row. **Does this work, or do we need an RPC?**
- **Option B: RPC** — `get_leaderboard(p_limit INT DEFAULT 25)` that returns ranked athletes with computed stats. More performant since stats computation (wins/losses) would happen server-side instead of N+1 queries from the frontend.

**Recommendation:** Option B is better long-term. Stats computation from `match_participants` for 25+ athletes on every leaderboard load will be expensive as the dataset grows.

**4.2 — Confirm Weight Units**

`athletes.current_weight` has a CHECK constraint of `0-500` with no unit specified. Challenge weights are described as "lbs" in the spec. Are we standardizing on pounds? The frontend setup form currently says "lbs" — want to confirm before we build the match flow UI.

### Short-Term (Unblocks P1 Work)

**4.3 — Head-to-Head Stats**

The frontend has a `CompareStatsModal` that shows a head-to-head view between two athletes. Currently it computes this client-side. An RPC like `get_head_to_head(p_athlete_id_1, p_athlete_id_2)` returning `{ wins_1, wins_2, draws, matches: MatchSummary[] }` would be more efficient and accurate.

**4.4 — Match Timer Synchronization**

When two athletes are in an active match, both need to see the same countdown. Options:

- **Option A: Trust `started_at` timestamp** — `start_match()` already sets `started_at = NOW()`. Frontend computes remaining time as `duration_seconds - (now - started_at)`. Relies on both devices having reasonably synced clocks.
- **Option B: Supabase Realtime broadcast** — One device (the match initiator) broadcasts timer ticks. More accurate but more complex.

**Recommendation:** Option A for alpha. Clock drift of a few seconds is acceptable for a 10-minute match. We can revisit if it becomes a problem.

**4.5 — Challenge Expiration Cleanup**

Challenges expire after 7 days (`expires_at` column). The frontend currently filters expired challenges client-side. Is there a database job or cron that updates expired challenges to `status = 'expired'`? If not, we should decide:

- Frontend filters by `expires_at < now()` and treats them as expired regardless of `status` column (current approach)
- Backend cron/trigger that updates status (cleaner, but more backend work)

### Future (Nice to Have)

**4.6 — Athlete Search / Discovery**

The Arena screen needs to show "available opponents" — active athletes who are `looking_for_match = true`, optionally filtered by weight class or location. An RPC with filtering would be ideal, but a simple query works for alpha since the user base is small.

**4.7 — Notification Preferences**

When we add realtime challenge notifications, athletes may want to control what they're notified about. No backend work needed yet — just flagging for the roadmap.

---

## 5. Type Generation

Our `types/database.ts` is stale. It's missing:

- `submission_types` table
- `elo_history` table
- `submissions` table (partially present but incomplete)
- 6 RPC function signatures (`start_match_from_challenge`, `start_match`, `record_match_result`, `get_match_history`, `get_elo_history`, and the updated `can_create_challenge` with `p_opponent_id` param)

We'll add a `db:types` script that regenerates from the live schema. Just flagging so the BE knows we depend on these types being accurate — if a migration changes a return type, our build will catch it after regeneration.

---

## 6. RPC Contract Summary

For our own reference and for verification — here's our understanding of every RPC's contract. **Please flag anything that's wrong.**

### `start_match_from_challenge(p_challenge_id UUID)`
- **Caller:** Either challenge participant
- **Precondition:** Challenge status = 'accepted'
- **Effect:** Creates match + 2 match_participants, sets challenge status = 'started'
- **Returns:** `{ success: true, match_id }` or `{ success: false, error }`
- **Idempotent:** Yes — returns existing match_id if already started

### `start_match(p_match_id UUID)`
- **Caller:** Either match participant
- **Precondition:** Match status = 'pending'
- **Effect:** Sets match status = 'in_progress', sets `started_at = NOW()`
- **Returns:** `{ success: true, match_id }` or `{ success: false, error }`

### `record_match_result(p_match_id, p_result, p_winner_id?, p_submission_type_code?, p_finish_time_seconds?)`
- **Caller:** Either match participant
- **Precondition:** Match status = 'in_progress'
- **p_result:** 'submission' (requires winner_id + submission_type_code) or 'draw'
- **Effect:**
  - Sets match result, status = 'completed', completed_at
  - Sets match_participant outcomes (win/loss/draw)
  - Creates submission record (if submission)
  - **For ranked matches:** Calculates ELO, updates both athletes' `current_elo` + `highest_elo`, writes `elo_history` entries
- **Returns:** `{ success: true, match_id }` or `{ success: false, error }`

### `get_match_history(p_athlete_id UUID)`
- **Caller:** The athlete themselves (RLS: `auth_athlete_id() = p_athlete_id`)
- **Returns:** TABLE of completed matches with columns:
  - `match_id, match_type, result, status, duration_seconds, completed_at`
  - `opponent_id, opponent_name` (the other participant)
  - `submission_type, finish_time_seconds` (if submission)
  - `elo_before, elo_after, elo_delta, opponent_elo_at_time` (if ranked)

### `get_elo_history(p_athlete_id UUID)`
- **Caller:** The athlete themselves
- **Returns:** TABLE of `match_id, rating_before, rating_after, delta, created_at`
- **Order:** Most recent first

### `calculate_elo_stakes(challenger_elo INT, opponent_elo INT, k_factor INT DEFAULT 32)`
- **Caller:** Any authenticated user
- **Returns:** JSONB with:
  - `challenger_win_delta, challenger_loss_delta`
  - `opponent_win_delta, opponent_loss_delta`
  - `draw_delta_challenger, draw_delta_opponent`

### `can_create_challenge(p_opponent_id UUID DEFAULT NULL)`
- **Caller:** Any authenticated user
- **Returns:** BOOLEAN
- **Logic:** Caller has < 3 pending outgoing challenges AND (if opponent specified) opponent status = 'active'

### `auth_athlete_id()`
- **Internal helper** — returns current user's athlete UUID
- **Used by:** All RLS policies

---

## 7. Proposed Timeline

| Week | Frontend Work | Backend Dependency |
|------|--------------|-------------------|
| 1 | Regenerate types, build `lib/api/` layer | None |
| 2 | Match flow screens (start → timer → record) | Confirm RPC contracts (Section 6) |
| 3 | Match history + ELO history pages | None |
| 4 | Realtime challenge notifications | None (using Supabase Realtime) |
| 5 | Leaderboard with real data | `get_leaderboard()` RPC (Section 4.1) |
| 6 | Head-to-head stats | `get_head_to_head()` RPC (Section 4.3) |

Weeks 1-4 are fully unblocked. Weeks 5-6 depend on two new RPCs.

---

## Appendix: File References

- **Frontend backend reference:** `research/005-backend-reference.md`
- **Frontend types:** `types/database.ts` (needs regeneration)
- **Frontend guards:** `lib/guards.ts`
- **Backend migrations:** `jr_be/supabase/migrations/`
- **Backend RPC contracts:** `jr_be/specs/004-elo-system/contracts/rpc-functions.md`
- **Backend challenge API:** `jr_be/specs/002-challenges/contracts/challenges-api.md`
- **Backend match resolution spec:** `jr_be/specs/003-match-resolution/`
