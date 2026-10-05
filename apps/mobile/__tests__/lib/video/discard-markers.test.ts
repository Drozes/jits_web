/**
 * Round 2: the "discarded on this phone" marker survives an app restart
 * (persisted per athlete and match next to the upload jobs, 7-day expiry).
 */
const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockStore.set(k, v);
    },
    removeItem: async (k: string) => {
      mockStore.delete(k);
    },
    getAllKeys: async () => [...mockStore.keys()],
  },
}));

import {
  __resetDiscardMemoryForTests,
  clearDiscardedHere,
  DISCARD_MARKER_PREFIX,
  loadDiscardMarkers,
  markDiscardedHere,
  wasDiscardedHere,
} from "@/lib/video/discard-markers";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const M = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockStore.clear();
  __resetDiscardMemoryForTests();
});

it("is remembered after a restart, for that athlete only", async () => {
  await markDiscardedHere(ME, M);
  expect(wasDiscardedHere(ME, M)).toBe(true);
  // Restart: memory gone, disk kept.
  __resetDiscardMemoryForTests();
  expect(wasDiscardedHere(ME, M)).toBe(false);
  await loadDiscardMarkers(ME);
  expect(wasDiscardedHere(ME, M)).toBe(true);
  expect(wasDiscardedHere(OTHER, M)).toBe(false);
});

it("expires after 7 days, like the upload jobs", async () => {
  const t0 = Date.now();
  await markDiscardedHere(ME, M, t0 - 8 * DAY);
  __resetDiscardMemoryForTests();
  await loadDiscardMarkers(ME, t0);
  expect(wasDiscardedHere(ME, M)).toBe(false);
  expect([...mockStore.keys()].some((k) => k.startsWith(DISCARD_MARKER_PREFIX))).toBe(false);
});

it("a new recording attempt clears it, in memory and on disk", async () => {
  await markDiscardedHere(ME, M);
  await clearDiscardedHere(M);
  expect(wasDiscardedHere(ME, M)).toBe(false);
  __resetDiscardMemoryForTests();
  await loadDiscardMarkers(ME);
  expect(wasDiscardedHere(ME, M)).toBe(false);
});
