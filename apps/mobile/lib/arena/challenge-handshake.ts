/**
 * The accept / decline handshake, owned in exactly one place.
 *
 * Lifted out of `use-arena-challenge.ts` when Home grew a pending-challenge
 * inbox (see that file's header for why the inbox now exists). Accepting is
 * NOT a status write. It is:
 *
 *   1. `acceptChallenge`  -- flip the row to `accepted`
 *   2. `startMatchFromChallenge` -- the match actually comes into being here
 *   3. BROADCAST `match_started` -- tell the challenger the match exists
 *   4. only then navigate
 *
 * Step 3 is the one a second, naive implementation drops, and dropping it is
 * invisible to the person who wrote it: the acceptor lands in the wizard and
 * everything looks fine, while the challenger sits on a waiting plate for a
 * match that already started without them. So the ordering lives here rather
 * than being re-spelled per surface, and both the Arena prompt and the Home
 * inbox call this.
 *
 * Failure is always read off RETURNED DATA, never off a rejection: the shared
 * mutations return `Result` and never throw, and `channel.send()` resolves to
 * "ok" / "error" / "timed out".
 */
import {
  acceptChallenge,
  declineChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { supabase } from "../supabase/client";
import { challengeTopic } from "./constants";

/**
 * Tell the other side the match exists.
 *
 * `send()` on a channel this client never joined falls back to a REST POST and
 * resolves to "ok" / "error" / "timed out". It does not reject, so success is
 * read off the returned status, never off a rejection. One retry, because a
 * lost broadcast strands the challenger on the waiting plate.
 */
export async function broadcastChallengeEvent(
  challengeId: string,
  event: "match_started" | "declined",
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const channel = supabase.channel(challengeTopic(challengeId));
  let status = await channel.send({ type: "broadcast", event, payload });
  if (status !== "ok") {
    status = await channel.send({ type: "broadcast", event, payload });
  }
  await supabase.removeChannel(channel);
  return status === "ok";
}

/**
 * The outcome both surfaces need, with the message already decided.
 *
 * One failure shape rather than two, because both callers treat the two
 * reachable failures identically: stop offering the challenge and say why.
 */
export type AcceptHandshakeResult =
  | { ok: true; matchId: string }
  | { ok: false; message: string };

/**
 * Accept a challenge, create the match, and tell the challenger about it.
 *
 * Both parties may end up calling `start_match_from_challenge` for the same
 * challenge and they converge on ONE match without any client-side retry:
 * `matches.challenge_id` is UNIQUE and the function's own EXCEPTION block
 * catches `unique_violation`, re-selects the winner's match id and returns
 * `{ success: true, already_exists: true }` (jr_be
 * 20260219000000_start_match_enhancements.sql). No 23505 ever reaches
 * PostgREST, so a retry on MATCH_ALREADY_EXISTS would be dead code guarding a
 * response the server cannot produce.
 */
export async function acceptChallengeAndStart(
  challengeId: string,
  opponentWeight: number | null,
): Promise<AcceptHandshakeResult> {
  const accepted = await acceptChallenge(supabase, {
    challengeId,
    opponentWeight: opponentWeight ?? undefined,
  });
  if (!accepted.ok) {
    return {
      ok: false,
      message: accepted.error.message || "Couldn't accept that challenge.",
    };
  }

  // `acceptChallenge` filters on `status = 'pending'`, and a PostgREST update
  // that matches no rows is not an error, so a challenge that was cancelled or
  // expired a moment ago still returns ok above. The real answer arrives here,
  // as `not_accepted`.
  const started = await startMatchFromChallenge(supabase, challengeId);
  if (!started.ok) {
    return {
      ok: false,
      message:
        started.error.code === "CHALLENGE_NOT_ACCEPTED"
          ? "That challenge is no longer available."
          : started.error.message || "Couldn't start the match.",
    };
  }

  // Before the caller navigates, always. This broadcast is what pulls the
  // challenger off the waiting plate and into the same match; navigate first
  // and they sit there while we are already in the wizard.
  await broadcastChallengeEvent(challengeId, "match_started", {
    matchId: started.data.match_id,
  });

  return { ok: true, matchId: started.data.match_id };
}

/**
 * Decline a challenge and tell the challenger.
 *
 * Returns false when the write itself refused, in which case the caller must
 * KEEP offering the challenge: it is still pending server-side and the
 * challenger is still waiting, so dismissing it would lie to both sides.
 */
export async function declineChallengeAndNotify(
  challengeId: string,
): Promise<boolean> {
  const result = await declineChallenge(supabase, challengeId);
  if (!result.ok) return false;
  await broadcastChallengeEvent(challengeId, "declined");
  return true;
}
