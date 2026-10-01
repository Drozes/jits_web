/**
 * Claim runner decisions (jr_be spec 016, contract 7): every claim result maps
 * to the right next step and copy, and only terminal outcomes clear the
 * pending invite.
 *
 * Source: apps/mobile/lib/invites/claim-flow.ts, launch-route.ts
 */
import type { ClaimResult } from "@jits/shared/api/invites";
import { clearsPendingInvite, stepForClaim, stepForJoin } from "@/lib/invites/claim-flow";
import { inviteLaunchRoute } from "@/lib/invites/launch-route";
import { makePendingInvite } from "@/lib/invites/pending-invite";

const inviter = {
  athlete_id: "a1",
  first_name: "Alex",
  last_initial: "R",
  display_name: "Alex R",
  avatar_url: null,
  current_elo: 1482,
  weight_lbs: 172,
};
const ok = (over: Partial<Extract<ClaimResult, { ok: true }>>): ClaimResult => ({
  ok: true,
  result: "booked",
  invite_id: "i1",
  challenge_id: "c1",
  match_id: null,
  booking_expires_at: null,
  inviter,
  proximity: null,
  start_blocked_reason: "no_location",
  ...over,
});
const fail = (code: string, over: Record<string, unknown> = {}): ClaimResult =>
  ({ ok: false, code, inviter, attempts_left: null, retry_after_s: null, ...over }) as ClaimResult;
const ctx = { viaCode: false, athleteStatus: "active", locationOff: false };

describe("stepForClaim", () => {
  it("started and an idempotent retry with a match go to the face-off", () => {
    expect(stepForClaim(ok({ result: "started", match_id: "m1" }), ctx)).toEqual({ type: "go_match", matchId: "m1" });
    expect(stepForClaim(ok({ result: "already_claimed", match_id: "m1" }), ctx)).toEqual({ type: "go_match", matchId: "m1" });
  });
  it("booked uses the blocker copy with the inviter's name", () => {
    expect(stepForClaim(ok({ start_blocked_reason: "inviter_busy" }), ctx)).toMatchObject({
      type: "booked",
      message: "Alex is mid-match. We'll hold your spot.",
    });
    expect(stepForClaim(ok({ start_blocked_reason: "far" }), { ...ctx, locationOff: true })).toMatchObject({
      type: "booked",
      message: "You're booked. The match starts when you're both on the mat.",
      locationOff: true,
    });
  });
  it("an invalid token may be a join link; an invalid code shows tries left and is not terminal", () => {
    expect(stepForClaim(fail("invalid", { inviter: null }), ctx)).toEqual({ type: "try_join" });
    expect(stepForClaim(fail("invalid", { attempts_left: 2 }), { ...ctx, viaCode: true })).toEqual({
      type: "message",
      message: "That code didn't match. 2 tries left.",
      terminal: false,
    });
    expect(stepForClaim(fail("throttled", { retry_after_s: 300 }), { ...ctx, viaCode: true })).toEqual({
      type: "message",
      message: "Too many tries. Try again in 5 minutes.",
      terminal: false,
      retryAfterS: 300,
    });
  });
  it("claimer_not_active routes a pending profile to setup, never an inactive one", () => {
    expect(stepForClaim(fail("claimer_not_active"), { ...ctx, athleteStatus: "pending" })).toEqual({ type: "setup" });
    expect(stepForClaim(fail("claimer_not_active"), { ...ctx, athleteStatus: "inactive" })).toMatchObject({
      type: "message",
      terminal: true,
    });
  });
  it("accuracy_too_low asks for another reading", () => {
    expect(stepForClaim(fail("accuracy_too_low"), ctx).type).toBe("retry_location");
  });
  it.each(["expired", "used", "revoked", "self", "underage", "inviter_unavailable", "inviter_weekly_cap"])(
    "%s is a terminal message",
    (code) => {
      const step = stepForClaim(fail(code), ctx);
      expect(step).toMatchObject({ type: "message", terminal: true });
      expect(clearsPendingInvite(step)).toBe(true);
    },
  );
  it("dob_required asks for the date of birth and keeps the invite (never the underage copy)", () => {
    const step = stepForClaim(fail("dob_required"), ctx);
    expect(step).toEqual({
      type: "dob",
      message: "We need your date of birth before your first ranked match. You must be 16 or older.",
    });
    expect(clearsPendingInvite(step)).toBe(false);
  });
  it("an unknown future code is a generic retry that keeps the invite", () => {
    const step = stepForClaim(fail("brand_new_code"), ctx);
    expect(step).toEqual({
      type: "message",
      message: "Something went wrong opening this invite. Try again.",
      terminal: false,
    });
    expect(clearsPendingInvite(step)).toBe(false);
  });
  it("retryable outcomes keep the pending invite", () => {
    expect(clearsPendingInvite({ type: "setup" })).toBe(false);
    expect(clearsPendingInvite({ type: "retry_location", message: "" })).toBe(false);
    expect(clearsPendingInvite({ type: "message", message: "", terminal: false })).toBe(false);
  });
});

describe("stepForJoin", () => {
  it("friends and failures", () => {
    expect(stepForJoin({ ok: true, result: "friends", inviter }, "active")).toEqual({
      type: "friends",
      inviterName: "Alex",
      already: false,
    });
    expect(stepForJoin({ ok: false, code: "self" }, "active")).toMatchObject({ message: "This is your own invite link." });
    expect(stepForJoin({ ok: false, code: "claimer_not_active" }, "pending")).toEqual({ type: "setup" });
  });
  it("an unknown join code is a generic retry, not terminal", () => {
    expect(stepForJoin({ ok: false, code: "brand_new_code" }, "active")).toEqual({
      type: "message",
      message: "Something went wrong opening this invite. Try again.",
      terminal: false,
    });
  });
});

describe("inviteLaunchRoute", () => {
  const pending = makePendingInvite({ code: "K7Q4M2" }, "code");
  it("signup first when signed out, setup when unfinished, claim when active", () => {
    expect(inviteLaunchRoute({ pending, signedIn: false, athleteStatus: null })).toBe("/signup");
    expect(inviteLaunchRoute({ pending, signedIn: true, athleteStatus: null })).toBe("/invite-setup");
    expect(inviteLaunchRoute({ pending, signedIn: true, athleteStatus: "pending" })).toBe("/invite-setup");
    expect(inviteLaunchRoute({ pending, signedIn: true, athleteStatus: "active" })).toBe("/invite/claim");
    expect(inviteLaunchRoute({ pending: null, signedIn: true, athleteStatus: "active" })).toBeNull();
  });
});
