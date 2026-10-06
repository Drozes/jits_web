/**
 * ONE sign-out reset list (jits-a4fw.1 + .5): `highlight-store` re-exports the
 * dependency-free registry, so the reel lanes (`use-reel-lane`), the viewer's
 * signed-URL cache (`reel-prefetch`) and its lane sessions all clear with
 * `resetHighlightStore`.
 */
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
const mockSign = jest.fn((_s: unknown, p: { storagePath: string; version: number }) =>
  Promise.resolve({ ok: true, data: { url: `https://signed/${p.storagePath}`, posterUrl: null, version: p.version, durationS: 28 } }),
);
jest.mock("@jits/shared/api/highlights", () => ({
  signHighlightPlayback: (...a: unknown[]) => mockSign(...(a as [unknown, { storagePath: string; version: number }])),
  getHighlightProgress: jest.fn(),
}));

import * as store from "@/lib/highlight/highlight-store";
import * as registry from "@/lib/highlight/reset-registry";
import "@/lib/highlight/use-reel-lane";
import { signPlaybackCached } from "@/lib/highlight/reel-prefetch";
import { createReelSession, getReelSession } from "@/lib/highlight/reel-viewer-session";
import { reel } from "../../support/reel-fixtures";

const playback = { storagePath: "v1.mp4", posterPath: null, durationS: 28, version: 1, segments: [], readyAt: "2026-10-04T12:00:00Z" };

it("highlight-store's onHighlightStoreReset IS the registry's (a single list)", () => {
  expect(store.onHighlightStoreReset).toBe(registry.onHighlightStoreReset);
});

it("resetHighlightStore runs every registered resetter, including ones added through either module", () => {
  const a = jest.fn();
  const b = jest.fn();
  const offA = store.onHighlightStoreReset(a);
  const offB = registry.onHighlightStoreReset(b);
  store.resetHighlightStore();
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  offA();
  offB();
  store.resetHighlightStore();
  expect(a).toHaveBeenCalledTimes(1);
});

it("sign-out forgets the viewer's signed URLs and lane sessions", async () => {
  await signPlaybackCached(playback);
  await signPlaybackCached(playback);
  expect(mockSign).toHaveBeenCalledTimes(1);
  const s = createReelSession({ items: [reel(1)], startIndex: 0, lane: "home" })!;
  store.resetHighlightStore();
  expect(getReelSession(s.token)).toBeNull();
  await signPlaybackCached(playback);
  expect(mockSign).toHaveBeenCalledTimes(2);
});
