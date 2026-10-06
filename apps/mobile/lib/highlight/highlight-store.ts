import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import type { Result } from "@jits/shared/api/errors";
import { runHighlightStoreResets } from "./reset-registry";
import {
  getMyHighlights,
  type GetMyHighlightsOptions,
  type MyHighlights,
} from "@jits/shared/api/highlight-share";

/**
 * One place for the discovery surfaces' highlight reads and the signals that
 * keep them fresh (integration review, discovery m1-m3).
 *
 * - `readMyHighlights`: `get_my_highlights` shared by every bell (one per
 *   tab header) and the Home card. Concurrent reads with the same options
 *   join one request, and a read within `HIGHLIGHT_READ_THROTTLE_MS` of the
 *   last one reuses it, so a foreground or focus fan-out costs one RPC per
 *   distinct query instead of five. `force` always reads fresh.
 * - `notifyHighlightsChanged()`: bumped after a reel is marked seen or the
 *   Home card is dismissed; the bell and the Home card re-read (forced) on it.
 * - `requestBellRefresh()`: Home's pull-to-refresh asks every bell for a
 *   full re-read (challenges and results too).
 * - `useForegroundEffect`: a real return from the background only; iOS
 *   `inactive` -> `active` (notification shade, app switcher, system
 *   prompts) is not a foreground.
 */

export const HIGHLIGHT_READ_THROTTLE_MS = 2_000;
let throttleMs = HIGHLIGHT_READ_THROTTLE_MS;

type Read = Promise<Result<MyHighlights>>;
const inFlight = new Map<string, Read>();
const lastRead = new Map<string, { at: number; result: Result<MyHighlights> }>();

/**
 * `owner` (the signed-in athlete id, when the caller knows it) is part of the
 * dedupe key, so a read started for one account is never handed to another.
 */
export function readMyHighlights(
  opts: GetMyHighlightsOptions,
  { force = false, owner = null }: { force?: boolean; owner?: string | null } = {},
): Read {
  const key = JSON.stringify([owner, opts.limit ?? null, opts.before ?? null, opts.beforeId ?? null, opts.unseenOnly ?? null]);
  if (!force) {
    const running = inFlight.get(key);
    if (running) return running;
    const cached = lastRead.get(key);
    if (cached && Date.now() - cached.at < throttleMs) return Promise.resolve(cached.result);
  }
  const read = getMyHighlights(supabase, opts)
    .then((result) => {
      if (inFlight.get(key) === read) lastRead.set(key, { at: Date.now(), result });
      return result;
    })
    .finally(() => {
      if (inFlight.get(key) === read) inFlight.delete(key);
    });
  inFlight.set(key, read);
  return read;
}

// ---- signals ---------------------------------------------------------------

let changed = 0;
let bellRefreshes = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** A reel was marked seen or dismissed: the bell and the Home card re-read. */
export function notifyHighlightsChanged(): void {
  changed += 1;
  lastRead.clear(); // whatever was cached is stale now
  emit();
}

/** Home's pull-to-refresh: every bell re-reads its whole feed. */
export function requestBellRefresh(): void {
  bellRefreshes += 1;
  emit();
}

export function useHighlightsChangedCount(): number {
  return React.useSyncExternalStore(subscribe, () => changed, () => changed);
}

export function useBellRefreshCount(): number {
  return React.useSyncExternalStore(subscribe, () => bellRefreshes, () => bellRefreshes);
}

/** Runs `effect` whenever `count` moves after mount (not on mount itself). */
export function useOnCountChange(count: number, effect: () => void): void {
  const seen = React.useRef(count);
  const effectRef = React.useRef(effect);
  effectRef.current = effect;
  React.useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    effectRef.current();
  }, [count]);
}

/** Calls `onForeground` only on a real background -> active return. */
export function useForegroundEffect(onForeground: () => void): void {
  const ref = React.useRef(onForeground);
  ref.current = onForeground;
  React.useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") wasBackground = true;
      else if (next === "active" && wasBackground) {
        wasBackground = false;
        ref.current();
      }
    });
    return () => sub.remove();
  }, []);
}

/**
 * The ONE reset list (`reset-registry.ts`, dependency-free so pure stores can
 * register without this module's Supabase import): the reel lanes
 * (`use-reel-lane.ts`), the viewer's signed URLs and lane sessions.
 */
export { onHighlightStoreReset } from "./reset-registry";

/** Sign-out, and tests: forget cached reads and every registered cache (they belong to the old account). */
export function resetHighlightStore(): void {
  inFlight.clear();
  lastRead.clear();
  runHighlightStoreResets();
}

/** Test-only: suites that test refresh WIRING (not the dedupe) turn the throttle off. */
export function __setHighlightReadThrottleForTests(ms: number): void {
  throttleMs = ms;
}
