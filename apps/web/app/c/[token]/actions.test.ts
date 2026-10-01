// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { delete: vi.fn(), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

const rpc = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, auth: { signOut } }),
}));

import { acceptJoinAction, claimInviteAction, signOutKeepInviteAction } from "./actions";

const TOKEN = "e2eChallengeTokenAAAAA";
const ACCEPT = `/c/${TOKEN}`;
const ALEX = {
  athlete_id: "a",
  first_name: "Alex",
  last_initial: "R",
  display_name: "Alex R",
  avatar_url: null,
  current_elo: 1482,
  weight_lbs: 172,
};

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  rpc.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  cookieStore.delete.mockReset();
  cookieStore.set.mockReset();
});

describe("claimInviteAction", () => {
  it("claims on web as landing_web and books without writing cookies (a write would re-render the page)", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        result: "booked",
        invite_id: "i",
        challenge_id: "c",
        match_id: null,
        booking_expires_at: null,
        inviter: ALEX,
        start_blocked_reason: "no_location",
      },
      error: null,
    });
    const outcome = await claimInviteAction(TOKEN);
    expect(rpc).toHaveBeenCalledWith("claim_challenge_invite", {
      p_token: TOKEN,
      p_gateway: "landing_web",
      p_platform: "web",
    });
    expect(outcome).toMatchObject({ kind: "booked" });
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("returns a retryable outcome on a supabase {error} and keeps the cookie", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "fetch failed", code: "", hint: "" } });
    const outcome = await claimInviteAction(TOKEN);
    expect(outcome).toMatchObject({ kind: "retry", body: "We couldn't reach ELO RATED. Check your connection and try again." });
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("sends a signed-out caller to log in and come back", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "no", hint: "not_authenticated" } });
    expect(await redirectOf(claimInviteAction(TOKEN))).toBe(`/login?next=${encodeURIComponent(ACCEPT)}`);
  });

  it("sends a pending athlete to finish setup and come back", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "claimer_not_active", inviter: ALEX }, error: null });
    expect(await redirectOf(claimInviteAction(TOKEN))).toBe(`/eua?next=${encodeURIComponent(ACCEPT)}`);
  });

  it("refuses a malformed token without calling the RPC", async () => {
    expect(await claimInviteAction("nope")).toMatchObject({ kind: "error", title: "Link not valid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("acceptJoinAction", () => {
  it("becomes friends", async () => {
    rpc.mockResolvedValue({ data: { ok: true, result: "friends", inviter: ALEX }, error: null });
    const outcome = await acceptJoinAction(TOKEN, "Alex");
    expect(rpc).toHaveBeenCalledWith("accept_join_invite", {
      p_token: TOKEN,
      p_gateway: "landing_web",
      p_platform: "web",
    });
    expect(outcome).toMatchObject({ kind: "friends", title: "You're friends" });
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("returns a retryable outcome on a supabase {error}", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await acceptJoinAction(TOKEN, "Alex")).toMatchObject({ kind: "retry" });
  });

  it("sends a signed-out caller to log in", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "no", hint: "not_authenticated" } });
    expect(await redirectOf(acceptJoinAction(TOKEN, null))).toBe(`/login?next=${encodeURIComponent(ACCEPT)}`);
  });
});

describe("signOutKeepInviteAction", () => {
  it("signs out, keeps the pending token and returns to the landing page", async () => {
    expect(await redirectOf(signOutKeepInviteAction(TOKEN))).toBe(ACCEPT);
    expect(signOut).toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledWith("er_invite", TOKEN, expect.objectContaining({ httpOnly: true, maxAge: 604_800 }));
  });
});
