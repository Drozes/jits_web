/**
 * Review S2 (jits-mafl.2 M4): the Android precise-location upgrade is asked
 * only by the Go Live flow. The challenge accept / match start reading
 * (`reportArenaReading(..., { ask: true })`, use-arena-challenge) must never
 * show it, or a dialog could stall the match start by up to 30 s. Runs the
 * real `readLocationOnce`; only expo-location and the network are mocked.
 *
 * Source: apps/mobile/lib/arena/arena-presence.ts, lib/invites/location.ts,
 * lib/arena/go-live-location.ts
 */
import * as fs from "fs";
import * as path from "path";
import { Platform } from "react-native";

const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: () => mockGetPermission(),
  requestForegroundPermissionsAsync: () => mockRequestPermission(),
  getLastKnownPositionAsync: () => Promise.resolve(null),
  getCurrentPositionAsync: () =>
    Promise.resolve({ coords: { latitude: 43.6, longitude: -79.4, accuracy: 2000 }, timestamp: Date.now() }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockReport = jest.fn();
jest.mock("@jits/shared/api/location", () => ({ reportArenaPresence: (...a: unknown[]) => mockReport(...a) }));
jest.mock("@/lib/location/device-location-store", () => ({
  getDeviceLocationOwner: () => "me",
  recordAcceptedReading: jest.fn(),
}));

import { reportArenaReading } from "@/lib/arena/arena-presence";

const ORIGINAL_OS = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: ORIGINAL_OS, configurable: true });
});

it("the accept path's reading never asks for the precise upgrade on Android", async () => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, android: { accuracy: "coarse" } });
  mockReport.mockResolvedValue({ ok: true, data: { ok: true, verdict: "recorded" } });
  await reportArenaReading("c1", { ask: true });
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockReport).toHaveBeenCalled();
});

it("only go-live-location.ts passes upgrade to readLocationOnce", () => {
  const root = path.resolve(__dirname, "../../..");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const passers = ["app", "components", "lib"]
    .flatMap((d) => walk(path.join(root, d)))
    .filter((f) => /upgrade:\s*true/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(root, f).split(path.sep).join("/"));
  expect(passers).toEqual(["lib/arena/go-live-location.ts"]);
});

// Drop any permission request a test left pending, and its expiry timer.
afterEach(() => {
  (
    jest.requireActual("@/lib/permissions/permission-request") as typeof import("@/lib/permissions/permission-request")
  ).__resetPermissionRequestsForTests();
});
