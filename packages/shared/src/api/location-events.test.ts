import { describe, expect, it, vi } from "vitest";
import { getMyLookingForRanked, logLocationEvent } from "./location";

function rpcClient(result: { data: unknown; error: unknown } | Error) {
  const rpc = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  return { supabase: { rpc } as never, rpc };
}

describe("logLocationEvent", () => {
  it("maps a go_live_attempt with a reading to the RPC arguments", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, logged: true }, error: null });
    const at = new Date("2026-10-02T12:00:00.000Z");
    const r = await logLocationEvent(supabase, {
      event: "go_live_attempt",
      outcome: "ok",
      reading: { lat: 43.65, lng: -79.38, accuracyM: 12.4 },
      matchId: "ignored-for-go-live",
      appVersion: "  0.5.0 (25) ota:9287a1e5  ",
      occurredAt: at,
    });
    expect(r).toEqual({ ok: true, data: { logged: true } });
    expect(rpc).toHaveBeenCalledWith("log_location_event", {
      p_event: "go_live_attempt",
      p_outcome: "ok",
      p_lat: 43.65,
      p_lng: -79.38,
      p_accuracy_m: 12.4,
      p_match_id: null,
      p_app_version: "0.5.0 (25) ota:9287a1e5",
      p_occurred_at: "2026-10-02T12:00:00.000Z",
    });
  });

  it("sends match_start with its match id and no reading as nulls", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, logged: false }, error: null });
    const r = await logLocationEvent(supabase, { event: "match_start", outcome: "permission_denied", matchId: "m-1" });
    expect(r).toEqual({ ok: true, data: { logged: false } });
    expect(rpc).toHaveBeenCalledWith("log_location_event", {
      p_event: "match_start",
      p_outcome: "permission_denied",
      p_lat: null,
      p_lng: null,
      p_accuracy_m: null,
      p_match_id: "m-1",
      p_app_version: null,
      p_occurred_at: null,
    });
  });

  it("truncates the app version to 32 characters and drops an empty one", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, logged: true }, error: null });
    await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "dismissed", appVersion: "x".repeat(40) });
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_app_version: "x".repeat(32) });
    await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "dismissed", appVersion: "   " });
    expect((rpc.mock.calls[1] as unknown[])[1]).toMatchObject({ p_app_version: null });
  });

  it("drops a non-finite coordinate pair and an invalid date instead of sending them", async () => {
    const { supabase, rpc } = rpcClient({ data: { ok: true, logged: true }, error: null });
    await logLocationEvent(supabase, {
      event: "go_live_attempt",
      outcome: "error",
      reading: { lat: Number.NaN, lng: 1, accuracyM: 5 },
      occurredAt: new Date("nope"),
    });
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_lat: null, p_lng: null, p_accuracy_m: null, p_occurred_at: null });
  });

  it("returns an error Result for a RAISE and never throws", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "Invalid arguments", hint: "invalid_arguments" } });
    const r = await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "ok" });
    expect(r).toEqual({ ok: false, error: { hint: "invalid_arguments", message: "Invalid arguments" } });
  });

  it("returns an error Result when the client rejects (network)", async () => {
    const { supabase } = rpcClient(new Error("offline"));
    const r = await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "ok" });
    expect(r).toEqual({ ok: false, error: { hint: "unknown", message: "offline" } });
  });

  it("reports a missing RPC (older backend) as rpc_missing", async () => {
    const { supabase } = rpcClient({ data: null, error: { message: "not found", code: "PGRST202" } });
    const r = await logLocationEvent(supabase, { event: "go_live_attempt", outcome: "ok" });
    expect(r).toEqual({ ok: false, error: { hint: "rpc_missing", message: "not found", code: "PGRST202" } });
  });
});

describe("getMyLookingForRanked", () => {
  function client(result: { data: unknown; error: unknown } | Error) {
    const eq = vi.fn(() => ({
      maybeSingle: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
    }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { supabase: { from } as never, from, select, eq };
  }

  it("reads the caller's own flag", async () => {
    const c = client({ data: { looking_for_ranked: true }, error: null });
    expect(await getMyLookingForRanked(c.supabase, "me")).toBe(true);
    expect(c.from).toHaveBeenCalledWith("athletes");
    expect(c.select).toHaveBeenCalledWith("looking_for_ranked");
    expect(c.eq).toHaveBeenCalledWith("id", "me");
  });

  it("false when the server cleared it", async () => {
    expect(await getMyLookingForRanked(client({ data: { looking_for_ranked: false }, error: null }).supabase, "me")).toBe(false);
  });

  it("null (unknown, never false) on an error, a missing row or a throw", async () => {
    expect(await getMyLookingForRanked(client({ data: null, error: { message: "x" } }).supabase, "me")).toBeNull();
    expect(await getMyLookingForRanked(client({ data: null, error: null }).supabase, "me")).toBeNull();
    expect(await getMyLookingForRanked(client(new Error("offline")).supabase, "me")).toBeNull();
  });
});
