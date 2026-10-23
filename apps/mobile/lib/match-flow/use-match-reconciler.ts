import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { superviseChannel } from "@/lib/supabase/supervise-channel";
import {
  getMatchConfirmations,
  getMatchDetails,
  getMatchDetailsWithConfirmations,
  type MatchDetails,
} from "@jits/shared/api/queries";
import { pollIntervalFor, type ReconcileRoles } from "./reconcile";
import type { MatchStep } from "./step-router";

export interface ReconcileSnapshot {
  match: MatchDetails;
  /**
   * Who has positively confirmed the result (`readSnapshot`). Null when the
   * confirmations read failed (unknown, not "nobody").
   */
  confirmedAthleteIds: string[] | null;
}

interface UseMatchReconcilerParams {
  matchId: string;
  /** The wizard's current step; null until the first load. */
  step: MatchStep | null;
  /** False until the match is loaded and this viewer has a role in it. */
  enabled: boolean;
  /**
   * The viewer's mode and role, for the poll cadence (`pollIntervalFor`) and
   * where the confirmations are read from (`readSnapshot`). Null or absent
   * polls on the two-athlete intervals and reads as an athlete.
   */
  roles?: Pick<ReconcileRoles, "mode" | "viewer"> | null;
  /**
   * The timekeeper's done screen can no longer change (`timekeeperDoneSettled`):
   * its poll stops. Absent or false polls as before.
   */
  doneSettled?: boolean;
  /** Called with every snapshot newer than the last one applied. */
  onSnapshot: (snapshot: ReconcileSnapshot) => void;
}

/** Per-mount suffix: `supabase.channel(topic)` hands back a live duplicate. */
let channelSeq = 0;

/**
 * One read of the match and of who has confirmed it. An athlete, in either
 * mode, reads the `match_confirmations` table next to the match, exactly as
 * the two-athlete flow always has. The seated timekeeper of a timekeeper-mode
 * match cannot: that table's RLS admits participants only and the timekeeper
 * is never one (spec 4.4), so the read would be [] for them, with no error,
 * whatever the athletes did. They take the confirmations `get_match_details`
 * returns (SECURITY DEFINER, readable by the seated timekeeper), from the same
 * call as the match: the done screen's per-athlete confirm progress (spec 4.2
 * Confirm, TK-ED6).
 */
async function readSnapshot(
  matchId: string,
  asTimekeeper: boolean,
): Promise<[MatchDetails | null, string[] | null]> {
  if (asTimekeeper) {
    const read = await getMatchDetailsWithConfirmations(supabase, matchId);
    return [read?.match ?? null, read?.confirmations?.map((c) => c.athlete_id) ?? null];
  }
  return Promise.all([getMatchDetails(supabase, matchId), getMatchConfirmations(supabase, matchId)]);
}

/**
 * Decides WHEN the wizard re-reads the authoritative match state; the pure
 * `planReconcile` in `reconcile.ts` decides what that state means.
 *
 * The wizard advances on per-step broadcasts, and a missed broadcast used to
 * strand a side for good. This re-fetches the match and its confirmations
 * (`readSnapshot`: the seated timekeeper reads them through
 * `get_match_details`, everyone else as always) on:
 *   (a) the app returning to the foreground (jits-vh7m),
 *   (b) a step channel reporting SUBSCRIBED, i.e. every join and every
 *       rejoin after an outage (jits-bmei), wired through `reconcileNow`,
 *   (c) a modest poll, only on steps that wait on the other side (ready,
 *       result, confirm) plus a slower one on live, and in timekeeper mode
 *       also on crew, weight and the timekeeper's summary until nothing
 *       on it can change (`pollIntervalFor`, `doneSettled`), only while the
 *       app is in the foreground,
 *   (d) every step change, including the first mount,
 *   (e) a `matches` row UPDATE (below).
 *
 * At most one fetch is in flight; a trigger that lands meanwhile schedules
 * exactly one trailing fetch. A response older than one already applied is
 * dropped, and the plan it feeds only ever moves forward (or back only where
 * `step-transitions.ts` allows), so a stale read can never undo a newer
 * broadcast-driven step. Nothing here mutates the match.
 */
export function useMatchReconciler({ matchId, step, enabled, roles, doneSettled = false, onSnapshot }: UseMatchReconcilerParams) {
  const onSnapshotRef = React.useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const asTimekeeperRef = React.useRef(false);
  asTimekeeperRef.current = roles?.mode === "timekeeper" && roles.viewer === "timekeeper";
  const state = React.useRef({ inFlight: false, again: false, seq: 0, applied: 0, mounted: true });
  const [appActive, setAppActive] = React.useState(AppState.currentState !== "background");

  React.useEffect(() => {
    const s = state.current;
    s.mounted = true;
    return () => {
      s.mounted = false;
    };
  }, []);

  const reconcileNow = React.useCallback(() => {
    const s = state.current;
    if (!s.mounted || !enabledRef.current) return;
    if (s.inFlight) {
      s.again = true;
      return;
    }
    s.inFlight = true;
    const seq = ++s.seq;
    void (async () => {
      try {
        const [match, confirmedAthleteIds] = await readSnapshot(matchId, asTimekeeperRef.current);
        if (!s.mounted || !match || seq <= s.applied) return;
        s.applied = seq;
        onSnapshotRef.current({ match, confirmedAthleteIds: confirmedAthleteIds ?? null });
      } catch (err) {
        // Best effort: the next trigger tries again.
        console.warn("[match-flow] reconcile failed", err);
      } finally {
        s.inFlight = false;
        if (s.again && s.mounted) {
          s.again = false;
          reconcileNow();
        }
      }
    })();
  }, [matchId]);

  // (d) every step change, and the first one once the match is in hand.
  React.useEffect(() => {
    if (enabled && step) reconcileNow();
  }, [enabled, step, reconcileNow]);

  // (e) the `matches` row changed. `matches` is in the realtime publication
  // (jr_be 20260925120100) and its SELECT policy admits both athletes and
  // the seated timekeeper, so this fires for every phone in the match. It
  // only ever triggers a re-read: a raw row event is never trusted to move a
  // step, because `completed` fires at RECORD time, before anyone has
  // confirmed (and in timekeeper mode a broadcast or a row never changes
  // state by itself, M-R8).
  //
  // Supervised like the open-match channel (jits-fa9x): a server close
  // rebuilds it, and every SUBSCRIBED after the first re-reads, because an
  // UPDATE may have landed while it was down. The match screen is held awake
  // on ready and live, so no foreground would restart a channel that gave
  // up: it keeps rebuilding (at the last delay) while the wizard is mounted.
  React.useEffect(() => {
    if (!enabled) return;
    let joined = false;
    let supervised: (() => void) | null = null;
    try {
      supervised = superviseChannel(
        "match row",
        () =>
          supabase
            .channel(`match-row:${matchId}:${++channelSeq}`)
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
              () => reconcileNow(),
            ),
        () => {
          if (joined) reconcileNow();
          joined = true;
        },
        // Never gives up, so it needs no foreground restart of its own; the
        // foreground re-read is (a) below.
        { keepRetrying: () => true, resumeOnForeground: false },
      );
    } catch (err) {
      // Best effort: polling and the other triggers cover without it.
      console.warn("[match-flow] match row listener unavailable", err);
    }
    return () => supervised?.();
  }, [enabled, matchId, reconcileNow]);

  // (a) foreground.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const active = next === "active";
      setAppActive(active);
      if (active) reconcileNow();
    });
    return () => sub.remove();
  }, [reconcileNow]);

  // (c) poll, only while waiting on the other side and in the foreground.
  const interval = pollIntervalFor(step, roles, doneSettled);
  React.useEffect(() => {
    if (!enabled || !appActive || interval == null) return;
    const id = setInterval(reconcileNow, interval);
    return () => clearInterval(id);
  }, [enabled, appActive, interval, reconcileNow]);

  // (b) a step channel (re)joined: anything sent while it was down is gone.
  const onChannelStatus = React.useCallback(
    (status: string) => {
      if (status === "SUBSCRIBED") reconcileNow();
    },
    [reconcileNow],
  );

  return { reconcileNow, onChannelStatus };
}
