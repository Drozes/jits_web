import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { pauseMatch, resumeMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";
import type { DomainError } from "@jits/shared/api/errors";
import type { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
// From the protocol module, not the hook module: tests mock the hook module.
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SEND_GRACE_MS, useMatchSyncContext } from "./match-sync-context";
import type { MatchCaps } from "./match-roles";
import { PRESS_COPY } from "./press-copy";
import { useSendCeiling } from "./send-timing";
import { clockMovedOn, endClockAsTimekeeper } from "./timekeeper-actions";
import { useTimekeeperLiveLeave } from "./use-timekeeper-live-leave";
import type { useSessionMatchTimer } from "@jits/shared/hooks/use-session-match-timer";

type Sync = ReturnType<typeof useSessionMatchSync>;
type Timer = ReturnType<typeof useSessionMatchTimer>;
type Action = "pause" | "resume" | "end" | "leave";

/** How the clock's end travels from this phone (`roles.caps.endVia`). */
export type EndVia = MatchCaps["endVia"];

/**
 * Server ends (`end_match_clock`) the auto-end at 00:00 tries before it
 * stops retrying a failure (a network error). The server ends the clock at
 * full time itself, and the reconciler then moves the timekeeper on.
 */
export const MAX_AUTO_END_ATTEMPTS = 3;

interface UseLiveControlsParams {
  matchId: string;
  timer: Timer;
  sync: Sync;
  endedRef: React.MutableRefObject<boolean>;
  /** Called with the pause-aware clock reading taken at the End tap. */
  onEnded: (elapsedSeconds: number) => void;
  /**
   * How this phone ends the clock (timekeeper mode ARCHITECTURE 2.3, "End").
   * Default "broadcast": today's two-athlete end, a `match_ended` broadcast
   * and nothing on the server. "end_match_clock": the timekeeper's end, the
   * `end_match_clock` RPC first and then `match_ended` with `actor_id`. null:
   * this phone never ends the clock (a timekeeper-mode athlete): End does
   * nothing.
   */
  endVia?: EndVia;
  /** The timekeeper left while the clock ran (a no contest): stop what the live step runs (the recorder). */
  onLeftSeat?: () => void;
}

/**
 * Encapsulates the live-match buttons (pause, resume, end and, for a
 * timekeeper, Leave through `useTimekeeperLiveLeave`) plus busy-state
 * debouncing, toast error surfaces and the end's view state (`ended`, and
 * the re-arm after a failed server end), so the live step keeps only its
 * view, its clock and its effects.
 *
 * Timekeeper mode (the sync context's `timekeeperModeSelfId`): every clock
 * broadcast this phone sends names it as `actor_id`, so the other phones can
 * name who ran the clock; a two-athlete match sends exactly the payloads it
 * always did. In timekeeper mode a broadcast is only a hint: the receivers
 * re-read the DB (M-R8), which `end_match_clock`, `pause_match` and
 * `resume_match` have already changed by the time the broadcast goes out.
 * PM29: on a server-run clock a pause or resume is bounded
 * (`SEND_CEILING_MS`): a dead call kept every control disabled, End too,
 * until the server's auto-end at full time. At the ceiling it ends as a
 * failure and the controls come back; a retry is safe, since the
 * already-paused and not-paused recoveries below read the DB and apply its
 * state, and the DB reads resync the clock if the late call landed.
 */
export function useLiveControls({
  matchId,
  timer,
  sync,
  endedRef,
  onEnded,
  endVia = "broadcast",
  onLeftSeat,
}: UseLiveControlsParams) {
  const { reconcileNow, timekeeperModeSelfId: actorId } = useMatchSyncContext();
  const ceiling = useSendCeiling();
  const [busy, setBusyState] = React.useState<Action | null>(null);
  // The leave confirmation lands later than the render that showed it.
  const busyRef = React.useRef<Action | null>(null);
  const setBusy = React.useCallback((next: Action | null) => {
    busyRef.current = next;
    setBusyState(next);
  }, []);
  // `endedRef` is the one-shot guard; this state only makes the ended look
  // (ENDING, dimmed buttons) render, since a ref change alone does not.
  const [ended, setEnded] = React.useState(false);
  /** Server ends that failed (a network error): each one offers a fresh hold, and the auto-end stops retrying at MAX_AUTO_END_ATTEMPTS. */
  const [endFailures, setEndFailures] = React.useState(0);
  // Read through a ref: handleEnd does not re-memoise on every clock tick.
  const elapsedRef = React.useRef(timer.elapsed);
  elapsedRef.current = timer.elapsed;

  /**
   * The timekeeper's end: `end_match_clock`, then `match_ended` with the
   * actor, then the result. A refusal that means the clock is no longer
   * running here (the server's own auto-end at full time, a no contest)
   * leaves the controls ended and re-reads, so the DB moves the screen; a
   * failure that changed nothing offers the hold again.
   */
  const endOnServer = React.useCallback(
    async (elapsed: number) => {
      const outcome = await endClockAsTimekeeper(matchId, elapsed);
      if (outcome === "ended") {
        await settleWithin(actorId ? sync.broadcastMatchEnded(actorId) : sync.broadcastMatchEnded(), SEND_GRACE_MS);
        setBusy(null);
        onEnded(elapsed);
        return;
      }
      if (outcome === "failed") {
        // Nothing changed on the server: offer the hold again.
        endedRef.current = false;
        setEnded(false);
        setEndFailures((n) => n + 1);
      }
      setBusy(null);
      reconcileNow();
    },
    [actorId, endedRef, matchId, onEnded, reconcileNow, setBusy, sync],
  );

  const handleEnd = React.useCallback(() => {
    if (endedRef.current || busy || endVia === null) return;
    endedRef.current = true;
    setEnded(true);
    // The finish time is the moment of the tap, not after the broadcast settles.
    const elapsed = elapsedRef.current;
    setBusy("end");
    if (endVia === "end_match_clock") {
      void endOnServer(elapsed);
      return;
    }
    // Do NOT call end_match here. end_match flips the match to 'completed',
    // but record_match_result (the next step) requires status='in_progress'
    // and would fail with invalid_status, so the result + ELO would never be
    // recorded (jits-ait). The match stays 'in_progress' through result entry;
    // record_match_result is what completes it (and the
    // trg_release_session_participants trigger still releases participants on
    // the in_progress -> completed transition). This mirrors the web flow,
    // which goes start -> record with no end_match in between. We only need to
    // stop the local timer, tell the opponent, and advance to result entry.
    //
    // Advancing unmounts this step and removes the channel carrying
    // match_ended, so let the broadcast leave the device first (bounded):
    // a lost match_ended strands the opponent on the live timer
    // (jits-mzfu). `busy` disables the controls meanwhile.
    void settleWithin(sync.broadcastMatchEnded(), SEND_GRACE_MS).then(() => {
      setBusy(null);
      onEnded(elapsed);
    });
  }, [busy, endVia, endOnServer, endedRef, onEnded, setBusy, sync]);

  /**
   * A pause or resume that failed: the shipped toast. On a server-run clock
   * (the timekeeper) the refusal may come from a timekeeper-mode branch whose
   * text is the server's own (the clock already ended at full time), which a
   * timekeeper-mode screen never shows (M-R4), and a re-read so the DB moves
   * the screen if the match moved on. A refusal that says the clock is no
   * longer running here (`clockMovedOn`: the clock ended, a no contest, the
   * seat gone) is the shipped title alone, which is true; anything the screen
   * cannot explain (a network error, no reply within the ceiling, an unknown
   * refusal, or an already-state refusal whose recovery read failed,
   * `unread`) adds `Check your connection and try again.` (PM29).
   */
  const failed = React.useCallback(
    (title: string, error: DomainError, unread: boolean) => {
      if (endVia === "broadcast") {
        toast.error({ text1: title, description: error.message });
        return;
      }
      toast.error(!unread && clockMovedOn(error) ? { text1: title } : { text1: title, description: PRESS_COPY.checkConnection });
      reconcileNow();
    },
    [endVia, reconcileNow],
  );

  /** A pause or resume call: on a server-run clock bounded by the ceiling (PM29); the two-athlete clock calls as shipped. */
  const send = React.useCallback(
    <T,>(call: Promise<T>) => (endVia === "broadcast" ? call : ceiling.within(call)),
    [ceiling, endVia],
  );

  const handlePauseResume = React.useCallback(async () => {
    if (busy || endedRef.current) return;
    if (timer.paused) {
      setBusy("resume");
      const res = await send(resumeMatch(supabase, matchId));
      setBusy(null);
      // The match ended while the RPC was in flight (the opponent's
      // match_ended): apply nothing, broadcast nothing, toast nothing.
      if (endedRef.current) return;
      // Set when the recovery read below fails: this phone then cannot tell what the clock is doing.
      let unread = false;
      if (!res.ok && res.error.code === "MATCH_NOT_PAUSED") {
        // The match is already running (a resume we missed, e.g. the
        // opponent's broadcast was lost). Take the running state from the
        // DB rather than leaving this timer paused behind an error toast.
        const fresh = await getMatchDetails(supabase, matchId);
        if (endedRef.current) return;
        if (fresh && fresh.status === "in_progress" && !fresh.paused_at) {
          timer.syncFromBroadcast({
            type: "resumed",
            totalPausedDuration: fresh.total_paused_duration,
          });
          return;
        }
        unread = fresh == null;
      }
      if (!res.ok) {
        failed("Couldn't resume", res.error, unread);
        return;
      }
      timer.syncFromBroadcast({ type: "resumed", totalPausedDuration: res.data.total_paused_duration });
      if (actorId) sync.broadcastTimerResumed(res.data.total_paused_duration, actorId);
      else sync.broadcastTimerResumed(res.data.total_paused_duration);
    } else {
      setBusy("pause");
      const res = await send(pauseMatch(supabase, matchId));
      setBusy(null);
      if (endedRef.current) return;
      let unread = false;
      if (!res.ok && res.error.code === "MATCH_NOT_IN_PROGRESS") {
        // pause_match maps "already paused" here (as well as a match that is
        // no longer running). Mirror of the resume recovery above: if the DB
        // says it is paused, this device missed the opponent's pause, so
        // apply it through the tracked timer instead of toasting. No
        // broadcast: the opponent paused it and already knows.
        const fresh = await getMatchDetails(supabase, matchId);
        if (endedRef.current) return;
        if (fresh && fresh.status === "in_progress" && fresh.paused_at) {
          timer.syncFromBroadcast({ type: "paused", pausedAt: fresh.paused_at });
          return;
        }
        unread = fresh == null;
      }
      if (!res.ok) {
        failed("Couldn't pause", res.error, unread);
        return;
      }
      timer.syncFromBroadcast({ type: "paused", pausedAt: res.data.paused_at });
      if (actorId) sync.broadcastTimerPaused(res.data.paused_at, actorId);
      else sync.broadcastTimerPaused(res.data.paused_at);
    }
  }, [actorId, busy, endedRef, failed, matchId, send, setBusy, sync, timer]);

  const setLeaving = React.useCallback((leaving: boolean) => setBusy(leaving ? "leave" : null), [setBusy]);
  const handleLeave = useTimekeeperLiveLeave({
    matchId,
    endedRef,
    busyRef,
    setLeaving,
    broadcastMatchCancelled: sync.broadcastMatchCancelled,
    onLeftSeat,
  });

  return {
    busy,
    ended,
    handleEnd,
    handlePauseResume,
    handleLeave,
    endFailures,
    /** This phone may auto-end at 00:00: it ends the clock, and a failing server end has tries left. */
    canAutoEnd: endVia !== null && endFailures < MAX_AUTO_END_ATTEMPTS,
  };
}
