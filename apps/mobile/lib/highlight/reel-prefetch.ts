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
import { REEL_PROGRESS_TTL_MS, REEL_SIGN_REUSE_MS } from "./reel-pager-math";
import { onHighlightStoreReset } from "./reset-registry";

export { REEL_SIGN_REUSE_MS };

/**
 * Signed-URL cache shared by the pager's prefetch and the page's own reel
 * hook (`useMyHighlight(..., { preferCached: true })`), so a prefetched page
 * and its mounted player load the SAME URL: the player never reloads an item
 * it already buffered. Keyed by the live render (`version:storagePath`); an
 * entry is reused while younger than `REEL_SIGN_REUSE_MS` (45 min, see
 * `reel-pager-math.ts`). Prefetch's progress reads are cached per match video
 * for `REEL_PROGRESS_TTL_MS`, so swiping back and forth costs no RPC.
 * Everything is forgotten on sign-out (`onHighlightStoreReset`).
 */
interface Entry {
  urls: HighlightPlaybackUrls;
  signedAt: number;
}

export interface PrefetchedReel {
  source: HighlightSource;
  signedAt: number;
}

const signed = new Map<string, Entry>();
const signing = new Map<string, Promise<Result<HighlightPlaybackUrls> & { signedAt?: number }>>();
const progressRead = new Map<string, { at: number; playback: HighlightPlayback | null }>();
const prefetching = new Map<string, Promise<PrefetchedReel | null>>();

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
 * `signedAt` is set on every success.
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
    if (!res.ok) return res;
    const signedAt = Date.now();
    signed.set(key, { urls: res.data, signedAt });
    return { ...res, signedAt };
  });
  const tracked = run.finally(() => {
    if (signing.get(key) === tracked) signing.delete(key);
  });
  signing.set(key, tracked);
  return tracked;
}

async function livePlayback(matchVideoId: string): Promise<HighlightPlayback | null> {
  const hit = progressRead.get(matchVideoId);
  if (hit && Date.now() - hit.at < REEL_PROGRESS_TTL_MS) return hit.playback;
  const res = await getHighlightProgress(supabase, matchVideoId);
  if (!res.ok) return null; // not cached: the next landing may try again
  progressRead.set(matchVideoId, { at: Date.now(), playback: res.data.playback });
  return res.data.playback;
}

/**
 * Warms a page that is not on screen yet: its signed playback URL (one
 * progress read, one sign, both cached). Posters are not prefetched here:
 * `Image.prefetch` cannot take the `highlight-poster:<posterPath>` cache key
 * the page renders with, so it would warm a different cache entry; the next
 * page is mounted by the pager's render window and loads its poster itself. Resolves the
 * source the page's player can preload, with its signing time (null when the
 * reel has no live render or a call failed; the page then signs when it
 * mounts, as it would without prefetch).
 */
export function prefetchReel(item: ReelItem): Promise<PrefetchedReel | null> {
  const running = prefetching.get(item.matchVideoId);
  if (running) return running;
  const run = livePlayback(item.matchVideoId)
    .then(async (playback): Promise<PrefetchedReel | null> => {
      if (!playback) return null;
      const res = await signPlaybackCached(playback);
      if (!res.ok) return null;
      return { source: { ...res.data, posterPath: playback.posterPath, generation: 0 }, signedAt: res.signedAt ?? Date.now() };
    })
    .catch(() => null)
    .finally(() => {
      prefetching.delete(item.matchVideoId);
    });
  prefetching.set(item.matchVideoId, run);
  return run;
}

/** Sign-out and tests: signatures and reads belong to the old session. */
export function resetReelPrefetch(): void {
  signed.clear();
  signing.clear();
  progressRead.clear();
  prefetching.clear();
}

onHighlightStoreReset(resetReelPrefetch);
