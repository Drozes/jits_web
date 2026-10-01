import { describe, it, expect, vi, afterEach } from "vitest";
import {
  captureAndReport,
  getBrowserReading,
  hintOf,
  isProximityHint,
  locationPermission,
  readMatchLocationRequired,
  reportMatchPresence,
} from "./match-location";

type GeoSuccess = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type GeoError = (err: { code: number }) => void;

function stubGeo(impl: (ok: GeoSuccess, fail: GeoError, opts: PositionOptions) => void) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}
const fix = (accuracy: number): GeoSuccess extends (p: infer P) => void ? P : never => ({
  coords: { latitude: 43.65, longitude: -79.38, accuracy },
});

function flagClient(result: unknown, throws = false) {
  const q = {
    select: () => q,
    eq: vi.fn(() => q),
    maybeSingle: () => (throws ? Promise.reject(new Error("net")) : Promise.resolve(result)),
  };
  return { from: vi.fn(() => q), q } as unknown as Parameters<typeof readMatchLocationRequired>[0] & {
    from: ReturnType<typeof vi.fn>;
  };
}

function rpcClient(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { rpc } as unknown as Parameters<typeof reportMatchPresence>[0] & {
    rpc: typeof rpc;
  };
}

afterEach(() => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
});

describe("readMatchLocationRequired", () => {
  it("is true only when the row is enabled", async () => {
    expect(await readMatchLocationRequired(flagClient({ data: { enabled: true }, error: null }))).toBe(true);
    expect(await readMatchLocationRequired(flagClient({ data: { enabled: false }, error: null }))).toBe(false);
  });

  it("reads the match_location_required key", async () => {
    const c = flagClient({ data: { enabled: true }, error: null });
    await readMatchLocationRequired(c);
    expect(c.from).toHaveBeenCalledWith("feature_flags");
    const q = (c as unknown as { q: { eq: ReturnType<typeof vi.fn> } }).q;
    expect(q.eq).toHaveBeenCalledWith("key", "match_location_required");
  });

  it("treats a missing row, an error and a throw as false", async () => {
    expect(await readMatchLocationRequired(flagClient({ data: null, error: null }))).toBe(false);
    expect(await readMatchLocationRequired(flagClient({ data: null, error: { message: "x" } }))).toBe(false);
    expect(await readMatchLocationRequired(flagClient(null, true))).toBe(false);
  });
});

describe("getBrowserReading", () => {
  it("asks for a fresh high-accuracy fix with a 10 s timeout", async () => {
    const geo = stubGeo((ok) => ok(fix(20)));
    const out = await getBrowserReading();
    expect(out).toEqual({ ok: true, reading: { lat: 43.65, lng: -79.38, accuracy: 20 } });
    expect(geo.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });

  it("is denied when the browser has no geolocation", async () => {
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "denied" });
  });

  it("is denied on PERMISSION_DENIED", async () => {
    stubGeo((_ok, fail) => fail({ code: 1 }));
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "denied" });
  });

  it("is an accuracy failure on timeout and on an unavailable position", async () => {
    stubGeo((_ok, fail) => fail({ code: 3 }));
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "accuracy" });
    stubGeo((_ok, fail) => fail({ code: 2 }));
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "accuracy" });
  });

  it("rejects a fix coarser than 100 m, accepts exactly 100 m", async () => {
    stubGeo((ok) => ok(fix(101)));
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "accuracy" });
    stubGeo((ok) => ok(fix(100)));
    expect((await getBrowserReading()).ok).toBe(true);
  });

  it("is denied when the call itself throws (insecure context)", async () => {
    stubGeo(() => {
      throw new Error("insecure");
    });
    expect(await getBrowserReading()).toEqual({ ok: false, failure: "denied" });
  });
});

describe("locationPermission", () => {
  it("reports the Permissions API state, unknown without it", async () => {
    expect(await locationPermission()).toBe("unknown");
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: "granted" })) },
    });
    expect(await locationPermission()).toBe("granted");
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => Promise.reject(new TypeError("no"))) },
    });
    expect(await locationPermission()).toBe("unknown");
  });
});

describe("reportMatchPresence", () => {
  const reading = { lat: 1, lng: 2, accuracy: 30 };

  it("sends the contract args for go_live (no scope)", async () => {
    const c = rpcClient({ data: { ok: true, verdict: "recorded", started: false, match_id: null }, error: null });
    expect(await reportMatchPresence(c, reading, "go_live")).toEqual({ ok: true, verdict: "recorded" });
    expect(c.rpc).toHaveBeenCalledWith("report_match_presence", {
      p_lat: 1,
      p_lng: 2,
      p_accuracy_m: 30,
      p_context: "go_live",
      p_challenge_id: null,
      p_invite_id: null,
    });
  });

  it("scopes an arena reading to the challenge", async () => {
    const c = rpcClient({ data: { ok: true, verdict: "waiting" }, error: null });
    await reportMatchPresence(c, reading, "arena", "c1");
    expect(c.rpc.mock.calls[0][1]).toMatchObject({ p_context: "arena", p_challenge_id: "c1" });
  });

  it("returns an ok:false body code, a raised HINT, and a network failure", async () => {
    expect(
      await reportMatchPresence(rpcClient({ data: { ok: false, code: "accuracy_too_low" }, error: null }), reading, "go_live"),
    ).toEqual({ ok: false, code: "accuracy_too_low" });
    expect(
      await reportMatchPresence(rpcClient({ data: null, error: { hint: "not_participant" } }), reading, "arena", "c1"),
    ).toEqual({ ok: false, code: "error", hint: "not_participant" });
    expect(await reportMatchPresence(rpcClient(new Error("net")), reading, "go_live")).toEqual({
      ok: false,
      code: "error",
      hint: null,
    });
  });
});

describe("captureAndReport", () => {
  it("does not call the RPC when the reading fails", async () => {
    const c = rpcClient({ data: { ok: true }, error: null });
    expect(await captureAndReport(c, "go_live")).toEqual({ ok: false, failure: "denied" });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("maps a server accuracy_too_low to the accuracy failure", async () => {
    stubGeo((ok) => ok(fix(40)));
    const c = rpcClient({ data: { ok: false, code: "accuracy_too_low" }, error: null });
    expect(await captureAndReport(c, "go_live")).toEqual({ ok: false, failure: "accuracy" });
  });

  it("passes other report failures through with no athlete-facing failure", async () => {
    stubGeo((ok) => ok(fix(40)));
    const c = rpcClient({ data: { ok: false, code: "booking_closed" }, error: null });
    expect(await captureAndReport(c, "arena", "c1")).toEqual({
      ok: false,
      failure: null,
      report: { ok: false, code: "booking_closed" },
    });
  });
});

describe("hints", () => {
  it("reads the HINT off a shared DomainError and recognises the proximity ones", () => {
    expect(hintOf({ raw: { hint: "proximity_failed" } })).toBe("proximity_failed");
    expect(hintOf({})).toBeNull();
    expect(isProximityHint("proximity_required")).toBe(true);
    expect(isProximityHint("proximity_failed")).toBe(true);
    expect(isProximityHint("location_required")).toBe(false);
  });
});
