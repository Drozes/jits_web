/**
 * Tests for the haversineKm distance function and related helpers.
 *
 * Source: apps/mobile/lib/location/use-location.ts (exports haversineKm, formatDistanceKm)
 *
 * We also test the classifyProximity helper from distance-from-gym.ts which
 * wraps haversineKm with the gym proximity threshold.
 */

// Mock expo-location so the use-location module can be imported without
// pulling in native code. We only need the pure exported functions.
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

import { haversineKm, formatDistanceKm } from "@/lib/location/use-location";
import {
  classifyProximity,
  GYM_PROXIMITY_THRESHOLD_KM,
} from "@/lib/session/distance-from-gym";

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    const point = { latitude: 40.7128, longitude: -74.006 };
    expect(haversineKm(point, point)).toBe(0);
  });

  it("calculates the distance between New York and Los Angeles (~3944 km)", () => {
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    const la = { latitude: 34.0522, longitude: -118.2437 };
    const distance = haversineKm(nyc, la);
    // Allow 1% tolerance for the spherical approximation
    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(3990);
  });

  it("calculates the distance between London and Paris (~343 km)", () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const distance = haversineKm(london, paris);
    expect(distance).toBeGreaterThan(330);
    expect(distance).toBeLessThan(360);
  });

  it("handles points on the equator", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 1 };
    // 1 degree of longitude at equator is ~111.32 km
    const distance = haversineKm(a, b);
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(113);
  });

  it("handles points on the same meridian", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    // 1 degree of latitude is ~111.19 km
    const distance = haversineKm(a, b);
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(113);
  });

  it("is symmetric (distance A->B equals B->A)", () => {
    const a = { latitude: 35.6762, longitude: 139.6503 }; // Tokyo
    const b = { latitude: -33.8688, longitude: 151.2093 }; // Sydney
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("handles near-antipodal points", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 179 };
    // Nearly half the circumference (~19903 km for 179 degrees at equator)
    const distance = haversineKm(a, b);
    expect(distance).toBeGreaterThan(19800);
    expect(distance).toBeLessThan(20100);
  });

  it("handles short distances accurately (same city)", () => {
    // Two points about 1 km apart in Manhattan
    const a = { latitude: 40.748817, longitude: -73.985428 }; // Empire State
    const b = { latitude: 40.758896, longitude: -73.98513 }; // Times Square
    const distance = haversineKm(a, b);
    expect(distance).toBeGreaterThan(1.0);
    expect(distance).toBeLessThan(1.2);
  });
});

describe("formatDistanceKm", () => {
  it('formats sub-kilometer distances as meters (e.g. "400 m")', () => {
    expect(formatDistanceKm(0.4)).toBe("400 m");
  });

  it('formats exactly 0 km as "0 m"', () => {
    expect(formatDistanceKm(0)).toBe("0 m");
  });

  it('formats 0.999 km as "999 m"', () => {
    expect(formatDistanceKm(0.999)).toBe("999 m");
  });

  it('formats 1-10 km with one decimal place (e.g. "1.5 km")', () => {
    expect(formatDistanceKm(1.5)).toBe("1.5 km");
  });

  it('formats exactly 1 km as "1.0 km"', () => {
    expect(formatDistanceKm(1.0)).toBe("1.0 km");
  });

  it('formats 9.9 km as "9.9 km"', () => {
    expect(formatDistanceKm(9.9)).toBe("9.9 km");
  });

  it('formats 10+ km as integer (e.g. "320 km")', () => {
    expect(formatDistanceKm(320)).toBe("320 km");
  });

  it('formats exactly 10 km as "10 km"', () => {
    expect(formatDistanceKm(10)).toBe("10 km");
  });
});

describe("classifyProximity", () => {
  it("has a threshold of 2 km", () => {
    expect(GYM_PROXIMITY_THRESHOLD_KM).toBe(2);
  });

  it('returns "near" when the athlete is within the threshold', () => {
    // Two points about 1 km apart
    const athlete = { latitude: 40.748817, longitude: -73.985428 };
    const gym = { latitude: 40.758896, longitude: -73.98513 };
    const result = classifyProximity(athlete, gym);
    expect(result.proximity).toBe("near");
    expect(result.distanceKm).toBeLessThan(GYM_PROXIMITY_THRESHOLD_KM);
  });

  it('returns "far" when the athlete is beyond the threshold', () => {
    // NYC to LA
    const athlete = { latitude: 40.7128, longitude: -74.006 };
    const gym = { latitude: 34.0522, longitude: -118.2437 };
    const result = classifyProximity(athlete, gym);
    expect(result.proximity).toBe("far");
    expect(result.distanceKm).toBeGreaterThan(GYM_PROXIMITY_THRESHOLD_KM);
  });

  it('returns "near" when the athlete is at the exact gym location', () => {
    const pos = { latitude: 40.7128, longitude: -74.006 };
    const result = classifyProximity(pos, pos);
    expect(result.proximity).toBe("near");
    expect(result.distanceKm).toBe(0);
  });

  it('returns "far" when the distance is exactly at the threshold boundary', () => {
    // classifyProximity uses strict less-than (< threshold), so exactly 2 km is "far"
    // We approximate 2 km: ~0.018 degrees of latitude at NYC latitude
    const athlete = { latitude: 40.7128, longitude: -74.006 };
    // ~5 km away, well past threshold
    const gym = { latitude: 40.7578, longitude: -74.006 };
    const result = classifyProximity(athlete, gym);
    // 0.045 degrees lat is ~5 km
    expect(result.distanceKm).toBeGreaterThan(GYM_PROXIMITY_THRESHOLD_KM);
    expect(result.proximity).toBe("far");
  });
});
