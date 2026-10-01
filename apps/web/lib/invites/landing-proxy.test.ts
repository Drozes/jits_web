// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const afterFn = vi.fn();
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => afterFn(cb),
}));
const getInvitePreview = vi.fn();
vi.mock("./preview", () => ({ getInvitePreview: (t: string) => getInvitePreview(t) }));
const logLandingEvent = vi.fn();
vi.mock("./landing-events", () => ({ logLandingEvent: (...a: unknown[]) => logLandingEvent(...a) }));

import { NextRequest, NextResponse } from "next/server";
import { applyLandingSideEffects } from "./landing-proxy";

const TOKEN = "e2eChallengeTokenAAAAA";
const INVITER = { first_name: "Alex", last_initial: "R", avatar_url: null, current_elo: 1482, weight_lbs: 172 };

function req(headers: Record<string, string> = { "sec-fetch-dest": "document" }) {
  return new NextRequest(new URL(`/c/${TOKEN}`, "https://elorated.test"), { headers });
}

describe("applyLandingSideEffects", () => {
  beforeEach(() => {
    afterFn.mockReset().mockImplementation((cb: () => unknown) => cb());
    logLandingEvent.mockReset().mockResolvedValue(undefined);
    getInvitePreview.mockReset().mockResolvedValue({ state: "open", kind: "challenge", inviter: INVITER, short_code_display: null });
  });

  it("sets the cookie for a signed-out open and logs the view after the response", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req(), res, TOKEN, false);
    expect(res.cookies.get("er_invite")?.value).toBe(TOKEN);
    expect(afterFn).toHaveBeenCalledOnce();
    expect(logLandingEvent).toHaveBeenCalledWith(TOKEN, "landing_viewed", { in_app_browser: null, kind: "challenge" });
  });

  it("does not count a client-side navigation (fetch, not document) as a view", async () => {
    await applyLandingSideEffects(req({ "sec-fetch-dest": "empty" }), NextResponse.next(), TOKEN, false);
    expect(logLandingEvent).not.toHaveBeenCalled();
  });

  it("counts a request without fetch metadata (older clients)", async () => {
    await applyLandingSideEffects(req({}), NextResponse.next(), TOKEN, false);
    expect(logLandingEvent).toHaveBeenCalledOnce();
  });

  it("consumes the pending cookie when a signed-in athlete arrives to accept", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ "sec-fetch-dest": "document", cookie: `er_invite=${TOKEN}` }), res, TOKEN, true);
    expect(res.cookies.get("er_invite")?.value).toBe("");
  });

  it("leaves a different pending invite alone", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ cookie: "er_invite=otherTokenAAAAAAAAAAAA" }), res, TOKEN, true);
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });

  it("ignores prefetches entirely", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ "sec-purpose": "prefetch" }), res, TOKEN, false);
    expect(getInvitePreview).not.toHaveBeenCalled();
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });

  it("sets no cookie for a signed-in viewer", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req(), res, TOKEN, true);
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });
});
