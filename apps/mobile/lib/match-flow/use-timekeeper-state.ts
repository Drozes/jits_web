import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { superviseChannel } from "@/lib/supabase/supervise-channel";
import { getTimekeeperMatchState, type TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { ViewerRole } from "./match-roles";
import type { MatchStep } from "./step-router";

/** How often a timekeeper-mode match re-reads its state (review tech M7). */
export const TIMEKEEPER_STATE_POLL_MS = 4_000;

/**
 * The state poll for a step: every step polls but an athlete's verdict
 * (nothing on it reads this state; the reconciler moves an athlete back to
 * confirm after an edit). The timekeeper's `summary` is the done screen,
 * which shows the edit window and the athletes' confirmations.
 */
export function timekeeperStatePollMs(step: MatchStep | null, viewer: ViewerRole | null): number | null {
  if (!step) return null;
  if (step === "summary" && viewer !== "timekeeper") return null;
  return TIMEKEEPER_STATE_POLL_MS;
}

/** The timekeeper-mode tables whose rows change the state (all realtime-published, jr_be 024 2.3). */
const TABLES = ["match_ready", "match_timekeeper_requests", "match_timekeeper_weight_checks"] as const;

interface UseTimekeeperStateParams {
  matchId: string;
  /** True only for a timekeeper-mode match (`roles.mode`); false reads nothing. */
  enabled: boolean;
  /** Poll cadence; null stops the poll (the realtime rows and the foreground still re-read). */
  pollMs: number | null;
}

export interface TimekeeperStateHandle {
  /** Null until the first read lands, while disabled, and for a two-athlete match. */
  state: TimekeeperMatchState | null;
  /**
   * The read refused this viewer (NOT_PARTICIPANT): a timekeeper who is no
   * longer seated, after their own pre-start Leave (spec 6.2, TK-K17).
   */
  lostAccess: boolean;
  /** Re-read now (the wizard calls it whenever a match snapshot moves the step). */
  refresh: () => void;
}

/** Per-mount suffix: `supabase.channel(topic)` hands back a live duplicate. */
let channelSeq = 0;

/**
 * `get_timekeeper_match_state` for a timekeeper-mode match (ARCHITECTURE
 * 2.4): ready rows, checks, the open request, presence, timeouts, the edit
 * window and the Start blockers. Re-read on mount, on a row INSERT or UPDATE
 * in the timekeeper-mode tables (one supervised channel, jits-fa9x), on a
 * poll while in the foreground, on the return to the foreground, and on
 * demand. Supabase Realtime does not deliver a DELETE through a column
 * filter, so a removed row (a re-weigh clearing readies and checks, a flag
 * withdrawn, a drop-out) reaches the state only through the poll or another
 * trigger. A realtime row only triggers a re-read; it never changes the state
 * by itself (M-R8). At most one read is in flight, a trigger meanwhile
 * schedules one trailing read, and an older response never replaces a newer
 * one.
 */
export function useTimekeeperState({ matchId, enabled, pollMs }: UseTimekeeperStateParams): TimekeeperStateHandle {
  const [state, setState] = React.useState<TimekeeperMatchState | null>(null);
  const [lostAccess, setLostAccess] = React.useState(false);
  const [appActive, setAppActive] = React.useState(AppState.currentState !== "background");
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const matchIdRef = React.useRef(matchId);
  matchIdRef.current = matchId;
  const run = React.useRef({ inFlight: false, again: false, seq: 0, applied: 0, mounted: true });

  React.useEffect(() => {
    const r = run.current;
    r.mounted = true;
    return () => {
      r.mounted = false;
    };
  }, []);

  // A different match starts from nothing (and a read of the old one is dropped below).
  React.useEffect(() => {
    setState(null);
    setLostAccess(false);
  }, [matchId]);

  const refresh = React.useCallback(() => {
    const r = run.current;
    if (!r.mounted || !enabledRef.current) return;
    if (r.inFlight) {
      r.again = true;
      return;
    }
    r.inFlight = true;
    const seq = ++r.seq;
    const id = matchIdRef.current;
    void (async () => {
      try {
        const res = await getTimekeeperMatchState(supabase, id);
        if (!r.mounted || seq <= r.applied || id !== matchIdRef.current) return;
        if (res.ok) {
          r.applied = seq;
          setState(res.data);
        } else if (res.error.code === "NOT_PARTICIPANT") {
          r.applied = seq;
          setLostAccess(true);
        }
        // Any other failure keeps the last state; the next trigger tries again.
      } catch (err) {
        console.warn("[match-flow] timekeeper state read failed", err);
      } finally {
        r.inFlight = false;
        if (r.again && r.mounted) {
          r.again = false;
          refresh();
        }
      }
    })();
  }, []);

  // Mount, every time the hook is (re)enabled, and another match.
  React.useEffect(() => {
    if (enabled) refresh();
  }, [enabled, matchId, refresh]);

  // A row of this match changed in a timekeeper-mode table.
  React.useEffect(() => {
    if (!enabled) return;
    let joined = false;
    let supervised: (() => void) | null = null;
    try {
      supervised = superviseChannel(
        "timekeeper state",
        () => {
          let channel = supabase.channel(`timekeeper-state:${matchId}:${++channelSeq}`);
          for (const table of TABLES) {
            channel = channel.on(
              "postgres_changes",
              { event: "*", schema: "public", table, filter: `match_id=eq.${matchId}` },
              () => refresh(),
            );
          }
          return channel;
        },
        () => {
          // The first join follows the mount read; a later one may have missed rows.
          if (joined) refresh();
          joined = true;
        },
        // The match screen is held awake on ready and live, so no foreground
        // would restart a channel that gave up: it never gives up, and so
        // needs no foreground restart of its own.
        { keepRetrying: () => true, resumeOnForeground: false },
      );
    } catch (err) {
      // Best effort: the poll and the other triggers cover without it.
      console.warn("[match-flow] timekeeper state listener unavailable", err);
    }
    return () => supervised?.();
  }, [enabled, matchId, refresh]);

  // The return to the foreground (only while enabled: a two-athlete match
  // registers nothing here).
  React.useEffect(() => {
    if (!enabled) return;
    setAppActive(AppState.currentState !== "background");
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const active = next === "active";
      setAppActive(active);
      if (active) refresh();
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  // The poll, only in the foreground.
  React.useEffect(() => {
    if (!enabled || !appActive || pollMs == null) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [enabled, appActive, pollMs, refresh]);

  return { state: enabled ? state : null, lostAccess: enabled && lostAccess, refresh };
}
