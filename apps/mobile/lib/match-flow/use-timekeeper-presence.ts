import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { touchMatchTimekeeper } from "@jits/shared/api/timekeeper";
import type { DomainErrorCode } from "@jits/shared/api/errors";

/** The seated timekeeper's heartbeat cadence (R23; the server reads offline after 60 s without one). */
export const TIMEKEEPER_HEARTBEAT_MS = 15_000;

/**
 * A beat still unsettled this long is presumed lost, and the next tick beats
 * anyway. React Native's Android HTTP client has no timeouts and the
 * Supabase client sets none, so a request on a dead pooled connection (a gym
 * Wi-Fi drop, a switch to cellular) may never settle; an unbounded skip would
 * then silence the seat for good and the athletes would see TK-D7. Between
 * one and two intervals, so a slow beat costs exactly one skipped tick and
 * the next beat leaves 30 s after the lost one, inside the server's 60 s.
 */
export const LOST_BEAT_MS = TIMEKEEPER_HEARTBEAT_MS * 1.5;

/**
 * Refusals that mean this phone is not the seated timekeeper of a pending or
 * live match any more (a pre-start Leave, a no contest, a result): stop.
 * Anything else (a network error) keeps beating.
 */
const SEAT_GONE: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  "NOT_TIMEKEEPER",
  "NOT_PARTICIPANT",
  "NOT_TIMEKEEPER_MODE",
  // `invalid_status`: the match is neither pending nor in progress.
  "MATCH_NOT_PENDING",
]);

/**
 * The seated timekeeper's presence (timekeeper mode spec 4.3, 7; ARCHITECTURE
 * 2.4): `touch_match_timekeeper` at once, then every 15 s, while `seated` and
 * the app is in the foreground. The athletes' phones read the timekeeper as
 * offline 60 s after the last beat (TK-D7), and the server's sweep makes a
 * running match a no contest 10 minutes after that (`timekeeper_offline`).
 *
 * `seated`: this phone is the match's seated timekeeper and the match is
 * pending or in progress; the wizard mounts this once for every step, so the
 * beat spans the face-off, the live screen and the result.
 *
 * Foreground as the app's other presence owners read it: only `background`
 * stops the beat; iOS `inactive` (the notification shade, the app switcher,
 * a system prompt) keeps it (jits_web CLAUDE.md, Realtime & Presence). The
 * return to the foreground beats at once. A refusal that means the seat is
 * gone stops it until `seated` or the match changes. One call at a time: a
 * tick skips while a beat is in flight, unless that beat is older than
 * `LOST_BEAT_MS` (presumed lost); a late settle of a lost beat never clears
 * the gate of the beat that replaced it. At most one beat per tick.
 * A beat writes `match_timekeeper_presence` only, never `matches` (B-R8).
 */
export function useTimekeeperPresence(matchId: string, seated: boolean): void {
  const [foreground, setForeground] = React.useState(() => AppState.currentState !== "background");

  React.useEffect(() => {
    if (!seated) return;
    setForeground(AppState.currentState !== "background");
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => setForeground(next !== "background"));
    return () => sub.remove();
  }, [seated]);

  React.useEffect(() => {
    if (!seated || !foreground) return;
    let stopped = false;
    // The beat in flight (when it left), or null. Each beat settles only its own.
    let inFlight: { since: number } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
    const beat = () => {
      if (stopped) return;
      if (inFlight && Date.now() - inFlight.since < LOST_BEAT_MS) return;
      const mine = { since: Date.now() };
      inFlight = mine;
      const settle = () => {
        if (inFlight === mine) inFlight = null;
      };
      touchMatchTimekeeper(supabase, matchId).then(
        (res) => {
          settle();
          if (!res.ok && SEAT_GONE.has(res.error.code)) stop();
        },
        (err: unknown) => {
          settle();
          console.warn("[match-flow] timekeeper heartbeat failed", err);
        },
      );
    };
    beat();
    timer = setInterval(beat, TIMEKEEPER_HEARTBEAT_MS);
    return stop;
  }, [matchId, seated, foreground]);
}
