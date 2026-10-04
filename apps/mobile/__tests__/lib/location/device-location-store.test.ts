/**
 * The device location store (jr_be 016 addendum, instant go-live 4.1): the
 * last location the server ACCEPTED, per athlete, in SecureStore.
 *
 *  - written only on `ok:true` (go_live, browse, arena), with the server's
 *    `captured_at` for go_live; never on a refusal or a failed call;
 *  - an entry 4 hours old is deleted on read and treated as absent;
 *  - cleared on sign-out, on an athlete switch and on account deletion;
 *  - SecureStore failures are silent ("no entry");
 *  - the browse and arena report paths write it too;
 *  - nothing is kept against a legacy backend.
 *
 * Source: apps/mobile/lib/location/device-location-store.ts,
 * lib/arena/arena-presence.ts, lib/auth/auth-context.tsx,
 * app/(app)/settings/delete-account.tsx
 */
const mockSecure = new Map<string, string>();
let mockFail = false;
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => (mockFail ? Promise.reject(new Error("keychain")) : Promise.resolve(mockSecure.get(k) ?? null)),
  setItemAsync: (k: string, v: string) => {
    if (mockFail) return Promise.reject(new Error("keychain"));
    mockSecure.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    if (mockFail) return Promise.reject(new Error("keychain"));
    mockSecure.delete(k);
    return Promise.resolve();
  },
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockArenaReport = jest.fn();
jest.mock("@jits/shared/api/location", () => ({
  reportArenaPresence: (...a: unknown[]) => mockArenaReport(...a),
}));

import {
  __resetDeviceLocationStoreForTests,
  clearAllDeviceLocations,
  loadDeviceLocation,
  peekDeviceLocation,
  recordAcceptedReading,
  setDeviceLocationOwner,
  validDeviceTag,
} from "@/lib/location/device-location-store";
import { __resetPresenceCapabilityForTests } from "@/lib/location/presence-capability";
import { reportArenaReading } from "@/lib/arena/arena-presence";
import { GO_LIVE_TAG_MAX_AGE_MS } from "@jits/shared/constants/go-live";

const READING = { lat: 43.65, lng: -79.38, accuracyM: 20 };
const OK = { ok: true as const, verdict: "recorded" as const, reason: null, distance_m: null, started: false, match_id: null, start_blocked_reason: null };

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  mockSecure.clear();
  mockFail = false;
  jest.clearAllMocks();
  __resetDeviceLocationStoreForTests();
  __resetPresenceCapabilityForTests();
});

describe("writes only what the server accepted", () => {
  it.each(["go_live", "browse", "arena"] as const)("%s ok:true is stored for the owner", async (context) => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading(context, READING, 1_000, OK);
    expect(peekDeviceLocation("a1", 2_000)).toEqual({ ...READING, capturedAt: 1_000, context });
    await settle();
    expect(JSON.parse(mockSecure.get("last-location.a1")!)).toMatchObject({ context, capturedAt: 1_000 });
  });

  it("go_live takes the server's captured_at (the clamped value) over the device time", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("go_live", READING, 5_000, { ...OK, captured_at: "1970-01-01T00:00:04.000Z" });
    expect(peekDeviceLocation("a1", 6_000)?.capturedAt).toBe(4_000);
  });

  it("never a refusal, a failed call or a missing answer", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("go_live", READING, 1_000, { ok: false, code: "accuracy_too_low" });
    recordAcceptedReading("go_live", READING, 1_000, null);
    expect(peekDeviceLocation("a1", 2_000)).toBeNull();
    expect(mockSecure.size).toBe(0);
  });

  it("no owner (signed out): nothing is stored", () => {
    recordAcceptedReading("browse", READING, 1_000, OK);
    expect(mockSecure.size).toBe(0);
  });

  it("never moves the stored time backwards", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("go_live", READING, 9_000, OK);
    recordAcceptedReading("browse", { ...READING, lat: 1 }, 8_000, OK);
    expect(peekDeviceLocation("a1", 10_000)).toMatchObject({ capturedAt: 9_000, context: "go_live" });
  });

  it("a legacy backend: nothing is kept (it never gets a replay)", async () => {
    __resetPresenceCapabilityForTests("legacy");
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("go_live", READING, 1_000, OK);
    expect(peekDeviceLocation("a1", 2_000)).toBeNull();
  });
});

describe("reads", () => {
  it("reads SecureStore once into memory", async () => {
    mockSecure.set("last-location.a1", JSON.stringify({ ...READING, capturedAt: Date.now(), context: "go_live" }));
    expect(await loadDeviceLocation("a1")).toMatchObject({ context: "go_live" });
    mockSecure.clear();
    expect(await loadDeviceLocation("a1")).toMatchObject({ context: "go_live" });
  });

  it("an entry 4 hours old is deleted on read and treated as absent", async () => {
    const now = Date.now();
    mockSecure.set("last-location.a1", JSON.stringify({ ...READING, capturedAt: now - GO_LIVE_TAG_MAX_AGE_MS, context: "go_live" }));
    await loadDeviceLocation("a1");
    expect(peekDeviceLocation("a1", now)).toBeNull();
    await settle();
    expect(mockSecure.has("last-location.a1")).toBe(false);
  });

  it("a malformed entry is no entry", async () => {
    mockSecure.set("last-location.a1", "{not json");
    expect(await loadDeviceLocation("a1")).toBeNull();
  });

  it("validDeviceTag: valid only inside 4 h minus the margin and at 100 m or better", async () => {
    const now = Date.now();
    mockSecure.set("last-location.a1", JSON.stringify({ ...READING, accuracyM: 120, capturedAt: now, context: "go_live" }));
    await loadDeviceLocation("a1");
    expect(validDeviceTag("a1", now)).toBeNull();
  });

  it("SecureStore failures are silent: a failed read is no entry, a failed write throws nothing", async () => {
    mockFail = true;
    expect(await loadDeviceLocation("a1")).toBeNull();
    setDeviceLocationOwner("a1");
    expect(() => recordAcceptedReading("browse", READING, 1_000, OK)).not.toThrow();
    await settle();
  });
});

describe("cleared on sign-out, an athlete switch and account deletion", () => {
  it("an athlete switch clears the previous athlete's entry", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("browse", READING, Date.now(), OK);
    await settle();
    setDeviceLocationOwner("a2");
    await settle();
    expect(mockSecure.has("last-location.a1")).toBe(false);
    expect(peekDeviceLocation("a1")).toBeNull();
  });

  it("sign-out (and the account deletion flow, which calls the same) clears every athlete this process touched", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    recordAcceptedReading("go_live", READING, Date.now(), OK);
    await settle();
    clearAllDeviceLocations();
    await settle();
    expect(mockSecure.size).toBe(0);
    expect(peekDeviceLocation("a1")).toBeNull();
    // No owner any more: nothing more is stored.
    recordAcceptedReading("browse", READING, Date.now(), OK);
    expect(mockSecure.size).toBe(0);
  });
});

describe("the arena report path", () => {
  it("an accepted arena reading is stored; a refused one is not", async () => {
    setDeviceLocationOwner("a1");
    await settle();
    mockReading.mockResolvedValue({ status: "ok", reading: READING, capturedAt: 7_000 });
    mockArenaReport.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "implausible_movement" } });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await reportArenaReading("c1", { ask: false });
    expect(peekDeviceLocation("a1", 8_000)).toBeNull();
    mockArenaReport.mockResolvedValueOnce({ ok: true, data: OK });
    await reportArenaReading("c1", { ask: false });
    expect(peekDeviceLocation("a1", 8_000)).toMatchObject({ context: "arena", capturedAt: 7_000 });
  });
});
