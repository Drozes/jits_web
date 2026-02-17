# Supabase Frontend Enhancements

Audit of all Supabase interactions in the JITS Web frontend with optimization recommendations.

---

## 1. Guards: `requireAthlete()` Over-Fetches on Every Page Load

**File:** `lib/guards.ts:28-32`

**Current behavior:** Every authenticated page calls `requireAthlete()`, which runs `select("*")` on the `athletes` table. This fetches all columns (including `bio`, `profile_photo_url`, `created_at`, `updated_at`, etc.) when most pages only need `id`, `display_name`, `current_elo`, `current_weight`, `status`, and `looking_for_*` flags.

**Impact:** This query runs on *every single page navigation* for authenticated users. It's the most frequently executed query in the app.

**Recommendation:**
```ts
// Replace select("*") with explicit columns
const { data: athlete } = await supabase
  .from("athletes")
  .select("id, auth_user_id, display_name, current_elo, highest_elo, current_weight, status, looking_for_casual, looking_for_ranked, free_agent, primary_gym_id, profile_photo_url")
  .eq("auth_user_id", user.id)
  .single();
```

Same fix applies to `getActiveAthlete()` at line 58.

**Severity:** Medium — reduces payload size on every page load.

---

## ~~2. Athlete Profile Page: `select("*")` + Separate Gym Fetch (N+1)~~ ✅ DONE

**File:** `app/(app)/athlete/[id]/athlete-profile-content.tsx`

**Fixed:** Added `gyms!fk_athletes_primary_gym(name)` FK join to eliminate separate gym query. Moved competitor fetch into `Promise.all()` alongside stats, pending challenge, and match history queries. Result: **5 queries in 2 round trips** (down from 6 queries in 3 round trips).

---

## 3. Own Profile Page: Separate Gym Fetch

**File:** `app/(app)/profile/profile-content.tsx:54-61`

**Current behavior:** After `getMatchHistory()` returns, a separate query fetches the gym name. The `athlete` object from `requireAthlete()` already contains `primary_gym_id` but not the gym name (because `requireAthlete()` uses `select("*")` without a gym join).

**Recommendation:** Either:
- **(A)** Add a gym FK join to `requireAthlete()` so all pages get `gymName` for free, OR
- **(B)** Use `getAthleteProfile()` from the data access layer which already includes gym via FK join

Option A is the simplest — it adds gym name to the guard that every page already calls.

**Severity:** Low — only affects the profile page, single query.

---

## ~~4. Arena Page: Sequential Queries That Should Be Parallel~~ ✅ DONE

**File:** `app/(app)/arena/page.tsx`

**Fixed:** Wrapped 4 independent queries (looking athletes, other athletes, challenged IDs, recent matches) into `Promise.all()`. Losers query remains sequential as it depends on match IDs. **Saves ~3 serial round trips.**

---

## ~~5. Pending Challenges Page: 5 Sequential Queries~~ ✅ DONE

**File:** `app/(app)/match/pending/pending-challenges-content.tsx`

**Fixed:** Wrapped 4 independent queries (received, sent, accepted, participations) into `Promise.all()`. Active matches query remains sequential as it depends on participation IDs. **Saves ~3 serial round trips.**

---

## 6. Dashboard Page: `getAthleteRank()` Uses `select("*")`

**File:** `lib/api/queries.ts:127-133`

**Current behavior:**
```ts
const { count } = await supabase
  .from("athletes")
  .select("*", { count: "exact", head: true })
  .gt("current_elo", elo)
  .eq("status", "active");
```

The `head: true` flag means no rows are returned — only the count. But `select("*")` still tells PostgREST to parse all columns for the count query plan.

**Recommendation:**
```ts
.select("id", { count: "exact", head: true })
```

Additionally, this is called **twice** on the dashboard (once for current ELO, once for highest ELO for "best rank"). Both calls could be done with a single RPC if the backend provided it.

**Severity:** Low — PostgREST optimizes `head: true` queries, but using `"id"` is still cleaner.

---

## 7. `getLeaderboard()` in `queries.ts` Is Dead Code

**File:** `lib/api/queries.ts:88-120`

**Current behavior:** The `getLeaderboard()` function fetches athletes and then batch-fetches `match_participants` outcomes. However, the actual leaderboard page (`app/(app)/leaderboard/page.tsx:35-44`) does its own athlete query and uses `getAthletesStatsRpc()` for stats instead.

**Also dead:** `getAthleteStats()` at line 74-85 — the direct `match_participants` query version. All call sites use `getAthleteStatsRpc()` instead.

**Recommendation:** Remove both `getLeaderboard()` and `getAthleteStats()` from `queries.ts`. They are unused and the RPC versions have replaced them.

**Severity:** Low — code cleanliness, no runtime impact.

---

## 8. `getSubmissionTypes()` Over-Fetches Static Data

**File:** `lib/api/queries.ts:224-234`

**Current behavior:** Uses `select("*")` for submission types. This table contains 23 rows that rarely change.

**Recommendation:**
1. Use explicit columns: `select("id, name, code, category, sort_order")`
2. This is a prime candidate for Next.js `unstable_cache()` or `cache()` since submission types are essentially static reference data

**Severity:** Low — small table, but easy win.

---

## 9. `getLobbyData()` Uses `select("*")` on Challenges

**File:** `lib/api/queries.ts:434-444`

**Current behavior:** The challenge base select is `select("*", ...)` which fetches all challenge columns plus the FK joins.

**Recommendation:** Select only the columns actually used by `LobbyData`:
```ts
.select(`id, match_type, challenger_weight, opponent_weight, status,
  challenger:athletes!fk_challenges_challenger(id, display_name, current_elo, highest_elo, current_weight),
  opponent:athletes!fk_challenges_opponent(id, display_name, current_elo, highest_elo, current_weight),
  gym:gyms!fk_challenges_gym(id, name, address, city)`)
```

**Severity:** Low — single query on lobby page.

---

## 10. `ChallengeSheet` Bypasses Data Access Layer

**File:** `components/domain/challenge-sheet.tsx:58-68, 90-96`

**Current behavior:**
- **Line 58-68:** Calls `calculate_elo_stakes` RPC directly instead of using `getEloStakes()` from `lib/api/queries.ts`
- **Line 90-96:** Does a raw `.from("challenges").insert()` instead of using `createChallenge()` from `lib/api/mutations.ts`

**Impact:** The raw insert bypasses the `Result<T>` error mapping and the `auth_athlete_id` RPC call that `createChallenge()` uses. The component manually handles the `42501` error code instead of receiving a typed `MAX_PENDING_CHALLENGES` domain error.

**Recommendation:** Use the existing data access layer:
```ts
// For stakes preview:
import { getEloStakes } from "@/lib/api/queries";
const stakes = await getEloStakes(supabase, currentAthleteElo, competitorElo, ...);

// For challenge creation:
import { createChallenge } from "@/lib/api/mutations";
const result = await createChallenge(supabase, { opponentId, matchType, challengerWeight });
if (!result.ok) setError(result.error.message);
```

**Severity:** Medium — consistency and error handling improvement.

---

## 11. Chat Messages Use `select("*")`

**File:** `lib/api/chat-queries.ts:49`

**Current behavior:** `getMessages()` fetches all message columns with `select("*")`.

**Recommendation:** Select only needed columns:
```ts
.select("id, conversation_id, sender_id, body, created_at")
```

This reduces payload size for message-heavy conversations (50 messages per page load).

**Severity:** Low-Medium — depends on how many extra columns the `messages` table has.

---

## 12. `usePendingChallenges` Re-Fetches Entire List on Every Change

**File:** `hooks/use-pending-challenges.ts:76-87`

**Current behavior:** On every `INSERT` or `UPDATE` event from the realtime channel, the hook calls `fetchChallenges()` which re-queries the entire pending challenges list.

**Problem:** The realtime payload already contains the new/updated row. For `INSERT`, the hook could append to state. For `UPDATE` (e.g., status changed to `accepted`), it could remove from state.

**Recommendation:** Optimistic state patching:
```ts
// On INSERT: append to challenges state
(payload) => {
  setChallenges(prev => [mapChallenge(payload.new), ...prev]);
}
// On UPDATE: remove if status changed from pending
(payload) => {
  if (payload.new.status !== "pending") {
    setChallenges(prev => prev.filter(c => c.id !== payload.new.id));
  }
}
```

Fall back to full refetch only if state becomes inconsistent.

**Severity:** Low — saves one query per realtime event, but events are infrequent.

---

## 13. `useUnreadCount` Polls Every 30 Seconds

**File:** `hooks/use-unread-count.ts:7, 32`

**Current behavior:** Polls `get_unread_counts` RPC every 30 seconds, plus on window focus and on manual refresh events.

**Context:** The `useGlobalNotifications` hook already listens to message `INSERT` events via realtime and calls `refreshUnreadCounts()` immediately. This means the 30s polling is mainly a safety net for missed events.

**Recommendation:** Increase polling interval to 60-120 seconds since realtime handles the immediate updates. The 30s interval creates unnecessary load when the user has the app open but idle.

**Severity:** Low — reduces RPC calls by 50% during idle sessions.

---

## 14. `global-messages` Channel Has Broad Scope

**File:** `hooks/use-global-notifications.ts:47-49`

**Current behavior:** Subscribes to ALL `INSERT` events on the `messages` table with no filter. Relies on RLS to limit which rows are visible.

**Recommendation:** If Supabase RLS properly filters the messages (which it should), this is safe but wasteful — the server still processes change detection for all messages, even those RLS will filter out. Adding a filter would reduce server-side processing:
```ts
// If possible, filter by conversation_id using a server function
// Or accept the current approach as acceptable for alpha
```

**Severity:** Low at current scale. Becomes relevant with many concurrent users.

---

## 15. Dashboard Queries: Two Separate Challenge Queries

**File:** `app/(app)/page.tsx:50-63`

**Current behavior:** Two separate queries fetch pending incoming and sent challenges. These are already inside `Promise.all()` (good), but they could potentially be a single query.

**Recommendation:** Consider a single query with an `or()` filter:
```ts
const { data: allPending } = await supabase
  .from("challenges")
  .select("id, created_at, status, match_type, challenger_id, opponent_id,
    challenger:athletes!fk_challenges_challenger(id, display_name),
    opponent:athletes!fk_challenges_opponent(id, display_name)")
  .or(`opponent_id.eq.${athlete.id},challenger_id.eq.${athlete.id}`)
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(10);
```

Then split into incoming/sent client-side. Saves one query.

**Severity:** Low — already parallelized, so latency impact is minimal.

---

## 16. Messages Thread Page: Sequential Then Parallel

**File:** `app/(app)/messages/[id]/page.tsx:43-64`

**Current behavior:**
1. **Lines 43-53:** Parallel fetch of participants + conversation details (good)
2. **Lines 59-64:** Sequential fetch of participant profiles (depends on #1 — correct)
3. **Line 86:** Sequential fetch of messages (no dependency on #2 — could be parallel)

**Recommendation:** Fetch messages in parallel with participant profiles since they have no dependency:
```ts
const [{ data: participantProfiles }, initialMessages] = await Promise.all([
  supabase.from("athletes").select(...).in("id", participantIds),
  getMessages(supabase, conversationId),
]);
```

**Severity:** Low — saves one round trip on thread open.

---

## 17. `createChallenge` Mutation: Unprotected `auth_athlete_id`

**File:** `lib/api/mutations.ts:35`

**Current behavior:**
```ts
challenger_id: (await supabase.rpc("auth_athlete_id")).data!,
```

The `!` non-null assertion means if the RPC fails (network error, session expired), the mutation will insert with `challenger_id: null` or crash.

**Recommendation:**
```ts
const { data: challengerId, error: authError } = await supabase.rpc("auth_athlete_id");
if (authError || !challengerId) {
  return { ok: false, error: { code: "AUTH_ERROR", message: "Not authenticated" } };
}
```

**Severity:** Medium — potential data integrity issue if session expires mid-action.

---

## Summary: Priority Matrix

| # | Enhancement | Severity | Effort | Impact |
|---|---|---|---|---|
| ~~4~~ | ~~Arena page: parallelize queries~~ | ~~High~~ | ~~Low~~ | ~~-3 round trips~~ ✅ |
| ~~5~~ | ~~Pending challenges: parallelize queries~~ | ~~High~~ | ~~Low~~ | ~~-3 round trips~~ ✅ |
| ~~2~~ | ~~Athlete profile: FK join + parallelize~~ | ~~High~~ | ~~Low~~ | ~~-1 query, -1 round trip~~ ✅ |
| 1 | Guards: explicit select columns | Medium | Low | Reduced payload every page |
| 10 | ChallengeSheet: use data access layer | Medium | Medium | Consistency + error handling |
| 17 | createChallenge: protect auth_athlete_id | Medium | Low | Data integrity |
| 13 | Unread count: increase poll interval | Low | Trivial | -50% idle RPC calls |
| 3 | Profile: gym via FK join | Low | Low | -1 query |
| 6 | getAthleteRank: `select("id")` | Low | Trivial | Cleaner query |
| 7 | Remove dead code | Low | Trivial | Code cleanliness |
| 8 | Submission types: explicit select | Low | Trivial | Reduced payload |
| 9 | Lobby data: explicit select | Low | Trivial | Reduced payload |
| 11 | Chat messages: explicit select | Low | Trivial | Reduced payload |
| 12 | Challenge hook: optimistic updates | Low | Medium | -1 query per event |
| 14 | Global messages: narrow scope | Low | Low | Reduced server processing |
| 15 | Dashboard: combine challenge queries | Low | Low | -1 query |
| 16 | Thread page: parallelize messages | Low | Low | -1 round trip |
