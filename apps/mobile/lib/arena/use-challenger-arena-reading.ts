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
 * the system can still ask), the waiting state asks ONCE per app session
 * with the Go Live explain copy, then the system prompt; a "Not now" or a
 * denial is respected for the rest of the session (the accepter then sees
 * "Waiting for <name>'s location.").
 */
import * as React from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reportArenaReading } from "./arena-presence";
import { cancelLocationSheet, closeLocationSheet, explainArenaLocation } from "./go-live-location";

/** How often the waiting challenger's reading is refreshed. */
export const CHALLENGER_READING_REFRESH_MS = 60_000;

let askedThisSession = false;

/** Tests only. */
export function __resetChallengerArenaReadingForTests(): void {
  askedThisSession = false;
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
