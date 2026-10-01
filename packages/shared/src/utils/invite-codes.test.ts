import { describe, expect, it } from "vitest";
import { extractInviteFromText, formatInviteCode, isInviteToken, normalizeInviteCode } from "./invite-codes";
import { buildInviteShareMessage } from "./invite-share";
import {
  bookedMessage,
  checkDateOfBirth,
  claimFailureView,
  createInviteErrorMessage,
  inviteSignupBanner,
  joinFailureMessage,
} from "./invite-copy";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt"; // 22 chars

describe("normalizeInviteCode", () => {
  it("maps look-alikes the same way the server does", () => {
    expect(normalizeInviteCode("k7q-4m2")).toBe("K7Q4M2");
    expect(normalizeInviteCode(" o1l -iuz ")).toBe("0111VZ");
  });
  it("rejects wrong lengths and characters outside the alphabet", () => {
    expect(normalizeInviteCode("K7Q4M")).toBeNull();
    expect(normalizeInviteCode("K7Q4M2X")).toBeNull();
    expect(normalizeInviteCode("K7Q*M2")).toBeNull();
    expect(normalizeInviteCode(null)).toBeNull();
  });
  it("formats as XXX-XXX", () => {
    expect(formatInviteCode("K7Q4M2")).toBe("K7Q-4M2");
  });
});

describe("extractInviteFromText", () => {
  it("pulls the token out of a full share message (code is ignored when a link is present)", () => {
    const msg = buildInviteShareMessage("challenge", `https://elorated.com/c/${TOKEN}`, "K7Q-4M2");
    expect(extractInviteFromText(msg)).toEqual({ token: TOKEN });
  });
  it("accepts the scheme link and the interim web host", () => {
    expect(extractInviteFromText(`elorated://c/${TOKEN}`)).toEqual({ token: TOKEN });
    expect(extractInviteFromText(`https://jitsweb.vercel.app/c/${TOKEN}?x=1`)).toEqual({ token: TOKEN });
  });
  it("does not take a longer path segment as a token", () => {
    expect(extractInviteFromText(`https://elorated.com/c/${TOKEN}XYZ`)).toBeNull();
  });
  it("finds a code inside text", () => {
    expect(extractInviteFromText("my code is k7q-4m2!")).toEqual({ code: "K7Q4M2" });
    expect(extractInviteFromText("K7Q 4M2")).toEqual({ code: "K7Q4M2" });
  });
  it("returns null for empty or unrelated text", () => {
    expect(extractInviteFromText("")).toBeNull();
    expect(extractInviteFromText("see you at open mat")).toBeNull();
  });
  it("validates tokens", () => {
    expect(isInviteToken(TOKEN)).toBe(true);
    expect(isInviteToken(`${TOKEN}=`)).toBe(false);
  });
});

describe("share message", () => {
  it("uses the exact challenge template with the code", () => {
    expect(buildInviteShareMessage("challenge", "https://x/c/t", "K7Q-4M2")).toBe(
      "I'm calling you out on ELO RATED. Ranked roll, my number vs yours. Accept: https://x/c/t (code K7Q-4M2)",
    );
  });
  it("omits the code when there is none and uses the join template", () => {
    expect(buildInviteShareMessage("challenge", "https://x/c/t")).toBe(
      "I'm calling you out on ELO RATED. Ranked roll, my number vs yours. Accept: https://x/c/t",
    );
    expect(buildInviteShareMessage("join", "https://x/c/t")).toBe(
      "Train with me on ELO RATED, ranked jiu-jitsu. Join me: https://x/c/t",
    );
  });
});

describe("claim copy (contract section 7)", () => {
  const n = { inviterName: "Alex" };
  it.each([
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
  ])("%s", (code, copy) => {
    expect(claimFailureView(code, n)).toEqual({ next: "message", message: copy });
  });
  it("invalid differs by gateway", () => {
    expect(claimFailureView("invalid", { viaCode: true, attemptsLeft: 3 }).message).toBe(
      "That code didn't match. 3 tries left.",
    );
    expect(claimFailureView("invalid", { viaCode: true, attemptsLeft: 1 }).message).toBe(
      "That code didn't match. 1 try left.",
    );
    expect(claimFailureView("invalid").message).toBe(
      "This invite link isn't valid. Ask your training partner to send it again.",
    );
  });
  it("throttled rounds up to whole minutes", () => {
    expect(claimFailureView("throttled", { retryAfterS: 61 }).message).toBe("Too many tries. Try again in 2 minutes.");
    expect(claimFailureView("throttled", { retryAfterS: 5 }).message).toBe("Too many tries. Try again in 1 minute.");
  });
  it("dob_required asks for the date of birth, never the underage copy", () => {
    expect(claimFailureView("dob_required")).toEqual({
      next: "dob",
      message: "We need your date of birth before your first ranked match. You must be 16 or older.",
    });
  });
  it("an unknown future code is a generic retry, never underage or invalid-link", () => {
    const v = claimFailureView("some_new_code", n);
    expect(v).toEqual({ next: "message", message: "Something went wrong opening this invite. Try again.", retryable: true });
    expect(v.message).not.toMatch(/16 or older/);
  });
  it("checkDateOfBirth: real date, not future, not before 1900, 16+", () => {
    const today = new Date(2026, 9, 1); // 2026-10-01 local
    expect(checkDateOfBirth("1990-05-01", today)).toBe("ok");
    expect(checkDateOfBirth("2010-10-01", today)).toBe("ok"); // 16th birthday today
    expect(checkDateOfBirth("2010-10-02", today)).toBe("underage");
    expect(checkDateOfBirth("2015-01-01", today)).toBe("underage");
    expect(checkDateOfBirth("2026-10-02", today)).toBe("invalid");
    expect(checkDateOfBirth("1899-12-31", today)).toBe("invalid");
    expect(checkDateOfBirth("1990-02-30", today)).toBe("invalid");
    expect(checkDateOfBirth("", today)).toBe("invalid");
    expect(checkDateOfBirth("05/01/1990", today)).toBe("invalid");
  });
  it("routes claimer_not_active to setup and accuracy to a retry", () => {
    expect(claimFailureView("claimer_not_active").next).toBe("setup");
    expect(claimFailureView("accuracy_too_low")).toMatchObject({ next: "retry_location", actionLabel: "Try again" });
  });
  it("booked copy by start blocker", () => {
    expect(bookedMessage("inviter_busy", "Alex")).toBe("Alex is mid-match. We'll hold your spot.");
    expect(bookedMessage("claimer_busy", "Alex")).toBe(
      "Finish your current match first. Your booking with Alex is saved.",
    );
    for (const r of ["far", "stale", "waiting", "no_location", null] as const) {
      expect(bookedMessage(r, "Alex")).toBe("You're booked. The match starts when you're both on the mat.");
    }
  });
  it("create limits", () => {
    expect(createInviteErrorMessage("too_many_open_invites")).toBe("You have 5 open challenges. Revoke one to send another.");
    expect(createInviteErrorMessage("daily_invite_limit")).toBe("You've sent today's 20 invites. Try again tomorrow.");
    expect(createInviteErrorMessage("weekly_invite_match_cap")).toBe(
      "You've played this week's 3 invite matches. Challenge friends from the Arena.",
    );
    expect(createInviteErrorMessage("invites_disabled")).toBe("Invites are paused right now.");
  });
  it("join and signup copy", () => {
    expect(joinFailureMessage("revoked", "Alex")).toBe("This invite link was turned off. Ask Alex for a new one.");
    expect(joinFailureMessage("self", "Alex")).toBe("This is your own invite link.");
    expect(joinFailureMessage("invalid", "Alex")).toBe(
      "This invite link isn't valid. Ask your training partner to send it again.",
    );
    expect(joinFailureMessage("brand_new_code", "Alex")).toBe("Something went wrong opening this invite. Try again.");
    expect(inviteSignupBanner("challenge", "Alex")).toBe("Alex challenged you. Create your account to accept.");
    expect(inviteSignupBanner("join", "Alex")).toBe("Alex invited you. Create your account to join.");
  });
});
