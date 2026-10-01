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

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { applyLandingSideEffects, landingToken } from "./landing-proxy";

const TOKEN = "e2eChallengeTokenAAAAA";
const INVITER = { first_name: "Alex", last_initial: "R", avatar_url: null, current_elo: 1482, weight_lbs: 172 };

const rpc = vi.fn();
const SIGNED_IN = { rpc: (...a: unknown[]) => rpc(...a) } as unknown as SupabaseClient;

function req(headers: Record<string, string> = { "sec-fetch-dest": "document" }) {
  return new NextRequest(new URL(`/c/${TOKEN}`, "https://elorated.test"), { headers });
}

describe("applyLandingSideEffects", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { ok: true, result: "attributed" }, error: null });
    afterFn.mockReset().mockImplementation((cb: () => unknown) => cb());
    logLandingEvent.mockReset().mockResolvedValue(undefined);
    getInvitePreview.mockReset().mockResolvedValue({ state: "open", kind: "challenge", inviter: INVITER, short_code_display: null });
  });

  it("sets the cookie for a signed-out open and logs the view after the response", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req(), res, TOKEN, null);
    expect(res.cookies.get("er_invite")?.value).toBe(TOKEN);
    expect(afterFn).toHaveBeenCalledOnce();
    expect(logLandingEvent).toHaveBeenCalledWith(TOKEN, "landing_viewed", { in_app_browser: null, kind: "challenge" });
  });

  it("does not count a client-side navigation (fetch, not document) as a view", async () => {
    await applyLandingSideEffects(req({ "sec-fetch-dest": "empty" }), NextResponse.next(), TOKEN, null);
    expect(logLandingEvent).not.toHaveBeenCalled();
  });

  it("counts a request without fetch metadata (older clients)", async () => {
    await applyLandingSideEffects(req({}), NextResponse.next(), TOKEN, null);
    expect(logLandingEvent).toHaveBeenCalledOnce();
  });

  it("records the attribution, then consumes the pending cookie, when a signed-in athlete arrives", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ "sec-fetch-dest": "document", cookie: `er_invite=${TOKEN}` }), res, TOKEN, SIGNED_IN);
    expect(rpc).toHaveBeenCalledWith("record_invite_attribution", {
      p_token: TOKEN,
      p_gateway: "landing_web",
      p_platform: "web",
    });
    expect(res.cookies.get("er_invite")?.value).toBe("");
  });

  it("skips the RPC when the marker says this token is already recorded", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(
      req({ cookie: `er_invite=${TOKEN}; er_invite_attr=${TOKEN}` }),
      res,
      TOKEN,
      SIGNED_IN,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(res.cookies.get("er_invite")?.value).toBe("");
    expect(res.cookies.get("er_invite_attr")?.value).toBe("");
  });

  it("keeps the cookie when the attribution RPC fails, so a later request retries", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ cookie: `er_invite=${TOKEN}` }), res, TOKEN, SIGNED_IN);
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });

  it("does not call the RPC for a signed-in viewer without this token pending", async () => {
    await applyLandingSideEffects(req(), NextResponse.next(), TOKEN, SIGNED_IN);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves a different pending invite alone", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ cookie: "er_invite=otherTokenAAAAAAAAAAAA" }), res, TOKEN, SIGNED_IN);
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });

  it("ignores prefetches entirely", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req({ "sec-purpose": "prefetch" }), res, TOKEN, null);
    expect(getInvitePreview).not.toHaveBeenCalled();
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });

  it("sets no cookie for a signed-in viewer", async () => {
    const res = NextResponse.next();
    await applyLandingSideEffects(req(), res, TOKEN, SIGNED_IN);
    expect(res.cookies.get("er_invite")).toBeUndefined();
  });
});

describe("landingToken", () => {
  const get = (path: string) => new NextRequest(new URL(path, "https://elorated.test"));

  it("decodes the token segment", () => {
    expect(landingToken(get(`/c/${TOKEN}`))).toBe(TOKEN);
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(() => landingToken(get("/c/%E0%A4%A"))).not.toThrow();
    expect(landingToken(get("/c/%E0%A4%A"))).toBe("%E0%A4%A");
  });

  it("ignores other paths and methods", () => {
    expect(landingToken(get("/c/a/b"))).toBeNull();
    expect(landingToken(new NextRequest(new URL(`/c/${TOKEN}`, "https://elorated.test"), { method: "POST" }))).toBeNull();
  });
});
