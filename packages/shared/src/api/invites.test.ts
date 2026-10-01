import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptJoinInvite, claimChallengeInvite, createInvite, listMyOpenChallengeInvites, parseClaimResult, readInvitesEnabled } from "./invites";
import { getMyFriends, parseFriends, sortFriendsFirst } from "./friends";

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { supabase: { rpc } as unknown as SupabaseClient<never>, rpc };
}

const inviter = {
  athlete_id: "a1",
  first_name: "Alex",
  last_initial: "R",
  display_name: "Alex R",
  avatar_url: null,
  current_elo: 1482,
  weight_lbs: 172,
};

describe("claimChallengeInvite", () => {
  it("passes the reading and returns a started claim", async () => {
    const { supabase, rpc } = client({
      data: {
        ok: true,
        result: "started",
        invite_id: "i1",
        challenge_id: "c1",
        match_id: "m1",
        booking_expires_at: null,
        inviter,
        proximity: { verdict: "passed", reason: null, distance_m: 12 },
        start_blocked_reason: null,
      },
      error: null,
    });
    const res = await claimChallengeInvite(supabase as never, { token: "t", gateway: "universal_link" }, {
      lat: 43.6,
      lng: -79.4,
      accuracyM: 20,
    });
    expect(rpc).toHaveBeenCalledWith("claim_challenge_invite", expect.objectContaining({
      p_token: "t",
      p_code: null,
      p_platform: "ios",
      p_lat: 43.6,
      p_lng: -79.4,
      p_accuracy_m: 20,
    }));
    expect(res.ok && res.data.ok && res.data.result === "started" && res.data.match_id).toBe("m1");
  });

  it("a returned failure is data, not an error, and keeps the inviter", async () => {
    const { supabase } = client({ data: { ok: false, code: "expired", inviter, attempts_left: null }, error: null });
    const res = await claimChallengeInvite(supabase as never, { code: "K7Q4M2", gateway: "code" }, null);
    expect(res.ok).toBe(true);
    if (res.ok && !res.data.ok) {
      expect(res.data.code).toBe("expired");
      expect(res.data.inviter?.first_name).toBe("Alex");
    }
  });

  it("surfaces the RAISE hint on error (supabase-js resolves, never rejects)", async () => {
    const { supabase } = client({ data: null, error: { message: "bad", hint: "invalid_arguments" } });
    const res = await claimChallengeInvite(supabase as never, { gateway: "paste" }, null);
    expect(res).toEqual({ ok: false, error: { hint: "invalid_arguments", message: "bad" } });
  });
});

describe("createInvite", () => {
  it("maps limit hints", async () => {
    const { supabase } = client({ data: null, error: { message: "x", hint: "daily_invite_limit" } });
    const res = await createInvite(supabase as never, "arena");
    expect(!res.ok && res.error.hint).toBe("daily_invite_limit");
  });
  it("reports an unusable payload instead of passing it on", async () => {
    const { supabase } = client({ data: { nope: true }, error: null });
    const res = await createInvite(supabase as never);
    expect(!res.ok && res.error.hint).toBe("unknown");
  });
});

describe("parseClaimResult", () => {
  it("rejects shapes that are not a claim", () => {
    expect(parseClaimResult(null)).toBeNull();
    expect(parseClaimResult({ ok: true, result: "weird", challenge_id: "c" })).toBeNull();
    expect(parseClaimResult({ ok: true, result: "booked" })).toBeNull();
  });
});

describe("friends", () => {
  it("sorts live first, then by name, and drops malformed rows", () => {
    const list = parseFriends([
      { athlete_id: "b", display_name: "Bea", is_live: false },
      { display_name: "no id" },
      { athlete_id: "c", display_name: "Cal", is_live: true },
      { athlete_id: "a", display_name: "Abe", is_live: false },
    ]);
    expect(list?.map((f) => f.athlete_id)).toEqual(["c", "a", "b"]);
  });
  it("returns an error result when the rpc fails", async () => {
    const { supabase } = client({ data: null, error: { message: "nope", hint: "not_authenticated" } });
    const res = await getMyFriends(supabase as never);
    expect(!res.ok && res.error.hint).toBe("not_authenticated");
  });
  it("sortFriendsFirst is a stable partition", () => {
    const out = sortFriendsFirst(["a", "b", "c", "d"], (x) => x, new Set(["c", "a"]));
    expect(out).toEqual(["a", "c", "b", "d"]);
  });
});

function fromClient(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt"]) {
    q[m] = (...a: unknown[]) => {
      calls.push([m, ...a]);
      return q;
    };
  }
  q.order = (...a: unknown[]) => {
    calls.push(["order", ...a]);
    return Promise.resolve(result);
  };
  q.maybeSingle = () => Promise.resolve(result);
  const from = vi.fn(() => q);
  return { supabase: { from } as unknown as SupabaseClient<never>, from, calls };
}

describe("readInvitesEnabled", () => {
  it("is null on an error (retryable), false for a missing row, true when on", async () => {
    expect(await readInvitesEnabled(fromClient({ data: null, error: { message: "offline" } }).supabase)).toBeNull();
    expect(await readInvitesEnabled(fromClient({ data: null, error: null }).supabase)).toBe(false);
    expect(await readInvitesEnabled(fromClient({ data: { enabled: true }, error: null }).supabase)).toBe(true);
  });
});

describe("listMyOpenChallengeInvites", () => {
  it("reads my open, unexpired challenge invites newest first", async () => {
    const row = { id: "i1", short_code: "K7Q4M2", code_expires_at: null, link_expires_at: "x", created_at: "y" };
    const { supabase, from, calls } = fromClient({ data: [row], error: null });
    const now = new Date("2026-10-01T12:00:00Z");
    const res = await listMyOpenChallengeInvites(supabase, "me", now);
    expect(res).toEqual({ ok: true, data: [row] });
    expect(from).toHaveBeenCalledWith("invites");
    expect(calls).toContainEqual(["eq", "inviter_id", "me"]);
    expect(calls).toContainEqual(["eq", "kind", "challenge"]);
    expect(calls).toContainEqual(["eq", "status", "open"]);
    expect(calls).toContainEqual(["gt", "link_expires_at", now.toISOString()]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("returns the error instead of throwing", async () => {
    const res = await listMyOpenChallengeInvites(fromClient({ data: null, error: { message: "nope" } }).supabase, "me");
    expect(res.ok).toBe(false);
  });
});

describe("acceptJoinInvite", () => {
  it("passes the gateway and platform for attribution", async () => {
    const { supabase, rpc } = client({ data: { ok: true, result: "friends", inviter }, error: null });
    const res = await acceptJoinInvite(supabase as never, "t", { gateway: "qr", platform: "ios" });
    expect(rpc).toHaveBeenCalledWith("accept_join_invite", { p_token: "t", p_gateway: "qr", p_platform: "ios" });
    expect(res.ok && res.data.ok && res.data.result).toBe("friends");
  });

  it("sends only the token when no gateway is given (server defaults)", async () => {
    const { supabase, rpc } = client({ data: { ok: false, code: "invalid" }, error: null });
    await acceptJoinInvite(supabase as never, "t");
    expect(rpc).toHaveBeenCalledWith("accept_join_invite", { p_token: "t" });
  });
});
