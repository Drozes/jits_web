/**
 * The Arena's one door to the challenge writes (timekeeper mode ARCHITECTURE
 * 2.7): create a challenge, accept one, and start the match it became. The
 * Arena handshake (`use-arena-challenge.ts`) calls these, never the shared
 * wrappers directly, so a refusal that needs the same handling at every
 * start (the timekeeper-mode busy refusals below) has one home, and so does
 * any future per-call capability.
 *
 * Create and accept are the shipped wrapper with the app's client: same
 * arguments, same `Result`, nothing added. So is a start, except for the
 * busy refusals. Which refused sends are raw text lives here too
 * (`isRawRefusal`, `SEND_REFUSED_TOAST`).
 */
import type { DomainError } from "@jits/shared/api/errors";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  startMatchFromChallenge,
} from "@jits/shared/api/mutations";
import { getChallengesBetween } from "@jits/shared/api/queries";
import { SHIPPED_COPY, TIMEKEEPER_COPY, type TimekeeperToast } from "@/lib/match-flow/timekeeper-copy";
import { supabase } from "../supabase/client";
import { getArenaSelfId } from "./arena-store";

type CreateParams = Parameters<typeof createChallenge>[1];
type AcceptParams = Parameters<typeof acceptChallenge>[1];
type StartData = Extract<Awaited<ReturnType<typeof startMatchFromChallenge>>, { ok: true }>["data"];

/** A toast as `toast.error` takes it: the title, and the reason under it. */
export interface StartRefusalToast {
  text1: string;
  description?: string;
}

/**
 * A refused start. A busy refusal also carries the deck's toast for it,
 * which the handshake shows instead of its shipped words.
 */
export type ArenaStartError = DomainError & { toast?: StartRefusalToast };

/** The shared wrapper's result, with a busy refusal's toast. */
export type ArenaStartResult = { ok: true; data: StartData } | { ok: false; error: ArenaStartError };

/** Challenge an athlete (the challenger's side). */
export function createArenaChallenge(params: CreateParams): ReturnType<typeof createChallenge> {
  return createChallenge(supabase, params);
}

/**
 * The codes of a refusal whose words are not the app's own: `mapPostgrestError`
 * leaves the server's or the network library's raw text under `UNKNOWN` for
 * any refusal it does not map (a statement timeout, a dropped connection) and
 * under `RLS_VIOLATION`, and `createChallenge` says "Could not identify
 * current athlete" under `UNKNOWN`. Every other code a send can come back
 * with carries the shared table's user-safe line.
 */
const RAW_MESSAGE_CODES: ReadonlySet<DomainError["code"]> = new Set<DomainError["code"]>(["UNKNOWN", "RLS_VIOLATION"]);

/**
 * Whether a refused send's words are raw text the app never shows
 * (timekeeper mode PM31 (2), both modes). Decided by the code alone: this
 * file is a timekeeper-mode surface, which never reads an error's words
 * (M-R4, `timekeeper-mode-guard.test.ts`), so the handshake, the shipped
 * two-athlete file, keeps showing a mapped refusal's own line, for example
 * "You can't challenge this athlete." (`BLOCKED`), exactly as it always did.
 * The cap, `MAX_PENDING_CHALLENGES`, is answered by the handshake's
 * `explainRefusedInsert` and never gets this far.
 */
export function isRawRefusal(error: DomainError): boolean {
  return RAW_MESSAGE_CODES.has(error.code);
}

/**
 * The toast for a refused send that is raw (`isRawRefusal`) or has no words:
 * the send's shipped title (the handshake's words before PM31, also the web
 * handshake's) over the shipped guidance, never the raw text. The Wave 3 gate
 * saw "canceling statement due to statement timeout" on this toast.
 */
export const SEND_REFUSED_TOAST: Readonly<Required<StartRefusalToast>> = Object.freeze({
  text1: "Couldn't send that challenge.",
  description: SHIPPED_COPY.checkConnection,
});

/** Accept a pending challenge (the opponent's side). */
export function acceptArenaChallenge(params: AcceptParams): ReturnType<typeof acceptChallenge> {
  return acceptChallenge(supabase, params);
}

/**
 * The busy refusals (timekeeper mode R2, spec 3.4): the match INSERT refuses
 * a new match while either athlete is the seated timekeeper
 * (`TIMEKEEPER_BUSY`) or a competitor (`ATHLETE_IN_TIMEKEEPER_MATCH`) of an
 * active timekeeper-mode match, with DETAIL naming the busy athlete. Only
 * possible while such a match exists, so the two-athlete flow never sees one.
 */
export function isBusyRefusal(error: DomainError): boolean {
  return error.code === "TIMEKEEPER_BUSY" || error.code === "ATHLETE_IN_TIMEKEEPER_MATCH";
}

/** Starts this app process saw refused as busy, by challenge. */
const busyRefusals = new Map<string, ArenaStartResult>();

/** Test-only: forget the remembered refusals. */
export function __resetChallengeApiForTests(): void {
  busyRefusals.clear();
}

/**
 * Start (or join) the match an accepted challenge becomes. Either side may
 * call it; `start_match_from_challenge` returns the one match for the
 * challenge whoever calls first.
 *
 * A busy refusal is final for the challenge (the busy athlete's match runs
 * for minutes), so it is handled here, once (review tech minor 10): the
 * accepted challenge is withdrawn, so neither the challenger's 12 s fallback
 * nor the accepter's own retry goes back into the same refusal; once this
 * call has withdrawn it, every later start of that challenge gets the same
 * refusal without asking the server; and the refusal carries the deck's
 * toast for this athlete (`busyToast`), its description as the message.
 */
export async function startArenaMatch(challengeId: string): Promise<ArenaStartResult> {
  const known = busyRefusals.get(challengeId);
  if (known) return known;
  const result = await startMatchFromChallenge(supabase, challengeId);
  if (result.ok || !isBusyRefusal(result.error)) return result;
  const withdrawn = await cancelChallenge(supabase, challengeId, { onlyIfAccepted: true });
  const toast = await busyToast(challengeId, result.error);
  const refusal: ArenaStartResult = {
    ok: false,
    error: { ...result.error, message: toast.description ?? toast.text1, toast },
  };
  // Remembered only when this withdraw cancelled the challenge, so nothing
  // can start it any more. No row changed means it is no longer `accepted`
  // (the other side may have started it after all), and a failed withdraw
  // (offline) settled nothing: either way the next start asks the server.
  if (withdrawn.ok && withdrawn.data.cancelled) busyRefusals.set(challengeId, refusal);
  return refusal;
}

/** The shipped title every busy toast keeps (COPY-DECK TK-E2, TK-E3). */
const COULD_NOT_START = TIMEKEEPER_COPY["TK-E2"].title;

const asToast = (t: TimekeeperToast): StartRefusalToast => ({ text1: t.title, description: t.description });

/**
 * The deck's busy toast for this athlete, under the shipped title: TK-E2
 * (`You're timekeeping another match.`) when the refusal names them as the
 * seated timekeeper (`TIMEKEEPER_BUSY`), TK-E3 (`{name} is busy in another
 * match.`) when it names the other athlete. When it names them as a
 * competitor of another match the deck has no line yet (asked of the PM), so
 * the title alone, which is true. Without this athlete's id or the other's
 * name, the deck's subject-free busy words (TK-P8, TK-P9).
 */
async function busyToast(challengeId: string, error: DomainError): Promise<StartRefusalToast> {
  const timekeeping = error.code === "TIMEKEEPER_BUSY";
  const busyId = error.raw?.details?.trim() || null;
  const selfId = getArenaSelfId();
  if (busyId && busyId === selfId) return timekeeping ? asToast(TIMEKEEPER_COPY["TK-E2"]) : { text1: COULD_NOT_START };
  // Only on a busy refusal: the pair's challenges, for the one name.
  const between = busyId && selfId ? await getChallengesBetween(supabase, selfId, busyId) : [];
  const row = between.find((c) => c.id === challengeId);
  const name = row ? [row.challenger, row.opponent].find((a) => a?.id === busyId)?.display_name : null;
  if (name) return asToast(TIMEKEEPER_COPY["TK-E3"](name));
  return { text1: COULD_NOT_START, description: TIMEKEEPER_COPY[timekeeping ? "TK-P8" : "TK-P9"] };
}
