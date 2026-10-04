/**
 * `readLocationOnce` (apps/mobile/lib/invites/location.ts): the live location
 * fixes' fast first fix (4.2), the 30 s permission prompt bound (1e) and the
 * reduced-precision heuristic (3a). The default path (invites) is unchanged:
 * one `Accuracy.High` fix inside 10 s.
 */
import { Platform } from "react-native";

const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockLastKnown = jest.fn();
const mockCurrent = jest.fn();
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: () => mockGetPermission(),
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
  getLastKnownPositionAsync: (...a: unknown[]) => mockLastKnown(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockCurrent(...a),
}));

import {
  LAST_KNOWN_MAX_AGE_MS,
  PERMISSION_REQUEST_TIMEOUT_MS,
  READING_TIMEOUT_MS,
  acceptLastKnown,
  readLocationOnce,
} from "@/lib/invites/location";

const NOW = 1_800_000_000_000;

function fix(accuracy: number | null, ageMs = 0, lat = 43.6) {
  return { coords: { latitude: lat, longitude: -79.4, accuracy }, timestamp: NOW - ageMs };
}

function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}

const ORIGINAL_OS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  setOS("ios");
  mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
  mockLastKnown.mockResolvedValue(null);
  mockCurrent.mockResolvedValue(fix(10));
});

afterEach(() => {
  jest.useRealTimers();
  setOS(ORIGINAL_OS as "ios" | "android");
});

describe("acceptLastKnown", () => {
  it("accepts a fix under 60 s old at 100 m or better", () => {
    expect(acceptLastKnown(fix(100, LAST_KNOWN_MAX_AGE_MS - 1) as never, NOW)).toBe(true);
    expect(acceptLastKnown(fix(5, 0) as never, NOW)).toBe(true);
  });

  it.each([
    ["60 s old", fix(10, LAST_KNOWN_MAX_AGE_MS)],
    ["coarser than 100 m", fix(101, 0)],
    ["no accuracy", fix(null, 0)],
    ["from the future", fix(10, -5_000)],
  ])("rejects one %s", (_c, p) => {
    expect(acceptLastKnown(p as never, NOW)).toBe(false);
  });

  it("rejects none", () => {
    expect(acceptLastKnown(null, NOW)).toBe(false);
  });
});

describe("fast path (Go Live, face-off)", () => {
  it("uses a fresh, accurate last known position without a live fix", async () => {
    mockLastKnown.mockResolvedValue(fix(30, 20_000, 43.7));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(r).toEqual({ status: "ok", reading: { lat: 43.7, lng: -79.4, accuracyM: 30 } });
    expect(mockCurrent).not.toHaveBeenCalled();
    expect(mockLastKnown).toHaveBeenCalledWith({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: 100 });
  });

  it("a stale last known falls through to Balanced, which is enough at 100 m or better", async () => {
    mockLastKnown.mockResolvedValue(fix(10, LAST_KNOWN_MAX_AGE_MS + 1));
    mockCurrent.mockResolvedValueOnce(fix(65));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(r).toMatchObject({ status: "ok", reading: { accuracyM: 65 } });
    expect(mockCurrent).toHaveBeenCalledTimes(1);
    expect(mockCurrent).toHaveBeenCalledWith({ accuracy: 3 });
  });

  it("Balanced worse than 100 m: one more with High", async () => {
    mockCurrent.mockResolvedValueOnce(fix(400)).mockResolvedValueOnce(fix(15));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(mockCurrent.mock.calls).toEqual([[{ accuracy: 3 }], [{ accuracy: 4 }]]);
    expect(r).toMatchObject({ status: "ok", reading: { accuracyM: 15 } });
  });

  it("High coarser than Balanced: keeps the better Balanced reading", async () => {
    mockCurrent.mockResolvedValueOnce(fix(150)).mockResolvedValueOnce(fix(300));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(r).toMatchObject({ status: "ok", reading: { accuracyM: 150 } });
  });

  it("High timing out after a coarse Balanced keeps Balanced, inside the one 10 s budget", async () => {
    mockCurrent.mockResolvedValueOnce(fix(250)).mockReturnValueOnce(new Promise(() => undefined));
    const p = readLocationOnce({ ask: false, fast: true });
    await jest.advanceTimersByTimeAsync(READING_TIMEOUT_MS);
    expect(await p).toMatchObject({ status: "ok", reading: { accuracyM: 250 } });
  });

  it("no fix at all within 10 s: unavailable, timeout", async () => {
    mockCurrent.mockReturnValue(new Promise(() => undefined));
    const p = readLocationOnce({ ask: false, fast: true });
    await jest.advanceTimersByTimeAsync(READING_TIMEOUT_MS);
    expect(await p).toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("both fixes erroring (services off): unavailable, error", async () => {
    mockCurrent.mockRejectedValue(new Error("Location services are disabled"));
    expect(await readLocationOnce({ ask: false, fast: true })).toEqual({ status: "unavailable", reason: "error" });
  });

  it("a last known lookup that throws still takes a live fix", async () => {
    mockLastKnown.mockRejectedValue(new Error("none"));
    expect(await readLocationOnce({ ask: false, fast: true })).toMatchObject({ status: "ok" });
  });
});

describe("permission", () => {
  it("never asks without ask: true (undetermined + canAskAgain is denied, re-askable)", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    expect(await readLocationOnce({ ask: false, fast: true })).toEqual({ status: "denied", canAskAgain: true });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it("a system prompt that never answers resolves as a timeout after 30 s", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermission.mockReturnValue(new Promise(() => undefined));
    const p = readLocationOnce({ ask: true, fast: true });
    await jest.advanceTimersByTimeAsync(PERMISSION_REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("asks when allowed and reads once granted", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    expect(await readLocationOnce({ ask: true, fast: true })).toMatchObject({ status: "ok" });
  });
});

describe("reduced precision (3a)", () => {
  it("iOS: a reading at 1000 m or worse is Precise Location off", async () => {
    mockCurrent.mockResolvedValue(fix(1414));
    expect(await readLocationOnce({ ask: false, fast: true })).toMatchObject({
      status: "ok",
      reducedPrecision: true,
      reading: { accuracyM: 1414 },
    });
  });

  it("iOS: 999 m is just coarse, not reduced precision", async () => {
    mockCurrent.mockResolvedValue(fix(999));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(r).not.toHaveProperty("reducedPrecision");
  });

  it("iOS: a missing accuracy is never read as Precise Location off", async () => {
    mockCurrent.mockResolvedValue(fix(null));
    const r = await readLocationOnce({ ask: false, fast: true });
    expect(r).toMatchObject({ status: "ok", reading: { accuracyM: 1000 } });
    expect(r).not.toHaveProperty("reducedPrecision");
  });

  it("Android: approximate-only permission is reduced precision whatever the reading says", async () => {
    setOS("android");
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, android: { accuracy: "coarse" } });
    mockCurrent.mockResolvedValue(fix(40));
    expect(await readLocationOnce({ ask: false, fast: true })).toMatchObject({ reducedPrecision: true });
  });

  it("Android: a 1500 m reading with fine permission is not flagged (the heuristic is iOS only)", async () => {
    setOS("android");
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, android: { accuracy: "fine" } });
    mockCurrent.mockResolvedValue(fix(1500));
    expect(await readLocationOnce({ ask: false, fast: true })).not.toHaveProperty("reducedPrecision");
  });
});

describe("default path (invites) is unchanged", () => {
  it("one High fix, no last known lookup", async () => {
    const r = await readLocationOnce({ ask: false });
    expect(mockLastKnown).not.toHaveBeenCalled();
    expect(mockCurrent).toHaveBeenCalledWith({ accuracy: 4 });
    expect(r).toEqual({ status: "ok", reading: { lat: 43.6, lng: -79.4, accuracyM: 10 } });
  });
});

describe("review N1: no fix is started once the 10 s budget is spent", () => {
  it("a last known lookup that hangs the whole budget never starts a live fix", async () => {
    mockLastKnown.mockReturnValue(new Promise(() => undefined));
    const p = readLocationOnce({ ask: false, fast: true });
    await jest.advanceTimersByTimeAsync(READING_TIMEOUT_MS);
    expect(await p).toEqual({ status: "unavailable", reason: "timeout" });
    expect(mockCurrent).not.toHaveBeenCalled();
  });
});

describe("permission request in flight (review B1, S2)", () => {
  it("is set only while the system prompt is up", async () => {
    const { permissionRequestInFlight } = jest.requireActual("@/lib/invites/location") as typeof import("@/lib/invites/location");
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    let release!: (v: unknown) => void;
    mockRequestPermission.mockReturnValue(new Promise((r) => (release = r)));
    expect(permissionRequestInFlight()).toBe(false);
    const p = readLocationOnce({ ask: true, fast: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(permissionRequestInFlight()).toBe(true);
    release({ granted: true, canAskAgain: true });
    await p;
    expect(permissionRequestInFlight()).toBe(false);
  });
});
