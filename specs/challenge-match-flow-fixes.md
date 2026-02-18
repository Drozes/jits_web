# Challenge → Match → Complete: E2E Flow Fixes

> **Status: IMPLEMENTED** — All 4 fixes landed in commit `c76a335` on 2026-02-18.

## Context

A full code review of the challenge → match → complete flow identified 4 functional bugs. This spec documents each bug with exact file locations, root causes, and prescribed fixes.

The flow has 6 phases: Create Challenge → Accept/Decline → Lobby → Start Match → Live Timer → Record Result. The core architecture (realtime sync, RPC contracts, state machine) is solid. These are implementation gaps, not design problems.

---

## Bug 1: ChallengeResponseSheet doesn't broadcast acceptance to lobby

### Problem

When the opponent accepts a challenge from the pending page's `ChallengeResponseSheet`, no `challenge_accepted` broadcast is sent to the lobby channel. If the challenger is waiting on the lobby page, they stay stuck on "Waiting for opponent to respond..." until they manually refresh.

### Root Cause

`ChallengeResponseSheet` (`components/domain/challenge-response-sheet.tsx`) calls `acceptChallenge()` and navigates to the lobby, but doesn't join or broadcast to the `lobby:{challengeId}` channel. The `broadcastAccepted()` function only exists in `useLobbySync` which is used by `LobbyActions` on the lobby page — not by the response sheet.

### Files

- `components/domain/challenge-response-sheet.tsx` — lines 89-107 (handleAccept)
- `hooks/use-lobby-sync.ts` — lines 69-75 (broadcastAccepted)

### Fix

After `acceptChallenge()` succeeds in `handleAccept()`, create a one-shot broadcast to `lobby:{challengeId}` before navigating:

```tsx
// After acceptChallenge succeeds, before navigation:
const channel = supabase.channel(`lobby:${challenge.id}`);
await channel.subscribe();
await channel.send({
  type: "broadcast",
  event: "challenge_accepted",
  payload: {},
});
supabase.removeChannel(channel);
```

This is a fire-and-forget broadcast — the sheet doesn't need to stay subscribed. The important thing is that the challenger's `useLobbySync` receives the `challenge_accepted` event and calls `router.refresh()`.

---

## Bug 2: ChallengeSheet bypasses mutations layer

### Problem

`ChallengeSheet` does a raw `supabase.from("challenges").insert()` instead of calling `createChallenge()` from `lib/api/mutations.ts`. This causes:

1. **Raw DB error messages shown to users** — only Postgres error code `42501` is caught manually; all other errors show raw `insertError.message`.
2. **`challenger_id` from props, not auth token** — the mutation derives it from `auth_athlete_id()` RPC (stronger contract).
3. **No challenge ID returned** — the raw insert doesn't `.select("id")`, so the created challenge ID is lost.

### Files

- `components/domain/challenge-sheet.tsx` — lines 92-109 (handleSubmit)
- `lib/api/mutations.ts` — lines 28-48 (createChallenge)

### Fix

Replace the raw insert with the existing `createChallenge()` mutation:

```tsx
// Before (challenge-sheet.tsx:92-109):
const { error: insertError } = await supabase.from("challenges").insert({
  challenger_id: currentAthleteId,
  opponent_id: competitorId,
  match_type: matchType,
  challenger_weight: parsedWeight,
});
// ... manual error handling

// After:
const result = await createChallenge(supabase, {
  opponentId: competitorId,
  matchType: matchType,
  challengerWeight: parsedWeight ?? undefined,
});

if (!result.ok) {
  setError(result.error.message);
  setSubmitting(false);
  return;
}
```

Import `createChallenge` from `@/lib/api/mutations`. Remove the `currentAthleteId` prop since the mutation derives it from auth. The `competitorId` prop is still needed for the opponentId param.

After this change, `ChallengeSheetProps` no longer needs `currentAthleteId`. Update all call sites to stop passing it.

---

## Bug 3: SentChallengesList bypasses mutations layer

### Problem

`SentChallengesList` does a raw `supabase.from("challenges").update()` for cancellation instead of using `cancelChallenge()`. Error messages are raw DB strings.

### Files

- `app/(app)/match/pending/sent-challenges-list.tsx` — lines 29-51 (handleCancel)
- `lib/api/mutations.ts` — lines 97-110 (cancelChallenge)

### Fix

Replace the raw update with the existing mutation:

```tsx
// Before (sent-challenges-list.tsx:33-41):
const supabase = createClient();
const { error: updateError } = await supabase
  .from("challenges")
  .update({ status: "cancelled", updated_at: new Date().toISOString() })
  .eq("id", challengeId)
  .eq("status", "pending");

// After:
const supabase = createClient();
const result = await cancelChallenge(supabase, challengeId);

if (!result.ok) {
  setError(result.error.message);
  setCancellingId(null);
  return;
}
```

Import `cancelChallenge` from `@/lib/api/mutations`.

Note: The raw call added `.eq("status", "pending")` and `updated_at`. The `cancelChallenge` mutation doesn't filter by status (RLS handles it) and doesn't set `updated_at`. This is fine — the RLS `challenges_update_cancel` policy restricts to `pending | accepted → cancelled`, and `updated_at` has a DB trigger or is optional.

---

## Bug 4: Timer broadcasts client timestamp instead of server timestamp

### Problem

When an athlete starts the match timer, `match-timer.tsx` broadcasts `new Date().toISOString()` (the client's clock) instead of the `started_at` returned by the `start_match()` RPC (the server's clock). The other athlete's timer syncs to this client timestamp. If device clocks differ, timers desync.

### Files

- `app/(app)/match/[id]/live/match-timer.tsx` — lines 86-97 (handleStart)
- `types/composites.ts` — lines 100-104 (StartMatchTimerResponse — missing `started_at`)

### Fix

Two changes needed:

**1. Add `started_at` to `StartMatchTimerResponse`** (`types/composites.ts`):

```tsx
export interface StartMatchTimerResponse {
  success: boolean;
  match_id?: string;
  started_at?: string;  // ← add this
  error?: string;
}
```

The backend `start_match()` RPC already returns `started_at` in the JSONB response (confirmed in migration `20260215000000_security_hardening.sql`).

**2. Use server timestamp in broadcast** (`match-timer.tsx`):

```tsx
// Before (line 94-95):
const now = new Date().toISOString();
broadcastTimerStarted(now);

// After:
const serverStartedAt = result.data.started_at ?? new Date().toISOString();
broadcastTimerStarted(serverStartedAt);
```

Fallback to client time only if `started_at` is somehow missing.

---

## Verification

After all fixes, run:

1. `npx tsc --noEmit` — type check
2. `npx next build` — build check
3. `npm test` — unit tests

### Manual E2E test scenario

1. Athlete A opens Athlete B's profile → Send Challenge (ranked, with weight)
2. Athlete A navigates to `/match/pending` → sees sent challenge → clicks into lobby
3. Athlete A sees "Waiting for opponent to respond..."
4. Athlete B navigates to `/match/pending` → sees received challenge → clicks "Respond"
5. Athlete B accepts with weight → **verify Athlete A's lobby refreshes automatically** (Bug 1 fix)
6. Both athletes in lobby → one clicks "Start Match" → both navigate to live page
7. One athlete clicks "Start Timer" → **verify both timers are in sync** (Bug 4 fix)
8. Timer runs or click "End Match" → both navigate to results
9. One athlete records result (submission or draw) → other athlete sees completed results

Check error paths:
- Create 4th challenge → **verify friendly error "You already have 3 pending challenges"** (Bug 2 fix)
- Cancel sent challenge → **verify it works without raw DB error** (Bug 3 fix)
