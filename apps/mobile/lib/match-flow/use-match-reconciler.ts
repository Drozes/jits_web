import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import {
  getMatchConfirmations,
  getMatchDetails,
  type MatchDetails,
} from "@jits/shared/api/queries";
import { pollIntervalFor } from "./reconcile";
import type { MatchStep } from "./step-router";

export interface ReconcileSnapshot {
  match: MatchDetails;
  /** Null when the confirmations read failed (unknown, not "nobody"). */
  confirmedAthleteIds: string[] | null;
}

interface UseMatchReconcilerParams {
  matchId: string;
  /** The wizard's current step; null until the first load. */
  step: MatchStep | null;
  /** False until the match is loaded and this athlete is a participant. */
  enabled: boolean;
  /** Called with every snapshot newer than the last one applied. */
  onSnapshot: (snapshot: ReconcileSnapshot) => void;
}

/**
 * Decides WHEN the wizard re-reads the authoritative match state; the pure
 * `planReconcile` in `reconcile.ts` decides what that state means.
 *
 * The wizard advances on per-step broadcasts, and `postgres_changes` on
 * `matches` do not fire (the table is not in the realtime publication), so a
 * missed broadcast used to strand a side for good. This re-fetches
 * `getMatchDetails` + the match's confirmations on:
 *   (a) the app returning to the foreground (jits-vh7m),
 *   (b) a step channel reporting SUBSCRIBED, i.e. every join and every
 *       rejoin after an outage (jits-bmei), wired through `reconcileNow`,
 *   (c) a modest poll, only on steps that wait on the other side (ready,
 *       result, confirm) plus a slower one on live, and only while the app
 *       is in the foreground,
 *   (d) every step change, including the first mount,
 *   (e) a `matches` row UPDATE, once the backend publishes that table.
 *
 * At most one fetch is in flight; a trigger that lands meanwhile schedules
 * exactly one trailing fetch. A response older than one already applied is
 * dropped, and the plan it feeds only ever moves forward, so a stale read can
 * never undo a newer broadcast-driven step. Nothing here mutates the match.
 */
export function useMatchReconciler({ matchId, step, enabled, onSnapshot }: UseMatchReconcilerParams) {
  const onSnapshotRef = React.useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
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
        const [match, confirmedAthleteIds] = await Promise.all([
          getMatchDetails(supabase, matchId),
          getMatchConfirmations(supabase, matchId),
        ]);
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

  // (e) the `matches` row changed. Dead today (the table is not in the
  // realtime publication) and never relied on; it starts working, as one
  // more trigger, the moment the backend publishes the table. It only ever
  // triggers a re-read: a raw row event is never trusted to move a step,
  // because `completed` fires at RECORD time, before anyone has confirmed.
  React.useEffect(() => {
    if (!enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`match-row:${matchId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
          () => reconcileNow(),
        )
        .subscribe();
    } catch (err) {
      // Best effort: polling and the other triggers cover without it.
      console.warn("[match-flow] match row listener unavailable", err);
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
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
  const interval = pollIntervalFor(step);
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
