import { describe, expect, it } from "vitest";
import { planCallbackInvite, planInviteCookie } from "./cookie-plan";

const ACCEPT = "/c/e2eChallengeTokenAAAAA";
const OPEN_CHALLENGE = { clear: true, acceptPath: ACCEPT };
const JOIN = { clear: true, acceptPath: null };
const TRANSIENT = { clear: false, acceptPath: null };

describe("planInviteCookie", () => {
  it.each(["/eua", "/signup", "/login", "/confirm", "/update-password", "/forgot-password", "/eua/step"])(
    "keeps an open challenge's cookie on setup page %s, without redirecting",
    (path) => {
      expect(planInviteCookie(OPEN_CHALLENGE, path)).toEqual({ redirectTo: null, clear: false });
    },
  );

  it("redirects an open challenge once from an ordinary page and clears the cookie", () => {
    expect(planInviteCookie(OPEN_CHALLENGE, "/")).toEqual({ redirectTo: ACCEPT, clear: true });
    expect(planInviteCookie(OPEN_CHALLENGE, "/arena")).toEqual({ redirectTo: ACCEPT, clear: true });
  });

  it("clears a join or closed invite anywhere without redirecting", () => {
    expect(planInviteCookie(JOIN, "/eua")).toEqual({ redirectTo: null, clear: true });
    expect(planInviteCookie(JOIN, "/")).toEqual({ redirectTo: null, clear: true });
  });

  it("keeps the cookie on a transient error", () => {
    expect(planInviteCookie(TRANSIENT, "/")).toEqual({ redirectTo: null, clear: false });
  });
});

describe("planCallbackInvite", () => {
  it("sends an open challenge to accept when next is the default and clears", () => {
    expect(planCallbackInvite(OPEN_CHALLENGE, "/")).toEqual({ target: ACCEPT, redirectTo: ACCEPT, clear: true });
  });

  it("honours an explicit next and clears when it already is the landing page", () => {
    expect(planCallbackInvite(OPEN_CHALLENGE, ACCEPT)).toMatchObject({ target: ACCEPT, clear: true });
  });

  it("keeps the cookie when next goes elsewhere, so a later page redirects once", () => {
    expect(planCallbackInvite(OPEN_CHALLENGE, "/eua")).toMatchObject({ target: "/eua", clear: false });
  });

  it("follows the decision for join and transient results", () => {
    expect(planCallbackInvite(JOIN, "/")).toMatchObject({ target: "/", clear: true });
    expect(planCallbackInvite(TRANSIENT, "/")).toMatchObject({ target: "/", clear: false });
  });
});
