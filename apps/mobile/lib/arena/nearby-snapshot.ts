/**
 * The latest Arena nearby view, app-wide (jr_be spec 023 section 8.4). The
 * incoming challenge prompt is mounted outside the Arena screen and reads it
 * to tell whether a challenger is in the viewer's own Online & close list.
 *
 * Kept in memory only, never persisted, and always tagged with the athlete
 * it was read for: a read for one athlete never answers for another (an
 * account switch on the same device, or a sign-out the app did not start).
 * Sign-out also clears it (`resetLatestNearby`, auth-context).
 *
 * No runtime imports on purpose: auth-context clears it on sign-out without
 * pulling in the location stack.
 */
import { useSyncExternalStore } from "react";
import type { ArenaCloseRow, ArenaRanges } from "@jits/shared/api/location";

export type ArenaNearbyView =
  | {
      mode: "nearby";
      onTheMat: ReadonlySet<string>;
      /** Close rows by athlete id (band, its meters, `can_challenge`). */
      close: ReadonlyMap<string, ArenaCloseRow>;
      /** The server's configured ranges (jr_be spec 023), null before 023. */
      ranges: ArenaRanges | null;
    }
  | { mode: "fallback" };

/**
 * How old the last read may be before nothing is concluded from it. The
 * Arena re-reads every 60 s while focused; away from it the list goes stale,
 * and an old list must not label a challenger who has since moved.
 */
export const NEARBY_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

export interface NearbySnapshot {
  view: ArenaNearbyView;
  /** The athlete the view was read for (the viewer). */
  athleteId: string | null;
  /** `Date.now()` when the view was last read. */
  at: number;
}

let latest: NearbySnapshot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function sameRanges(a: ArenaRanges | null, b: ArenaRanges | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.sameMatM === b.sameMatM &&
    a.closeRadiusM === b.closeRadiusM &&
    a.bandEdgesM.length === b.bandEdgesM.length &&
    a.bandEdgesM.every((e, i) => e === b.bandEdgesM[i])
  );
}

/** Same content, so nobody needs to re-render. */
export function sameNearbyView(a: ArenaNearbyView, b: ArenaNearbyView): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "fallback" || b.mode === "fallback") return true;
  if (a.onTheMat.size !== b.onTheMat.size || a.close.size !== b.close.size) return false;
  for (const id of a.onTheMat) if (!b.onTheMat.has(id)) return false;
  for (const [id, r] of a.close) {
    const o = b.close.get(id);
    if (!o || o.band !== r.band || o.bandMaxM !== r.bandMaxM || o.canChallenge !== r.canChallenge) return false;
  }
  return sameRanges(a.ranges, b.ranges);
}

/**
 * Record a read for `athleteId`. An unchanged read only refreshes its time
 * (no listener runs), so the app-wide owner does not re-render every minute.
 */
export function publishLatestNearby(view: ArenaNearbyView, athleteId: string | null, now: number = Date.now()): void {
  if (latest && latest.athleteId === athleteId && sameNearbyView(latest.view, view)) {
    latest.at = now;
    return;
  }
  latest = { view, athleteId, at: now };
  notify();
}

/** Forget the last read (sign-out). */
export function resetLatestNearby(): void {
  if (latest === null) return;
  latest = null;
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getLatest(): NearbySnapshot | null {
  return latest;
}

/**
 * The athlete's close row in a snapshot read for `viewerId`, or null: not
 * close, on the mat, a fallback mode, a read older than the max age, or a
 * read made for a different athlete than the viewer.
 */
export function closeRowIn(
  snapshot: NearbySnapshot | null,
  athleteId: string | null | undefined,
  viewerId: string | null | undefined,
  now: number = Date.now(),
): ArenaCloseRow | null {
  if (!snapshot || !athleteId || !viewerId || snapshot.athleteId !== viewerId) return null;
  if (snapshot.view.mode !== "nearby") return null;
  if (now - snapshot.at > NEARBY_SNAPSHOT_MAX_AGE_MS) return null;
  if (snapshot.view.onTheMat.has(athleteId)) return null;
  return snapshot.view.close.get(athleteId) ?? null;
}

/** `closeRowIn` over the live snapshot, for the viewer `viewerId`. */
export function useNearbyCloseRow(
  athleteId: string | null | undefined,
  viewerId: string | null | undefined,
): ArenaCloseRow | null {
  const snapshot = useSyncExternalStore(subscribe, getLatest, getLatest);
  return closeRowIn(snapshot, athleteId, viewerId);
}

/** Tests only: seed the snapshot. */
export function __setLatestNearbyForTests(
  view: ArenaNearbyView | null,
  athleteId: string | null = null,
  at: number = Date.now(),
): void {
  latest = view ? { view, athleteId, at } : null;
  notify();
}

/** Tests only: read the snapshot. */
export function __getLatestNearbyForTests(): NearbySnapshot | null {
  return latest;
}
