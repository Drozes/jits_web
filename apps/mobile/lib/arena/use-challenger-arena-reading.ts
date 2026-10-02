/**
 * The challenger's `arena` reading while it waits (jr_be 016 addendum,
 * location-flag follow-up M1).
 *
 * With `match_location_required` on, an Arena start fails with HINT
 * `proximity_required` when the CHALLENGER has no fresh reading: a
 * challenger who is not live has no `go_live` reading, and a live one who
 * was in the background for more than 2 minutes has a stale one. So while
 * my outgoing challenge is pending or accepted, the app is in the
 * foreground and I am not in a match, this reports an `arena` reading for
 * that challenge immediately (and on every return to the foreground), then
 * every 60 s.
 *
 * Only with location permission already granted. If it is not granted (and
 * the system can still ask), the waiting state asks ONCE with the Go Live
 * explain copy, then the system prompt; a "Not now" or a denial is respected
 * (the accepter then sees "Waiting for <name>'s location.") until the app
 * comes back from the background or the permission status changes (live
 * location fixes 1c): an iOS "Allow Once" grant lapses in the background
 * and reads as re-askable, so a once-per-process ask would never ask again.
 * Returning from the system prompt never re-arms the ask: on iOS it is
 * "inactive" to "active", and on Android (where the dialog reads as a
 * background) the transition is ignored while the request is in flight.
 */
import * as React from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { permissionRequestInFlight } from "@/lib/invites/location";
import { reportArenaReading } from "./arena-presence";
import { cancelLocationSheet, closeLocationSheet, explainArenaLocation } from "./go-live-location";

/** How often the waiting challenger's reading is refreshed. */
export const CHALLENGER_READING_REFRESH_MS = 60_000;

let askedThisSession = false;
/** The last permission status seen (`granted:canAskAgain`), to spot a change. */
let lastPermissionKey: string | null = null;
/** The app has been in the background since the last "active". */
let wentBackground = false;
let appStateSub: { remove: () => void } | null = null;

/**
 * Re-arm the one ask on every real return from the background (iOS may pass
 * through "inactive" on the way back, so the background is remembered).
 */
function watchForeground(): void {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", (next) => {
    // Android's permission dialog pauses the activity ("background" then
    // "active"): a Deny there must not re-arm the ask it just answered.
    if (next === "background") {
      if (!permissionRequestInFlight()) wentBackground = true;
    }
    else if (next === "active" && wentBackground) {
      wentBackground = false;
      askedThisSession = false;
    }
  });
}

/** Tests only. */
export function __resetChallengerArenaReadingForTests(): void {
  askedThisSession = false;
  lastPermissionKey = null;
  wentBackground = false;
  appStateSub?.remove();
  appStateSub = null;
}

/** Tests only. */
export function __askedThisSessionForTests(): boolean {
  return askedThisSession;
}

async function permission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return { granted: Boolean(p.granted), canAskAgain: Boolean(p.canAskAgain) };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/**
 * `challengeId`: my outgoing pending/accepted challenge, or null.
 * `active`: the flag is on and I am not in a match.
 */
export function useChallengerArenaReading(challengeId: string | null, active: boolean): void {
  const idRef = React.useRef(challengeId);
  idRef.current = challengeId;
  const inflight = React.useRef(false);

  const tick = React.useCallback(async (id: string) => {
    if (inflight.current || AppState.currentState !== "active") return;
    inflight.current = true;
    try {
      const perm = await permission();
      const key = `${perm.granted}:${perm.canAskAgain}`;
      if (lastPermissionKey !== null && key !== lastPermissionKey) askedThisSession = false;
      lastPermissionKey = key;
      if (perm.granted) {
        await reportArenaReading(id, { ask: false });
        return;
      }
      if (askedThisSession || !perm.canAskAgain) return;
      askedThisSession = true;
      if (!(await explainArenaLocation())) return;
      try {
        // Still waiting on the same challenge after the explain.
        if (idRef.current === id) await reportArenaReading(id, { ask: true });
      } finally {
        closeLocationSheet();
      }
    } finally {
      inflight.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!active || !challengeId) return;
    watchForeground();
    void tick(challengeId);
    const t = setInterval(() => void tick(challengeId), CHALLENGER_READING_REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void tick(challengeId);
    });
    return () => {
      clearInterval(t);
      sub.remove();
      // The wait ended (answered, cancelled, a match, the flag off): an
      // explain still up for it is moot, and must not linger over the app.
      cancelLocationSheet("arena");
    };
  }, [active, challengeId, tick]);
}
