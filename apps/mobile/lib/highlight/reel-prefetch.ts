import { Image } from "expo-image";
import { supabase } from "@/lib/supabase/client";
import {
  getHighlightProgress,
  signHighlightPlayback,
  type HighlightPlayback,
  type HighlightPlaybackUrls,
} from "@jits/shared/api/highlights";
import type { Result } from "@jits/shared/api/errors";
import type { ReelItem } from "./reel-types";
import type { HighlightSource } from "./use-my-highlight";

/**
 * Signed-URL cache shared by the pager's prefetch and the page's own reel
 * hook (`useMyHighlight(..., { preferCached: true })`), so a prefetched page
 * and its mounted player load the SAME URL: the player never reloads an item
 * it already buffered. Keyed by the live render (`version:storagePath`);
 * an entry is reused while younger than `REEL_SIGN_REUSE_MS` (signatures live
 * 1 h; the player re-signs on demand past that, see `use-my-highlight.ts`).
 */
export const REEL_SIGN_REUSE_MS = 45 * 60_000;

interface Entry {
  urls: HighlightPlaybackUrls;
  signedAt: number;
}

const signed = new Map<string, Entry>();
const signing = new Map<string, Promise<Result<HighlightPlaybackUrls>>>();
const prefetching = new Map<string, Promise<HighlightSource | null>>();

function keyOf(p: Pick<HighlightPlayback, "version" | "storagePath">): string {
  return `${p.version}:${p.storagePath}`;
}

/** A fresh cached signature for this render, or null. */
export function peekSignedPlayback(p: Pick<HighlightPlayback, "version" | "storagePath">): Entry | null {
  const hit = signed.get(keyOf(p));
  return hit && Date.now() - hit.signedAt < REEL_SIGN_REUSE_MS ? hit : null;
}

/**
 * Signs the render, reusing a fresh cached signature unless `force` (a
 * re-sign after a player error or an old URL). Concurrent calls join.
 */
export function signPlaybackCached(playback: HighlightPlayback, { force = false } = {}): Promise<Result<HighlightPlaybackUrls> & { signedAt?: number }> {
  const key = keyOf(playback);
  if (!force) {
    const hit = peekSignedPlayback(playback);
    if (hit) return Promise.resolve({ ok: true, data: hit.urls, signedAt: hit.signedAt });
    const running = signing.get(key);
    if (running) return running;
  }
  const run = signHighlightPlayback(supabase, playback).then((res) => {
    if (res.ok) signed.set(key, { urls: res.data, signedAt: Date.now() });
    return res;
  });
  const tracked = run.finally(() => {
    if (signing.get(key) === tracked) signing.delete(key);
  });
  signing.set(key, tracked);
  return tracked;
}

/**
 * Warms a page that is not on screen yet: its poster image and its signed
 * playback URL (one progress read, one sign). Resolves the source the page's
 * player can preload (null when the reel has no live render or a call
 * failed; the page then signs when it mounts, as it would without prefetch).
 */
export function prefetchReel(item: ReelItem): Promise<HighlightSource | null> {
  if (item.posterUrl) void Promise.resolve(Image.prefetch?.(item.posterUrl)).catch(() => undefined);
  const running = prefetching.get(item.matchVideoId);
  if (running) return running;
  const run = getHighlightProgress(supabase, item.matchVideoId)
    .then(async (res): Promise<HighlightSource | null> => {
      const playback = res.ok ? res.data.playback : null;
      if (!playback) return null;
      const signedRes = await signPlaybackCached(playback);
      return signedRes.ok ? { ...signedRes.data, posterPath: playback.posterPath, generation: 0 } : null;
    })
    .catch(() => null)
    .finally(() => {
      prefetching.delete(item.matchVideoId);
    });
  prefetching.set(item.matchVideoId, run);
  return run;
}

/** Sign-out and tests: signatures belong to the old session. */
export function resetReelPrefetch(): void {
  signed.clear();
  signing.clear();
  prefetching.clear();
}
