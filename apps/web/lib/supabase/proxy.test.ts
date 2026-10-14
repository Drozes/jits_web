// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("../utils", () => ({ hasEnvVars: true }));

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => {
    // Simulate a token refresh writing a session cookie.
    opts.cookies.setAll([{ name: "sb-refreshed", value: "1", options: { path: "/" } }]);
    return { auth: { getClaims } };
  },
}));

const attributeInviteCookie = vi.fn();
vi.mock("../invites/cookie-attribution", () => ({
  attributeInviteCookie: (...a: unknown[]) => attributeInviteCookie(...a),
}));

const applyLandingSideEffects = vi.fn();
vi.mock("../invites/landing-proxy", async (orig) => ({
  ...(await orig<typeof import("../invites/landing-proxy")>()),
  applyLandingSideEffects: (...a: unknown[]) => applyLandingSideEffects(...a),
}));

import { updateSession } from "./proxy";

const TOKEN = "e2eChallengeTokenAAAAA";
const ACCEPT = `/c/${TOKEN}`;

function req(path: string, init: { method?: string; headers?: Record<string, string>; invite?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.invite !== false) headers.set("cookie", `er_invite=${TOKEN}`);
  return new NextRequest(new URL(path, "https://elorated.test"), { method: init.method ?? "GET", headers });
}

function inviteCookieCleared(res: Response): boolean {
  return (res.headers.getSetCookie?.() ?? []).some((c) => c.startsWith("er_invite=;") || /^er_invite=.*Max-Age=0/i.test(c) || /^er_invite=.*Expires=Thu, 01 Jan 1970/i.test(c));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateSession invite cookie branch", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u1" } } });
    attributeInviteCookie.mockReset().mockResolvedValue({ clear: true, acceptPath: ACCEPT });
    applyLandingSideEffects.mockReset();
  });

  it("redirects an open challenge from / once, clears the cookie and keeps refreshed session cookies", async () => {
    const res = await updateSession(req("/?x=1"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(ACCEPT);
    expect(new URL(res.headers.get("location")!).search).toBe("");
    expect(inviteCookieCleared(res)).toBe(true);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sb-refreshed=1"))).toBe(true);
  });

  it("attributes on /eua but neither redirects nor clears the cookie", async () => {
    const res = await updateSession(req("/eua"));
    expect(attributeInviteCookie).toHaveBeenCalledOnce();
    expect(res.headers.get("location")).toBeNull();
    expect(inviteCookieCleared(res)).toBe(false);
  });

  it("clears a join invite on a setup page", async () => {
    attributeInviteCookie.mockResolvedValue({ clear: true, acceptPath: null });
    const res = await updateSession(req("/signup"));
    expect(res.headers.get("location")).toBeNull();
    expect(inviteCookieCleared(res)).toBe(true);
  });

  it.each([
    ["router prefetch", { "next-router-prefetch": "1" }],
    ["speculation prefetch", { "sec-purpose": "prefetch;prerender" }],
    ["legacy purpose", { purpose: "prefetch" }],
  ])("skips a %s", async (_label, headers) => {
    const res = await updateSession(req("/", { headers }));
    expect(attributeInviteCookie).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["/api/invite-events", "/auth/callback", "/.well-known/apple-app-site-association", "/_next/data/x"])(
    "does not consume the cookie on %s",
    async (path) => {
      await updateSession(req(path));
      expect(attributeInviteCookie).not.toHaveBeenCalled();
    },
  );

  it("does not consume the cookie on a POST", async () => {
    await updateSession(req("/", { method: "POST" }));
    expect(attributeInviteCookie).not.toHaveBeenCalled();
  });

  it("does not consume the cookie when signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    await updateSession(req("/terms"));
    expect(attributeInviteCookie).not.toHaveBeenCalled();
  });

  it("keeps the cookie on a transient attribution error", async () => {
    attributeInviteCookie.mockResolvedValue({ clear: false, acceptPath: null });
    const res = await updateSession(req("/"));
    expect(res.headers.get("location")).toBeNull();
    expect(inviteCookieCleared(res)).toBe(false);
  });

  it("routes a landing GET to the landing side effects with no-store, not the cookie branch", async () => {
    const res = await updateSession(req(ACCEPT));
    expect(applyLandingSideEffects).toHaveBeenCalledOnce();
    expect(attributeInviteCookie).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

function rewritePath(res: Response): URL | null {
  const raw = res.headers.get("x-middleware-rewrite");
  return raw ? new URL(raw) : null;
}

describe("web app locked (flag unset)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "");
    getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u1" } } });
    attributeInviteCookie.mockReset().mockResolvedValue({ clear: true, acceptPath: ACCEPT });
    applyLandingSideEffects.mockReset();
  });

  it.each([
    ["signed out", false],
    ["signed in", true],
  ])("rewrites / to the landing when %s, with no Supabase call", async (_label, invite) => {
    const res = await updateSession(req("/", { invite }));
    expect(rewritePath(res)?.pathname).toBe("/welcome");
    expect(res.headers.get("location")).toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
    expect(attributeInviteCookie).not.toHaveBeenCalled();
  });

  it("keeps the query string on the landing rewrite", async () => {
    const res = await updateSession(req("/?utm_source=x"));
    expect(rewritePath(res)?.search).toBe("?utm_source=x");
  });

  it.each([
    "/login",
    "/signup",
    "/eua",
    "/arena",
    "/athlete/a1",
    "/matches/m1",
    "/settings",
    "/design/board",
    "/api/version",
    "/welcome",
    "/unknown",
  ])("redirects %s to / and drops the query", async (path) => {
    const res = await updateSession(req(`${path}?next=/arena`));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("runs the invite landing side effects on /c/<token>", async () => {
    await updateSession(req(ACCEPT));
    expect(applyLandingSideEffects).toHaveBeenCalledOnce();
  });

  it.each(["/terms", "/support", "/forgot-password"])("serves %s signed out", async (path) => {
    getClaims.mockResolvedValue({ data: null });
    const res = await updateSession(req(path, { invite: false }));
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["/robots.txt", "/sw.js", "/manifest.webmanifest"])("serves the root file %s with no session work", async (path) => {
    getClaims.mockResolvedValue({ data: null });
    const res = await updateSession(req(path, { invite: false }));
    expect(res.headers.get("location")).toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("still sends a signed-in visitor with an open challenge cookie from /terms to the invite", async () => {
    const res = await updateSession(req("/terms"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(ACCEPT);
  });
});

describe('web app unlocked (flag "true")', () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WEB_APP_ENABLED", "true");
    getClaims.mockReset().mockResolvedValue({ data: null });
    attributeInviteCookie.mockReset();
    applyLandingSideEffects.mockReset();
  });

  it("does not rewrite / and runs the session check", async () => {
    const res = await updateSession(req("/", { invite: false }));
    expect(rewritePath(res)).toBeNull();
    expect(getClaims).toHaveBeenCalled();
  });

  it("serves /arena to a signed-in athlete", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
    const res = await updateSession(req("/arena", { invite: false }));
    expect(res.headers.get("location")).toBeNull();
    expect(rewritePath(res)).toBeNull();
  });

  it("sends a signed-out /arena to /login", async () => {
    const res = await updateSession(req("/arena", { invite: false }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects /welcome to /", async () => {
    const res = await updateSession(req("/welcome", { invite: false }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("serves /support signed out", async () => {
    const res = await updateSession(req("/support", { invite: false }));
    expect(res.headers.get("location")).toBeNull();
  });
});
