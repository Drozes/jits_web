/**
 * The face-off's coarse cell (lib/video/capture-location.ts; specs/
 * dynamic-capture-bitrate 16.3 E1, E5, AC M7): never asks, OS cache under an
 * existing grant, then the device store, rounded, bounded by 1 s.
 */
const mockGetLastKnown = jest.fn();
const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
jest.mock("expo-location", () => ({
  getLastKnownPositionAsync: (...a: unknown[]) => mockGetLastKnown(...a),
  getForegroundPermissionsAsync: (...a: unknown[]) => mockGetPermission(...a),
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestPermission(...a),
  requestBackgroundPermissionsAsync: (...a: unknown[]) => mockRequestPermission(...a),
}));

const mockTag = jest.fn();
const mockReading = jest.fn();
jest.mock("@/lib/location/device-location-store", () => ({
  getDeviceLocationOwner: () => "A1",
  validDeviceTag: (...a: unknown[]) => mockTag(...a),
  validDeviceReading: (...a: unknown[]) => mockReading(...a),
}));

import { readCaptureLocation } from "@/lib/video/capture-location";
import { __resetLocationPermissionCacheForTests, readLocationPermission } from "@/lib/location/permission-cache";
import { CAPTURE_LOCATION_MAX_AGE_MS, CAPTURE_LOCATION_TIMEOUT_MS } from "@/lib/video/capture-bitrate";

const NOW = 1_800_000_000_000;
const fix = (over: { lat?: number; lng?: number; accuracy?: number | null; ageMs?: number } = {}) => ({
  coords: { latitude: over.lat ?? 43.654321, longitude: over.lng ?? -79.387654, accuracy: over.accuracy === undefined ? 30 : over.accuracy },
  timestamp: NOW - (over.ageMs ?? 60_000),
});
const stored = (lat: number, lng: number) => ({ lat, lng, accuracyM: 20, capturedAt: NOW - 1000, context: "go_live" });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  __resetLocationPermissionCacheForTests();
  mockGetLastKnown.mockReset().mockResolvedValue(fix());
  mockGetPermission.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockRequestPermission.mockReset();
  mockTag.mockReset().mockReturnValue(null);
  mockReading.mockReset().mockReturnValue(null);
});

afterEach(() => {
  expect(mockRequestPermission).not.toHaveBeenCalled();
  jest.useRealTimers();
});

describe("readCaptureLocation", () => {
  it("granted: the OS cached fix, rounded to 2 decimals, with the 30 min and 3,000 m options", async () => {
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.65, lng: -79.39 });
    expect(mockGetLastKnown).toHaveBeenCalledWith({ maxAge: CAPTURE_LOCATION_MAX_AGE_MS, requiredAccuracy: 3_000 });
  });

  it("uses the cached permission when one was read (no second permission read)", async () => {
    await readLocationPermission();
    mockGetPermission.mockClear();
    await readCaptureLocation();
    expect(mockGetPermission).not.toHaveBeenCalled();
  });

  it("not granted: never reads the OS fix, falls to the device store", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockTag.mockReturnValue(stored(45.501234, -73.567891));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 45.5, lng: -73.57 });
    expect(mockGetLastKnown).not.toHaveBeenCalled();
    expect(mockTag).toHaveBeenCalledWith("A1");
  });

  it("Android approximate permission is accepted, and an approximate fix (about 2 km, up to 3,000 m) places the cell", async () => {
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, android: { accuracy: "coarse" } });
    mockGetLastKnown.mockResolvedValue(fix({ accuracy: 2_500 }));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.65, lng: -79.39 });
    mockGetLastKnown.mockResolvedValue(fix({ accuracy: 3_000 }));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.65, lng: -79.39 });
  });

  it.each([
    ["older than 30 min", fix({ ageMs: CAPTURE_LOCATION_MAX_AGE_MS + 1 })],
    ["worse than 3,000 m", fix({ accuracy: 3_001 })],
    ["no accuracy", fix({ accuracy: null })],
    ["from the future", fix({ ageMs: -5_000 })],
    ["absent", null],
  ])("an OS fix %s is rejected: the store, else null", async (_name, value) => {
    mockGetLastKnown.mockResolvedValue(value);
    await expect(readCaptureLocation()).resolves.toBeNull();
    mockReading.mockReturnValue(stored(43.70001, -79.40001));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.7, lng: -79.4 });
  });

  it("the store's tag first, then its reading", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    mockTag.mockReturnValue(stored(43.11, -79.11));
    mockReading.mockReturnValue(stored(43.22, -79.22));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.11, lng: -79.11 });
    mockTag.mockReturnValue(null);
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.22, lng: -79.22 });
  });

  it("nothing anywhere: null", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    await expect(readCaptureLocation()).resolves.toBeNull();
  });

  it("a throwing OS call or permission read: the store, never a throw", async () => {
    mockGetLastKnown.mockRejectedValue(new Error("native"));
    mockTag.mockReturnValue(stored(43.11, -79.11));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.11, lng: -79.11 });
    __resetLocationPermissionCacheForTests();
    mockGetPermission.mockRejectedValue(new Error("native"));
    await expect(readCaptureLocation()).resolves.toEqual({ lat: 43.11, lng: -79.11 });
  });

  it("a slow OS call (> 1 s) resolves within the bound with the store value, or null", async () => {
    mockGetLastKnown.mockReturnValue(new Promise(() => undefined));
    mockTag.mockReturnValue(stored(43.11, -79.11));
    const p = readCaptureLocation();
    await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ lat: 43.11, lng: -79.11 });
    mockTag.mockReturnValue(null);
    const q = readCaptureLocation();
    await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
    await expect(q).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("an invalid stored reading is null", async () => {
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockTag.mockReturnValue(stored(Number.NaN, 0));
    await expect(readCaptureLocation()).resolves.toBeNull();
  });
});
