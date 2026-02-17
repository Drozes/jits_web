# Supabase Backend Enhancements

Backend (Supabase/PostgreSQL) changes that would reduce frontend query load, improve performance, and enable better caching. These require changes in the backend repo (`jr_be`).

---

## 1. New RPC: `get_dashboard_summary` — Single Call for Homepage

**Problem:** The dashboard page (`app/(app)/page.tsx`) currently makes 5 queries in a single `Promise.all()`:
1. `get_match_history` RPC (full match history to compute stats client-side)
2. `getAthleteRank` for current ELO (count query)
3. `getAthleteRank` for highest ELO (count query)
4. Pending incoming challenges (PostgREST query)
5. Pending sent challenges (PostgREST query)

**Proposal:** Create a `get_dashboard_summary` RPC that returns all dashboard data in one call:

```sql
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS JSON AS $$
  -- Returns:
  -- {
  --   stats: { wins, losses, draws, win_streak, best_win_streak },
  --   rank: { current, best },
  --   recent_matches: [ { match_id, opponent_name, outcome, match_type, elo_delta, completed_at } ],
  --   pending_challenges: {
  --     incoming: [ { id, created_at, match_type, challenger_id, challenger_name } ],
  --     sent: [ { id, created_at, match_type, opponent_id, opponent_name } ]
  --   }
  -- }
$$;
```

**Impact:** Reduces 5 queries → 1 RPC call. The dashboard is the most visited page.

**Severity:** High

---

## 2. New RPC: `get_arena_data` — Single Call for Arena Page

**Problem:** The arena page makes 4+ queries:
1. Athletes with `looking_for_casual=true` or `looking_for_ranked=true`
2. Other active athletes (not looking)
3. Pending challenge opponent IDs (2 sub-queries via `getPendingChallengeOpponentIds`)
4. Recent match activity (winners + losers in 2 queries)

**Proposal:** Create a `get_arena_data` RPC:

```sql
CREATE OR REPLACE FUNCTION get_arena_data(p_limit INT DEFAULT 20)
RETURNS JSON AS $$
  -- Returns:
  -- {
  --   looking_athletes: [ { id, display_name, current_elo, gym_name, looking_for_casual, looking_for_ranked } ],
  --   other_athletes: [ { id, display_name, current_elo, gym_name } ],
  --   challenged_opponent_ids: [ "uuid", ... ],
  --   recent_activity: [ { winner_name, loser_name, result, date } ]
  -- }
$$;
```

**Impact:** Reduces 6 queries → 1 RPC call. Arena is visited frequently during active matchmaking.

**Severity:** High

---

## 3. New RPC: `get_pending_challenges_page` — Single Call for Match Pending Page

**Problem:** The pending challenges page runs 5 sequential queries:
1. Received challenges with challenger join
2. Sent challenges with opponent join
3. Accepted challenges (lobbies) with both athlete joins
4. Match participant IDs for current athlete
5. Active matches with participant joins

**Proposal:**

```sql
CREATE OR REPLACE FUNCTION get_pending_challenges_page()
RETURNS JSON AS $$
  -- Returns:
  -- {
  --   received: [ { id, created_at, expires_at, match_type, challenger_weight, challenger: { id, name, elo } } ],
  --   sent: [ { id, created_at, expires_at, match_type, opponent: { id, name } } ],
  --   lobbies: [ { challenge_id, opponent_name, match_type } ],
  --   active_matches: [ { match_id, opponent_name, match_type, status } ]
  -- }
$$;
```

**Impact:** Reduces 5 queries → 1 RPC call.

**Severity:** Medium

---

## 4. New RPC: `get_athlete_rank` — Efficient Rank Calculation

**Problem:** `getAthleteRank()` counts all active athletes with higher ELO using a full table scan:
```sql
SELECT count(*) FROM athletes WHERE current_elo > $1 AND status = 'active'
```

This runs twice on the dashboard (once for current ELO, once for highest ELO).

**Proposal:** Create an RPC that returns both ranks:

```sql
CREATE OR REPLACE FUNCTION get_athlete_ranks(p_athlete_id UUID)
RETURNS TABLE(current_rank INT, best_rank INT, total_athletes INT) AS $$
  SELECT
    (SELECT count(*)::int + 1 FROM athletes WHERE current_elo > a.current_elo AND status = 'active'),
    (SELECT count(*)::int + 1 FROM athletes WHERE current_elo > a.highest_elo AND status = 'active'),
    (SELECT count(*)::int FROM athletes WHERE status = 'active')
  FROM athletes a
  WHERE a.id = p_athlete_id;
$$;
```

**Impact:** Reduces 2 count queries → 1 RPC call. Also provides `total_athletes` for "Rank X of Y" display.

**Severity:** Medium — used on dashboard, could also be used on profile pages.

---

## 5. Extend `get_athlete_stats` to Include Win Streak

**Problem:** The frontend computes win streak client-side by iterating through match history. The dashboard, profile page, and athlete profile page all:
1. Call `get_match_history` (returns ALL matches)
2. Iterate results to count wins/losses/streak

This means the frontend downloads the entire match history just to compute 4 numbers.

**Proposal:** Extend the existing `get_athlete_stats` RPC to also return `win_streak` and `best_win_streak`:

```sql
-- Current return: { wins, losses, draws }
-- Proposed return: { wins, losses, draws, win_streak, best_win_streak, total_matches }
```

The streak calculation is trivial in SQL with a window function:

```sql
-- Win streak: count consecutive wins from most recent match
WITH ordered AS (
  SELECT outcome, ROW_NUMBER() OVER (ORDER BY m.completed_at DESC) as rn
  FROM match_participants mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.athlete_id = p_athlete_id AND mp.outcome IS NOT NULL
)
SELECT count(*) FROM ordered
WHERE outcome = 'win' AND rn <= (
  SELECT COALESCE(MIN(rn) - 1, count(*))
  FROM ordered WHERE outcome != 'win'
);
```

**Impact:** Eliminates the need to fetch full match history on dashboard and profile pages. These pages only need stats — the match history list is separate.

**Severity:** High — the `get_match_history` RPC returns unbounded rows. For athletes with 100+ matches, this is a significant payload reduction.

---

## 6. Add Database Index: `athletes(status, current_elo DESC)`

**Problem:** Multiple queries filter by `status = 'active'` and sort by `current_elo DESC`:
- Leaderboard page
- Arena page (looking athletes + other athletes)
- `getAthleteRank()` count queries

**Proposal:**
```sql
CREATE INDEX idx_athletes_active_elo ON athletes (status, current_elo DESC)
WHERE status = 'active';
```

This partial index covers the most common query pattern and is small (only active athletes).

**Impact:** Speeds up leaderboard, arena, and rank queries. Noticeable at 1000+ athletes.

**Severity:** Medium — proactive for scale.

---

## 7. Add Database Index: `challenges(opponent_id, status)` and `challenges(challenger_id, status)`

**Problem:** Multiple queries filter challenges by `opponent_id + status` or `challenger_id + status`:
- Dashboard: pending incoming/sent challenges
- Pending challenges page: received/sent/accepted
- `getPendingChallengeOpponentIds`: sent + received pending
- `getPendingChallengeBetween`: both directions
- `usePendingChallenges` hook: opponent_id + status realtime refetch

**Proposal:**
```sql
CREATE INDEX idx_challenges_opponent_status ON challenges (opponent_id, status);
CREATE INDEX idx_challenges_challenger_status ON challenges (challenger_id, status);
```

**Impact:** Faster challenge lookups across all pages that show challenge data.

**Severity:** Medium — challenges are queried on nearly every page.

---

## 8. Add Database Index: `match_participants(athlete_id, match_id)`

**Problem:** The `match_participants` table is queried with:
- `athlete_id` filter on pending challenges page (find my matches)
- `athlete_id` filter + `outcome` filter in `getAthleteStats()` and `getLeaderboard()`
- `.in("athlete_id", [...])` batch queries on leaderboard

**Proposal:**
```sql
CREATE INDEX idx_match_participants_athlete ON match_participants (athlete_id, match_id);
```

**Impact:** Faster match lookups per athlete.

**Severity:** Low-Medium — the `get_match_history` RPC likely already benefits from this, but direct table queries don't.

---

## 9. New RPC: `get_challenge_opponent_ids` — Replace Two Queries

**Problem:** `getPendingChallengeOpponentIds()` in `queries.ts:406-427` runs two parallel queries:
1. Challenges where I'm the challenger → get opponent_ids
2. Challenges where I'm the opponent → get challenger_ids

**Proposal:** Single RPC:
```sql
CREATE OR REPLACE FUNCTION get_pending_challenge_opponent_ids()
RETURNS UUID[] AS $$
  SELECT array_agg(DISTINCT other_id) FROM (
    SELECT opponent_id AS other_id FROM challenges
    WHERE challenger_id = auth.uid()::uuid AND status = 'pending'
    UNION ALL
    SELECT challenger_id AS other_id FROM challenges
    WHERE opponent_id = auth.uid()::uuid AND status = 'pending'
  ) sub;
$$;
```

Called on: arena page, leaderboard page. Reduces 2 queries → 1 RPC.

**Impact:** Saves 1 query on two frequently-visited pages.

**Severity:** Low

---

## 10. Realtime RLS: Verify `messages` Table Filtering

**Problem:** The `global-messages` realtime subscription (`hooks/use-global-notifications.ts:47-49`) subscribes to ALL `INSERT` events on the `messages` table without a filter. It relies on Supabase Realtime RLS to filter out messages the user shouldn't see.

**Verification needed:**
1. Does the `messages` table have RLS policies that restrict `SELECT` to participants of the conversation?
2. Is Supabase Realtime configured to apply RLS filtering? (This requires `supabase.realtime.enable()` on the table with RLS enabled.)

If RLS is not applied to realtime, **every user receives every message insert**, and only the frontend filters them out. This would be a security issue (message content visible in browser dev tools) and a performance issue.

**Proposal:** Confirm in the backend that:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- Ensure RLS is enabled:
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- Ensure realtime respects RLS (Supabase dashboard setting)
```

**Severity:** High (if RLS is not applied to realtime) / Low (if already configured correctly).

---

## 11. New Column or View: `athletes.match_count`

**Problem:** The frontend needs total match count on the profile page. Currently it downloads the entire `get_match_history` result and counts rows client-side.

**Proposal:** Either:
- **(A)** Add `match_count` to the `get_athlete_stats` RPC return (see Enhancement #5)
- **(B)** Create a materialized view or trigger-maintained counter

Option A is simpler and sufficient for alpha.

**Severity:** Low — covered by Enhancement #5.

---

## 12. New RPC: `get_thread_data` — Single Call for Chat Thread

**Problem:** The chat thread page (`app/(app)/messages/[id]/page.tsx`) runs 3 queries:
1. Fetch conversation participants + conversation details (parallel)
2. Fetch participant athlete profiles (depends on #1)
3. Fetch initial messages

**Proposal:**
```sql
CREATE OR REPLACE FUNCTION get_thread_data(p_conversation_id UUID)
RETURNS JSON AS $$
  -- Returns:
  -- {
  --   conversation: { id, type, gym_name },
  --   participants: { [athlete_id]: { display_name, profile_photo_url } },
  --   messages: [ { id, sender_id, body, created_at } ]
  -- }
$$;
```

**Impact:** Reduces 3-4 queries → 1 RPC call.

**Severity:** Low-Medium — chat threads are opened frequently in active conversations.

---

## 13. Challenge Expiry: Server-Side Cleanup

**Problem:** The frontend filters expired challenges client-side:
```ts
received?.filter((c) => new Date(c.expires_at) > now)
```
(`pending-challenges-content.tsx:77`)

This means expired challenges are still:
- Stored with `status = 'pending'` in the database
- Returned by queries (wasteful bandwidth)
- Triggering realtime events
- Counted in `getPendingChallengeOpponentIds()` results

**Proposal:** Add a PostgreSQL cron job (via `pg_cron`) or a Supabase Edge Function that periodically marks expired challenges:

```sql
-- Run every 5 minutes
UPDATE challenges
SET status = 'expired', updated_at = now()
WHERE status = 'pending' AND expires_at < now();
```

Alternatively, use a database view or RLS policy that excludes expired challenges:
```sql
CREATE POLICY challenges_hide_expired ON challenges
FOR SELECT USING (status != 'pending' OR expires_at > now());
```

**Impact:** Reduces the number of rows returned in challenge queries and eliminates client-side filtering.

**Severity:** Medium — prevents stale data accumulation as the app scales.

---

## 14. Consider Database Functions for Common Joins

**Problem:** Multiple frontend queries repeat the same FK join patterns:
- `challenger:athletes!fk_challenges_challenger(id, display_name, current_elo)` — used 5+ times
- `gyms!fk_athletes_primary_gym(name)` — used 4+ times

**Proposal:** Create database views for commonly-joined data:

```sql
CREATE VIEW challenges_with_athletes AS
SELECT c.*,
  ch.display_name AS challenger_name, ch.current_elo AS challenger_elo,
  op.display_name AS opponent_name, op.current_elo AS opponent_elo
FROM challenges c
LEFT JOIN athletes ch ON ch.id = c.challenger_id
LEFT JOIN athletes op ON op.id = c.opponent_id;

CREATE VIEW athletes_with_gym AS
SELECT a.*, g.name AS gym_name
FROM athletes a
LEFT JOIN gyms g ON g.id = a.primary_gym_id;
```

**Impact:** Simplifies frontend queries and ensures consistent join patterns. Views can have their own RLS policies.

**Severity:** Low — architectural improvement, not a performance fix.

---

## Summary: Priority Matrix

| # | Enhancement | Severity | Effort | Queries Saved |
|---|---|---|---|---|
| 1 | `get_dashboard_summary` RPC | High | Medium | 5 → 1 |
| 5 | Extend `get_athlete_stats` with streaks | High | Low | Eliminates match history fetch for stats |
| 2 | `get_arena_data` RPC | High | Medium | 6 → 1 |
| 10 | Verify realtime RLS on messages | High | Low | Security + potential perf fix |
| 6 | Index: `athletes(status, current_elo)` | Medium | Trivial | Faster leaderboard/arena/rank |
| 7 | Indexes: `challenges(opponent/challenger, status)` | Medium | Trivial | Faster challenge queries |
| 4 | `get_athlete_ranks` RPC | Medium | Low | 2 → 1 |
| 13 | Challenge expiry cron/policy | Medium | Low | Fewer rows in all challenge queries |
| 3 | `get_pending_challenges_page` RPC | Medium | Medium | 5 → 1 |
| 12 | `get_thread_data` RPC | Low-Med | Medium | 3-4 → 1 |
| 8 | Index: `match_participants(athlete_id)` | Low-Med | Trivial | Faster participant lookups |
| 9 | `get_pending_challenge_opponent_ids` RPC | Low | Low | 2 → 1 |
| 14 | Database views for common joins | Low | Medium | Simpler queries |
| 11 | Match count in stats RPC | Low | Trivial | Covered by #5 |

### Implementation Order Recommendation

**Phase 1 — Quick wins (indexes + extend existing RPC):**
- #6, #7, #8: Add indexes (trivial migrations, immediate benefit)
- #5: Extend `get_athlete_stats` with streak data (small SQL change, big frontend savings)
- #10: Verify realtime RLS (audit, no code change if already correct)

**Phase 2 — Page-specific RPCs:**
- #1: `get_dashboard_summary` (highest-traffic page)
- #4: `get_athlete_ranks` (used on dashboard)
- #13: Challenge expiry cleanup

**Phase 3 — Remaining RPCs:**
- #2: `get_arena_data`
- #3: `get_pending_challenges_page`
- #12: `get_thread_data`

**Phase 4 — Architectural:**
- #14: Database views
- #9: Challenge opponent IDs RPC
