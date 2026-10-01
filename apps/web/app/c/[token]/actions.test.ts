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
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, auth: { signOut, getUser } }),
}));
const getCurrentAthlete = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({ getCurrentAthlete: (...a: unknown[]) => getCurrentAthlete(...a) }));
const setMyDateOfBirth = vi.fn();
vi.mock("@jits/shared/api/invites", () => ({ setMyDateOfBirth: (...a: unknown[]) => setMyDateOfBirth(...a) }));

import { acceptJoinAction, claimInviteAction, confirmDobAndClaimAction, signOutKeepInviteAction } from "./actions";

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
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  getCurrentAthlete.mockReset().mockResolvedValue({ id: "me", status: "active" });
  setMyDateOfBirth.mockReset().mockResolvedValue({ ok: true, data: { date_of_birth: "1990-05-01" } });
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

describe("confirmDobAndClaimAction (dob_required)", () => {
  const BOOKED = {
    ok: true,
    result: "booked",
    invite_id: "i",
    challenge_id: "c",
    match_id: null,
    booking_expires_at: null,
    inviter: ALEX,
    start_blocked_reason: "no_location",
  };

  it("a claim with no date of birth asks for it (never the underage copy)", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "dob_required", inviter: ALEX }, error: null });
    const outcome = await claimInviteAction(TOKEN);
    expect(outcome).toEqual({
      kind: "dob",
      title: "Confirm your date of birth",
      body: "We need your date of birth before your first match. You must be 16 or older.",
      error: null,
    });
  });

  it("saves my date of birth, then retries the same claim and books", async () => {
    rpc.mockResolvedValue({ data: BOOKED, error: null });
    const outcome = await confirmDobAndClaimAction(TOKEN, "1990-05-01");
    expect(setMyDateOfBirth).toHaveBeenCalledWith(expect.anything(), "me", "1990-05-01");
    expect(rpc).toHaveBeenCalledWith("claim_challenge_invite", {
      p_token: TOKEN,
      p_gateway: "landing_web",
      p_platform: "web",
    });
    expect(outcome).toMatchObject({ kind: "booked" });
  });

  it("a date under 16 stays on the step with the underage copy, never saved or claimed", async () => {
    const outcome = await confirmDobAndClaimAction(TOKEN, "2015-01-01");
    expect(outcome).toEqual({
      kind: "dob",
      title: "Confirm your date of birth",
      body: "We need your date of birth before your first match. You must be 16 or older.",
      error: "You must be 16 or older to compete on ELO RATED.",
    });
    expect(setMyDateOfBirth).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("trims padded input once and saves the trimmed date", async () => {
    rpc.mockResolvedValue({ data: BOOKED, error: null });
    const outcome = await confirmDobAndClaimAction(TOKEN, "  1990-05-01 ");
    expect(setMyDateOfBirth).toHaveBeenCalledWith(expect.anything(), "me", "1990-05-01");
    expect(outcome).toMatchObject({ kind: "booked" });
  });

  it("a date that is not real stays on the step without saving or claiming", async () => {
    const outcome = await confirmDobAndClaimAction(TOKEN, "2999-01-01");
    expect(outcome).toMatchObject({ kind: "dob", error: "Enter a real date of birth." });
    expect(setMyDateOfBirth).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failed save stays on the step with a retry message and does not claim", async () => {
    setMyDateOfBirth.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
    const outcome = await confirmDobAndClaimAction(TOKEN, "1990-05-01");
    expect(outcome).toMatchObject({
      kind: "dob",
      error: "Couldn't save your date of birth. Check your connection and try again.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a signed-out caller to log in and come back", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await redirectOf(confirmDobAndClaimAction(TOKEN, "1990-05-01"))).toBe(`/login?next=${encodeURIComponent(ACCEPT)}`);
  });

  it("refuses a malformed token", async () => {
    expect(await confirmDobAndClaimAction("nope", "1990-05-01")).toMatchObject({ kind: "error", title: "Link not valid" });
    expect(setMyDateOfBirth).not.toHaveBeenCalled();
  });
});
