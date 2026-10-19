/**
 * The Arena's one door to the challenge writes (timekeeper mode ARCHITECTURE
 * 2.7): create a challenge, accept one, and start the match it became. The
 * Arena handshake (`use-arena-challenge.ts`) calls these, never the shared
 * wrappers directly, so a refusal that needs the same handling at every
 * start (the timekeeper-mode busy refusals, slice M6) has one home, and so
 * does any future per-call capability.
 *
 * Today each call is the shipped wrapper with the app's client: same
 * arguments, same `Result`, nothing added.
 */
import {
  acceptChallenge,
  createChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { supabase } from "../supabase/client";

type CreateParams = Parameters<typeof createChallenge>[1];
type AcceptParams = Parameters<typeof acceptChallenge>[1];

/** Challenge an athlete (the challenger's side). */
export function createArenaChallenge(params: CreateParams): ReturnType<typeof createChallenge> {
  return createChallenge(supabase, params);
}

/** Accept a pending challenge (the opponent's side). */
export function acceptArenaChallenge(params: AcceptParams): ReturnType<typeof acceptChallenge> {
  return acceptChallenge(supabase, params);
}

/**
 * Start (or join) the match an accepted challenge becomes. Either side may
 * call it; `start_match_from_challenge` returns the one match for the
 * challenge whoever calls first.
 */
export function startArenaMatch(challengeId: string): ReturnType<typeof startMatchFromChallenge> {
  return startMatchFromChallenge(supabase, challengeId);
}
