import { describe, expect, it } from "vitest";
import { claimOutcome, joinOutcome } from "./outcome-copy";
import type { ClaimFailureCode, InviterCard } from "./types";

const ALEX: InviterCard = {
  athlete_id: "a",
  first_name: "Alex",
  last_initial: "R",
  display_name: "Alex R",
  avatar_url: null,
  current_elo: 1482,
  weight_lbs: 172,
};

const success = (reason: "inviter_busy" | "claimer_busy" | "no_location" | null) =>
  claimOutcome({
    ok: true,
    result: "booked",
    invite_id: "i",
    challenge_id: "c",
    match_id: null,
    booking_expires_at: null,
    inviter: ALEX,
    start_blocked_reason: reason,
  });

describe("claimOutcome", () => {
  it("points an existing match to the app instead of the booked copy", () => {
    for (const result of ["already_claimed", "started"] as const) {
      expect(
        claimOutcome({
          ok: true,
          result,
          invite_id: "i",
          challenge_id: "c",
          match_id: "m",
          booking_expires_at: null,
          inviter: ALEX,
          start_blocked_reason: null,
        }),
      ).toEqual({ kind: "ready", title: "Match ready", body: "Your match with Alex is ready in the app." });
    }
  });

  it("capitalises the fallback name when it opens a sentence", () => {
    const nameless = { ...ALEX, first_name: null };
    expect(claimOutcome({ ok: false, code: "revoked", inviter: nameless })).toMatchObject({
      body: "Your training partner withdrew this challenge.",
    });
    expect(claimOutcome({ ok: false, code: "inviter_unavailable", inviter: null })).toMatchObject({
      body: "Your training partner can't take matches right now.",
    });
    expect(claimOutcome({ ok: false, code: "expired", inviter: null })).toMatchObject({
      body: "This challenge expired. Ask your training partner for a new one.",
    });
  });

  it("books on web with the contract copy", () => {
    expect(success("no_location")).toMatchObject({
      kind: "booked",
      body: "You're booked. The match starts when you're both on the mat.",
      note: null,
    });
    expect(success("inviter_busy")).toMatchObject({ note: "Alex is mid-match. We'll hold your spot." });
    expect(success("claimer_busy")).toMatchObject({
      note: "Finish your current match first. Your booking with Alex is saved.",
    });
  });

  it.each<[ClaimFailureCode, string]>([
    ["expired", "This challenge expired. Ask Alex for a new one."],
    ["used", "Someone already accepted this challenge."],
    ["revoked", "Alex withdrew this challenge."],
    ["self", "This is your own challenge. Send it to a training partner."],
    ["underage", "You must be 16 or older to compete on ELO RATED."],
    ["inviter_unavailable", "Alex can't take matches right now."],
    [
      "inviter_weekly_cap",
      "Alex has played this week's invite matches. You're now friends, so challenge them from the Arena.",
    ],
    ["invalid", "This invite link isn't valid. Ask your training partner to send it again."],
  ])("%s -> contract copy", (code, body) => {
    expect(claimOutcome({ ok: false, code, inviter: code === "invalid" ? null : ALEX })).toMatchObject({
      kind: "error",
      body,
    });
  });

  it("routes claimer_not_active to setup", () => {
    expect(claimOutcome({ ok: false, code: "claimer_not_active", inviter: ALEX })).toEqual({ kind: "setup" });
  });
});

describe("joinOutcome", () => {
  it("maps join results", () => {
    expect(joinOutcome({ ok: true, result: "friends", inviter: ALEX }, "Alex").kind).toBe("friends");
    expect(joinOutcome({ ok: false, code: "self" }, "Alex")).toMatchObject({ body: "This is your own invite link." });
    expect(joinOutcome({ ok: false, code: "revoked" }, "Alex")).toMatchObject({
      body: "This invite link was turned off. Ask Alex for a new one.",
    });
    expect(joinOutcome({ ok: false, code: "claimer_not_active" }, "Alex")).toEqual({ kind: "setup" });
  });

  it("does not say 'now friends' under 'Already friends'", () => {
    expect(joinOutcome({ ok: true, result: "already_friends", inviter: ALEX }, "Alex")).toMatchObject({
      title: "Already friends",
      body: "You and Alex are already friends on ELO RATED. You'll see when they're on the mat.",
    });
    expect(joinOutcome({ ok: true, result: "friends", inviter: ALEX }, "Alex")).toMatchObject({
      title: "You're friends",
      body: "You and Alex are now friends on ELO RATED. You'll see when they're on the mat.",
    });
  });

  it("uses the contract 7 copy on the weekly cap (the backend makes friends first)", () => {
    const out = claimOutcome({ ok: false, code: "inviter_weekly_cap", inviter: ALEX });
    expect(out).toMatchObject({
      title: "Weekly limit reached",
      body: "Alex has played this week's invite matches. You're now friends, so challenge them from the Arena.",
    });
  });
});
