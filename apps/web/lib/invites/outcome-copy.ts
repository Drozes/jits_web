import { inviterFirstName } from "./format";
import type { AcceptJoinResult, ClaimResult, InviterCard } from "./types";

/**
 * What the landing page shows after a claim or join accept on web. Copy is
 * verbatim from contract section 7. Web always books (no location), so a
 * successful claim is "booked" with the match starting in the app.
 */
export type InviteOutcome =
  | { kind: "booked"; title: string; body: string; note: string | null }
  | { kind: "friends"; title: string; body: string }
  | { kind: "error"; title: string; body: string }
  | { kind: "setup" };

const BOOKED_BODY = "You're booked. The match starts when you're both on the mat.";

function name(inviter: InviterCard | null | undefined): string {
  return inviterFirstName(inviter);
}

export function claimOutcome(result: ClaimResult): InviteOutcome {
  if (result.ok) {
    const who = name(result.inviter);
    let note: string | null = null;
    if (result.start_blocked_reason === "inviter_busy") {
      note = `${who} is mid-match. We'll hold your spot.`;
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
      return { kind: "error", title: "Challenge withdrawn", body: `${who} withdrew this challenge.` };
    case "self":
      return { kind: "error", title: "Your challenge", body: "This is your own challenge. Send it to a training partner." };
    case "underage":
      return { kind: "error", title: "16 and over", body: "You must be 16 or older to compete on ELO RATED." };
    case "inviter_unavailable":
      return { kind: "error", title: "Not available", body: `${who} can't take matches right now.` };
    case "inviter_weekly_cap":
      return {
        kind: "error",
        title: "You're friends now",
        body: `${who} has played this week's invite matches. You're now friends, so challenge them from the Arena.`,
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
    return {
      kind: "friends",
      title: result.result === "already_friends" ? "Already friends" : "You're friends",
      body: `You and ${who} are now friends on ELO RATED. You'll see when they're on the mat.`,
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
