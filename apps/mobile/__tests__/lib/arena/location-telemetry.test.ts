/**
 * Location event telemetry (live location fixes 4.5, 4.6): the app version
 * tag (at most 32 characters) and fire-and-forget logging that never throws.
 *
 * Source: apps/mobile/lib/arena/location-telemetry.ts
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockInfo = jest.fn();
jest.mock("@/lib/updates/app-version", () => ({ readAppVersionInfo: () => mockInfo() }));
const mockLog = jest.fn();
jest.mock("@jits/shared/api/location", () => ({ logLocationEvent: (...a: unknown[]) => mockLog(...a) }));

import { locationAppVersion, logGoLiveAttempt, logMatchStartLocation } from "@/lib/arena/location-telemetry";

beforeEach(() => {
  jest.clearAllMocks();
  mockInfo.mockReturnValue({ appVersion: "0.5.0", buildNumber: "25", updateId: null, isEmbeddedLaunch: true });
  mockLog.mockResolvedValue({ ok: true, data: { logged: true } });
});

describe("locationAppVersion", () => {
  it("version and build on the embedded bundle", () => {
    expect(locationAppVersion()).toBe("0.5.0 (25)");
  });
  it("adds the OTA id (8 characters) when an update runs", () => {
    mockInfo.mockReturnValue({ appVersion: "0.5.0", buildNumber: "25", updateId: "9287a1e5-aaaa", isEmbeddedLaunch: false });
    expect(locationAppVersion()).toBe("0.5.0 (25) 9287a1e5");
  });
  it("never longer than 32 characters", () => {
    mockInfo.mockReturnValue({ appVersion: "1".repeat(40), buildNumber: "25", updateId: null, isEmbeddedLaunch: true });
    expect(locationAppVersion()).toHaveLength(32);
  });
  it("null without a version, or when reading it throws", () => {
    mockInfo.mockReturnValue({ appVersion: null, buildNumber: null, updateId: null, isEmbeddedLaunch: true });
    expect(locationAppVersion()).toBeNull();
    mockInfo.mockImplementation(() => {
      throw new Error("x");
    });
    expect(locationAppVersion()).toBeNull();
  });
});

describe("logging", () => {
  it("go_live_attempt carries no match id; match_start carries one", () => {
    logGoLiveAttempt("ok", { lat: 1, lng: 2, accuracyM: 3 });
    logMatchStartLocation("M1", "permission_denied");
    expect(mockLog.mock.calls[0]).toEqual([
      { tag: "client" },
      expect.objectContaining({ event: "go_live_attempt", outcome: "ok", reading: { lat: 1, lng: 2, accuracyM: 3 }, appVersion: "0.5.0 (25)" }),
    ]);
    expect(mockLog.mock.calls[0][1]).not.toHaveProperty("matchId");
    expect(mockLog.mock.calls[1][1]).toMatchObject({ event: "match_start", outcome: "permission_denied", matchId: "M1", reading: null });
  });

  it("never throws, whatever the helper does", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockLog.mockImplementation(() => {
      throw new Error("sync");
    });
    expect(() => logGoLiveAttempt("error")).not.toThrow();
    mockLog.mockRejectedValue(new Error("async"));
    expect(() => logGoLiveAttempt("error")).not.toThrow();
    mockLog.mockResolvedValue({ ok: false, error: { hint: "rpc_missing", message: "" } });
    expect(() => logMatchStartLocation("M1", "ok")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
