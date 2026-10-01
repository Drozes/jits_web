/**
 * Arena "On the mat" by proximity and "Online & close" (2 km), jr_be 016
 * addendum (contract-arena-nearby.md sections 1 and 3).
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
 * today's behaviour (every live athlete under On the mat, no 2 km section).
 * Coordinates are sent once per reading and never kept on the device.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import {
  getArenaNearby,
  reportBrowsePresence,
  type ArenaCloseBand,
} from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";
import { readLocationOnce } from "@/lib/invites/location";
import { markMatchLocationRequired } from "./match-location-flag";

/** How often the nearby lists are re-read while the Arena is focused. */
export const ARENA_NEARBY_REFRESH_MS = 60_000;
/** A lobby / live change waits this long, so a burst is one read. */
export const ARENA_NEARBY_DEBOUNCE_MS = 1_500;
/** The server's browse rate limit (one per 30 s per athlete). */
export const BROWSE_MIN_INTERVAL_MS = 30_000;

export type ArenaNearbyView =
  | { mode: "nearby"; onTheMat: ReadonlySet<string>; close: ReadonlyMap<string, ArenaCloseBand> }
  | { mode: "fallback" };

export const NEARBY_FALLBACK: ArenaNearbyView = { mode: "fallback" };

// Module scope, so a remount (tab switch) does not trip the server's limit.
let lastBrowseAt = 0;

/** Tests only. */
export function __resetArenaNearbyForTests(): void {
  lastBrowseAt = 0;
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
  const loc = await readLocationOnce({ ask: false });
  if (loc.status !== "ok") return;
  const res = await reportBrowsePresence(supabase, loc.reading);
  // A refusal (accuracy, rate limit, implausible jump) leaves no fresh
  // reading: the nearby read then says `no_location`, which is today's list.
  if (!res.ok) console.warn("[location] browse reading failed:", res.error.hint, res.error.message);
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
        setView({
          mode: "nearby",
          onTheMat: new Set(res.data.onTheMat),
          close: new Map(res.data.close.map((c) => [c.athleteId, c.band])),
        });
      } else {
        if (!res.ok) console.warn("[arena] get_arena_nearby failed:", res.error.hint, res.error.message);
        setView(NEARBY_FALLBACK);
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
