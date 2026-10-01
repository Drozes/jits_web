import { inviterFirstName } from "./format";
import type { AcceptJoinResult, ClaimResult, InviterCard } from "./types";

/**
 * What the landing page shows after a claim or join accept on web. Copy is
 * verbatim from contract section 7. Web always books (no location), so a
 * successful claim is "booked" with the match starting in the app.
 */
export type InviteOutcome =
  | { kind: "booked"; title: string; body: string; note: string | null }
  /** The match already exists (already claimed or started): it lives in the app. */
  | { kind: "ready"; title: string; body: string }
  | { kind: "friends"; title: string; body: string }
  | { kind: "error"; title: string; body: string }
  /** Transient failure (network, server): the accept can be tried again. */
  | { kind: "retry"; title: string; body: string }
  | { kind: "setup" };

export const TRY_AGAIN_OUTCOME: InviteOutcome = {
  kind: "retry",
  title: "Something went wrong",
  body: "We couldn't reach ELO RATED. Check your connection and try again.",
};

const BOOKED_BODY = "You're booked. The match starts when you're both on the mat.";

function name(inviter: InviterCard | null | undefined): string {
  return inviterFirstName(inviter);
}

/** The name when it opens a sentence (capitalised fallback). */
function nameAtStart(inviter: InviterCard | null | undefined): string {
  return inviterFirstName(inviter, { sentenceStart: true });
}

export function claimOutcome(result: ClaimResult): InviteOutcome {
  if (result.ok) {
    const who = name(result.inviter);
    if (result.match_id) {
      return { kind: "ready", title: "Match ready", body: `Your match with ${who} is ready in the app.` };
    }
    let note: string | null = null;
    if (result.start_blocked_reason === "inviter_busy") {
      note = `${nameAtStart(result.inviter)} is mid-match. We'll hold your spot.`;
    } else if (result.start_blocked_reason === "claimer_busy") {
      note = `Finish your current match first. Your booking with ${who} is saved.`;
    }
    return { kind: "booked", title: "Challenge accepted", body: BOOKED_BODY, note };
  }

  const who = name(result.inviter);
  switch (result.code) {
    case "claimer_not_active":
      return { kind: "setup" };
    case "expired":
      return { kind: "error", title: "Challenge expired", body: `This challenge expired. Ask ${who} for a new one.` };
    case "used":
      return { kind: "error", title: "Already taken", body: "Someone already accepted this challenge." };
    case "revoked":
      return { kind: "error", title: "Challenge withdrawn", body: `${nameAtStart(result.inviter)} withdrew this challenge.` };
    case "self":
      return { kind: "error", title: "Your challenge", body: "This is your own challenge. Send it to a training partner." };
    case "underage":
      return { kind: "error", title: "16 and over", body: "You must be 16 or older to compete on ELO RATED." };
    case "inviter_unavailable":
      return { kind: "error", title: "Not available", body: `${nameAtStart(result.inviter)} can't take matches right now.` };
    case "inviter_weekly_cap":
      // CONTRACT AMENDMENT: contract 7 says "You're now friends", but the
      // backend returns this code before _ensure_friendship (friendship only
      // on an accepted invite), so no friendship exists. Do not claim one.
      return {
        kind: "error",
        title: "Weekly limit reached",
        body: `${nameAtStart(result.inviter)} has played this week's invite matches. Challenge them from the Arena.`,
      };
    case "accuracy_too_low":
      return {
        kind: "error",
        title: "Location",
        body: "We couldn't pin your location. Move near a window or turn on Wi-Fi, then try again.",
      };
    case "throttled":
    case "invalid":
    default:
      return {
        kind: "error",
        title: "Link not valid",
        body: "This invite link isn't valid. Ask your training partner to send it again.",
      };
  }
}

export function joinOutcome(result: AcceptJoinResult, fallbackName: string | null): InviteOutcome {
  if (result.ok) {
    const who = name(result.inviter);
    const already = result.result === "already_friends";
    return {
      kind: "friends",
      title: already ? "Already friends" : "You're friends",
      body: `You and ${who} are ${already ? "already" : "now"} friends on ELO RATED. You'll see when they're on the mat.`,
    };
  }
  const who = fallbackName || "your training partner";
  switch (result.code) {
    case "claimer_not_active":
      return { kind: "setup" };
    case "self":
      return { kind: "error", title: "Your invite", body: "This is your own invite link." };
    case "revoked":
      return { kind: "error", title: "Link turned off", body: `This invite link was turned off. Ask ${who} for a new one.` };
    case "invalid":
    default:
      return {
        kind: "error",
        title: "Link not valid",
        body: "This invite link isn't valid. Ask your training partner to send it again.",
      };
  }
}
