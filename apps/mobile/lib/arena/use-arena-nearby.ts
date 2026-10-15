/**
 * Arena "On the mat" by proximity and "Online & close", jr_be 016
 * addendum (contract-arena-nearby.md sections 1 and 3); ranges and bands are
 * server-driven since jr_be spec 023 (2 km and three bands before it).
 *
 * While the Arena is focused and the app is in the foreground this reads
 * `get_arena_nearby()` on focus, every 60 s, on return to the foreground,
 * and (debounced) whenever the lobby set, the live state or the flag
 * changes. Before each read, a NON-live viewer with the flag on and location
 * permission ALREADY granted reports a `browse` reading (never asks: if
 * permission is not granted the server answers `no_location` and the Arena
 * shows today's list). The server refuses browse readings more often than
 * once per 30 s, so one is sent at most every 30 s.
 *
 * The result is either `nearby` (two id lists) or `fallback`: flag off, no
 * usable location, a refused browse reading, or any RPC failure all mean
 * today's behaviour (every live athlete under On the mat, no Online & close section).
 * Coordinates are sent once per reading and never kept on the device.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import {
  getArenaNearby,
  reportBrowsePresence,
  type ArenaCloseRow,
  type ArenaRanges,
} from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";
import { getDeviceLocationOwner, recordAcceptedReading } from "@/lib/location/device-location-store";
import { markMatchLocationRequired } from "./match-location-flag";

/** How often the nearby lists are re-read while the Arena is focused. */
export const ARENA_NEARBY_REFRESH_MS = 60_000;
/** A lobby / live change waits this long, so a burst is one read. */
export const ARENA_NEARBY_DEBOUNCE_MS = 1_500;
/** The server's browse rate limit (one per 30 s per athlete). */
export const BROWSE_MIN_INTERVAL_MS = 30_000;

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

export const NEARBY_FALLBACK: ArenaNearbyView = { mode: "fallback" };

// ---------------------------------------------------------------------------
// The latest nearby view, app-wide (jr_be spec 023 section 8.4): the incoming
// challenge prompt is mounted outside the Arena screen and reads it to tell
// whether a challenger is in the viewer's own Online & close list. Kept in
// memory only, never persisted.
// ---------------------------------------------------------------------------

/**
 * How old the last read may be before nothing is concluded from it. The
 * Arena re-reads every 60 s while focused; away from it the list goes stale,
 * and an old list must not label a challenger who has since moved.
 */
export const NEARBY_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

export interface NearbySnapshot {
  view: ArenaNearbyView;
  /** `Date.now()` when the view was read. */
  at: number;
}

let latestNearby: NearbySnapshot | null = null;
const latestListeners = new Set<() => void>();

function publishLatestNearby(view: ArenaNearbyView): void {
  latestNearby = { view, at: Date.now() };
  for (const l of latestListeners) l();
}

function subscribeLatestNearby(cb: () => void): () => void {
  latestListeners.add(cb);
  return () => {
    latestListeners.delete(cb);
  };
}

function getLatestNearby(): NearbySnapshot | null {
  return latestNearby;
}

/** The athlete's close row in a snapshot, or null (not close, fallback, or stale). */
export function closeRowIn(
  snapshot: NearbySnapshot | null,
  athleteId: string | null | undefined,
  now: number = Date.now(),
): ArenaCloseRow | null {
  if (!snapshot || !athleteId || snapshot.view.mode !== "nearby") return null;
  if (now - snapshot.at > NEARBY_SNAPSHOT_MAX_AGE_MS) return null;
  if (snapshot.view.onTheMat.has(athleteId)) return null;
  return snapshot.view.close.get(athleteId) ?? null;
}

/**
 * The athlete's row in the viewer's latest Online & close list, or null when
 * they are not in it (on the mat, not listed, a fallback mode, or a read
 * older than `NEARBY_SNAPSHOT_MAX_AGE_MS`).
 */
export function useNearbyCloseRow(athleteId: string | null | undefined): ArenaCloseRow | null {
  const snapshot = useSyncExternalStore(subscribeLatestNearby, getLatestNearby, getLatestNearby);
  return closeRowIn(snapshot, athleteId);
}

/** Tests only: seed the app-wide snapshot. */
export function __setLatestNearbyForTests(view: ArenaNearbyView | null, at: number = Date.now()): void {
  latestNearby = view ? { view, at } : null;
  for (const l of latestListeners) l();
}

// Module scope, so a remount (tab switch) does not trip the server's limit.
let lastBrowseAt = 0;

/** Tests only. */
export function __resetArenaNearbyForTests(): void {
  lastBrowseAt = 0;
  latestNearby = null;
  for (const l of latestListeners) l();
  closeExpanded = false;
  for (const l of expandListeners) l();
}

async function permissionGranted(): Promise<boolean> {
  try {
    return Boolean((await Location.getForegroundPermissionsAsync()).granted);
  } catch {
    return false;
  }
}

/** One browse reading, only with permission already granted. Never asks. */
async function reportBrowseReading(): Promise<void> {
  if (Date.now() - lastBrowseAt < BROWSE_MIN_INTERVAL_MS) return;
  if (!(await permissionGranted())) return;
  lastBrowseAt = Date.now();
  // Stored only for the athlete the request was made for (N2).
  const athleteId = getDeviceLocationOwner();
  const loc = await readLocationOnce({ ask: false });
  if (loc.status !== "ok") return;
  const res = await reportBrowsePresence(supabase, loc.reading);
  // A refusal (accuracy, rate limit, implausible jump) leaves no fresh
  // reading: the nearby read then says `no_location`, which is today's list.
  if (!res.ok) console.warn("[location] browse reading failed:", res.error.hint, res.error.message);
  // Accepted: the athlete's last location on the device (instant go-live 4.1).
  else recordAcceptedReading("browse", loc.reading, loc.capturedAt ?? Date.now(), res.data, athleteId);
}

export interface UseArenaNearbyInput {
  /** The Arena tab is focused. Nothing is read otherwise. */
  focused: boolean;
  isLive: boolean;
  /** `match_location_required` as the app knows it (browse only when on). */
  locationRequired: boolean;
  /** Changes whenever the lobby set changes (a stable key, not the Set). */
  lobbyKey: string;
}

export function useArenaNearby({ focused, isLive, locationRequired, lobbyKey }: UseArenaNearbyInput): ArenaNearbyView {
  const [view, setView] = React.useState<ArenaNearbyView>(NEARBY_FALLBACK);
  const inputRef = React.useRef({ focused, isLive, locationRequired });
  inputRef.current = { focused, isLive, locationRequired };
  const mounted = React.useRef(true);
  const inflight = React.useRef(false);
  const again = React.useRef(false);

  const run = React.useCallback(async () => {
    if (!inputRef.current.focused || AppState.currentState !== "active") return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const { isLive: live, locationRequired: flagOn } = inputRef.current;
      // A live viewer already has a fresh go_live reading (60 s refresh).
      if (flagOn && !live) await reportBrowseReading();
      const res = await getArenaNearby(supabase);
      // The server's mode is the flag as it is right now: `flag_off` means
      // the owner turned it off (the client may still think it on), any
      // other mode means it is on. Either reaches every flag reader at once.
      if (res.ok) markMatchLocationRequired(res.data.mode !== "flag_off");
      if (!mounted.current) return;
      if (res.ok && res.data.mode === "nearby") {
        const next: ArenaNearbyView = {
          mode: "nearby",
          onTheMat: new Set(res.data.onTheMat),
          close: new Map(res.data.close.map((c) => [c.athleteId, c])),
          ranges: res.data.ranges,
        };
        setView(next);
        publishLatestNearby(next);
      } else {
        if (!res.ok) console.warn("[arena] get_arena_nearby failed:", res.error.hint, res.error.message);
        setView(NEARBY_FALLBACK);
        publishLatestNearby(NEARBY_FALLBACK);
      }
    } finally {
      inflight.current = false;
      if (again.current && mounted.current) {
        again.current = false;
        void run();
      }
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Focus: read now, then every 60 s, and on every return to the foreground.
  React.useEffect(() => {
    if (!focused) return;
    void run();
    const t = setInterval(() => void run(), ARENA_NEARBY_REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void run();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [focused, run]);

  // Presence, live or flag changes: one debounced read. The first render is
  // covered by the focus read above.
  const first = React.useRef(true);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!focused || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, ARENA_NEARBY_DEBOUNCE_MS);
  }, [lobbyKey, isLive, locationRequired, focused, run]);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return view;
}

// ---------------------------------------------------------------------------
// "Online & close" expanded state: collapsed by default, remembered for the
// app session (module scope), never persisted.
// ---------------------------------------------------------------------------

let closeExpanded = false;
const expandListeners = new Set<() => void>();

export function useCloseSectionExpanded(): [boolean, () => void] {
  const expanded = useSyncExternalStore(
    (cb) => {
      expandListeners.add(cb);
      return () => {
        expandListeners.delete(cb);
      };
    },
    () => closeExpanded,
    () => closeExpanded,
  );
  const toggle = React.useCallback(() => {
    closeExpanded = !closeExpanded;
    for (const l of expandListeners) l();
  }, []);
  return [expanded, toggle];
}
