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
});
