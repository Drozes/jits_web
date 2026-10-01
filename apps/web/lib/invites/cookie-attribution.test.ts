import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getInvitePreview = vi.fn();
vi.mock("./preview", () => ({ getInvitePreview: (t: string) => getInvitePreview(t) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { attributeInviteCookie } from "./cookie-attribution";

const TOKEN = "e2eChallengeTokenAAAAA";
const INVITER = { first_name: "Alex", last_initial: "R", avatar_url: null, current_elo: 1482, weight_lbs: 172 };

function client(rpc: { data: unknown; error: unknown }) {
  const fn = vi.fn().mockResolvedValue(rpc);
  return { client: { rpc: fn } as unknown as SupabaseClient, rpc: fn };
}

describe("attributeInviteCookie", () => {
  beforeEach(() => getInvitePreview.mockReset());

  it("does nothing without a cookie", async () => {
    const { client: c, rpc } = client({ data: null, error: null });
    expect(await attributeInviteCookie(c, undefined)).toEqual({ clear: false, acceptPath: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears a malformed cookie without calling the RPC", async () => {
    const { client: c, rpc } = client({ data: null, error: null });
    expect(await attributeInviteCookie(c, "nope")).toEqual({ clear: true, acceptPath: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("attributes as landing_web on web and sends an open challenge back to accept", async () => {
    const { client: c, rpc } = client({ data: { ok: true, result: "attributed" }, error: null });
    getInvitePreview.mockResolvedValue({ state: "open", kind: "challenge", inviter: INVITER, short_code_display: null });
    expect(await attributeInviteCookie(c, TOKEN)).toEqual({ clear: true, acceptPath: `/c/${TOKEN}`, recorded: true });
    expect(rpc).toHaveBeenCalledWith("record_invite_attribution", {
      p_token: TOKEN,
      p_gateway: "landing_web",
      p_platform: "web",
    });
  });

  it("clears a join invite without redirecting", async () => {
    const { client: c } = client({ data: { ok: true, result: "existing_user" }, error: null });
    getInvitePreview.mockResolvedValue({ state: "open", kind: "join", inviter: INVITER, short_code_display: null });
    expect(await attributeInviteCookie(c, TOKEN)).toEqual({ clear: true, acceptPath: null, recorded: true });
  });

  it("clears an invalid or self result", async () => {
    for (const result of ["invalid", "self"]) {
      const { client: c } = client({ data: { ok: true, result }, error: null });
      expect(await attributeInviteCookie(c, TOKEN)).toEqual({ clear: true, acceptPath: null });
    }
    expect(getInvitePreview).not.toHaveBeenCalled();
  });

  it("keeps the cookie on an RPC error so the next request retries", async () => {
    const { client: c } = client({ data: null, error: { message: "boom" } });
    expect(await attributeInviteCookie(c, TOKEN)).toEqual({ clear: false, acceptPath: null });
  });

  it("skips the RPC when the marker says the token was already recorded", async () => {
    const { client: c, rpc } = client({ data: null, error: null });
    getInvitePreview.mockResolvedValue({ state: "open", kind: "challenge", inviter: INVITER, short_code_display: null });
    expect(await attributeInviteCookie(c, TOKEN, { alreadyRecorded: true })).toEqual({
      clear: true,
      acceptPath: `/c/${TOKEN}`,
      recorded: true,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
