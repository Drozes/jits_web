import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { markMatchReady } from "@jits/shared/api/timekeeper";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import type { MatchFlowValue } from "./match-flow-context";
import { SHIPPED_COPY } from "./timekeeper-copy";
import { stepSeams } from "./step-seams";
import { deriveAthleteTimekeeperState, type AthleteTimekeeperState } from "./weight-check-view";

/**
 * How long the merged ready stays busy after `mark_match_ready` succeeded,
 * waiting for the state read (realtime row, or the 4 s poll) to show it.
 * A read that never shows it (a re-weigh cleared it meanwhile) frees the
 * button after this.
 */
export const READY_ECHO_HOLD_MS = 6_000;

/** The refusals that mean "your weight is held" (a flag on me): the shipped `Match on hold`. */
const WEIGHT_HOLD: readonly DomainErrorCode[] = ["WEIGHT_FLAGGED", "WEIGHT_CHECK_PENDING", "WEIGHT_RECHECK_PENDING"];

/**
 * The refusals that mean the match moved on (`invalid_status`: it was
 * cancelled; `timekeeper_required`: the timekeeper left): the shipped
 * `Couldn't save your check` alone, which is true, and the re-read moves the
 * screen. Only a failure the screen cannot explain adds `Check your
 * connection and try again.` (PM29, UX spec 5.4).
 */
const MOVED_ON: readonly DomainErrorCode[] = ["MATCH_NOT_PENDING", "TIMEKEEPER_REQUIRED"];

/** A timekeeper-mode athlete's face-off, from the server, plus the merged ready's own state. */
export interface FaceoffTimekeeperView extends AthleteTimekeeperState {
  /** `mark_match_ready` is in flight, or succeeded and the state read does not show it yet. */
  readying: boolean;
  /**
   * The seated timekeeper's short name while the server reads them offline
   * (TK-D7, spec 4.3 "Seated, before start"; `stepSeams(...).faceoff`), else
   * null: online, before the first state read, nobody seated.
   */
  offlineName: string | null;
}

interface MergedReadyParams {
  /** The viewer's match flow; anything but a timekeeper-mode athlete gets no view. */
  flow: Pick<MatchFlowValue, "match" | "roles" | "tkState"> | null | undefined;
  matchId: string;
  /** A refusal: re-read what it was about (the weight checks, the match; the state follows on its own). */
  onRefused: () => void;
}

/**
 * The merged ready of a timekeeper-mode athlete (spec 4.2 Ready, Q2, A13;
 * R12): one tap, "Weight looks right, I'm ready" (TK-F4), confirms this
 * athlete's check of the opponent's weigh-in and marks them ready, in one
 * `mark_match_ready` call. Ready is server state: the view's `meReady` and
 * `opponentReady` are the `match_ready` rows of the timekeeper-mode state,
 * and a successful call holds the button busy until that state shows it
 * (never an optimistic ready of its own). No retry: a refusal says so once
 * (the shipped `Match on hold` for a weight hold, else `Couldn't save your
 * check`, with `Check your connection and try again.` unless the match moved
 * on, PM29) and the caller re-reads the weight checks and the match
 * (`onRefused`); the timekeeper-mode state (the ready rows) follows on its
 * realtime rows or its next poll.
 *
 * Null `view` for a two-athlete match and for the timekeeper (the athletes'
 * face-off provider is mounted for them too, inactive).
 */
export function useMergedReady(p: MergedReadyParams): { view: FaceoffTimekeeperView | null; markReady: () => void } {
  const roles = p.flow?.roles ?? null;
  const me = roles?.caps.readyPolicy === "server_merged" ? roles.me : null;
  const opponent = me ? roles?.opponent ?? null : null;
  const state =
    me && opponent
      ? deriveAthleteTimekeeperState({
          state: p.flow?.tkState ?? null,
          meId: me.athleteId,
          opponentId: opponent.athleteId,
          timekeeperName: roles?.timekeeper?.shortName ?? "",
          // The match's sub-flag snapshot (A19); display only (TK-F2, TK-F3).
          checksWeights: p.flow?.match.tk_weight_check_required === true,
        })
      : null;

  const [phase, setPhase] = React.useState<"idle" | "calling" | "echo">("idle");
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const live = React.useRef({ enabled: false, meReady: false, matchId: p.matchId, onRefused: p.onRefused, mounted: true });
  live.current.enabled = state != null;
  live.current.meReady = state?.meReady ?? false;
  live.current.matchId = p.matchId;
  live.current.onRefused = p.onRefused;

  React.useEffect(() => {
    const l = live.current;
    l.mounted = true;
    return () => {
      l.mounted = false;
    };
  }, []);

  // The state read shows the ready: the server's row takes over.
  const meReady = state?.meReady ?? false;
  React.useEffect(() => {
    if (meReady) setPhase("idle");
  }, [meReady]);

  React.useEffect(() => {
    if (phase !== "echo") return;
    const id = setTimeout(() => setPhase("idle"), READY_ECHO_HOLD_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const markReady = React.useCallback(() => {
    const l = live.current;
    if (!l.enabled || l.meReady || phaseRef.current !== "idle") return;
    phaseRef.current = "calling";
    setPhase("calling");
    void (async () => {
      const res = await markMatchReady(supabase, l.matchId, true);
      if (!l.mounted) return;
      if (res.ok) {
        setPhase(l.meReady ? "idle" : "echo");
        return;
      }
      setPhase("idle");
      if (WEIGHT_HOLD.includes(res.error.code)) toast.info({ text1: SHIPPED_COPY.matchOnHold });
      else if (MOVED_ON.includes(res.error.code)) toast.error({ text1: SHIPPED_COPY.couldNotSaveCheck });
      else toast.error({ text1: SHIPPED_COPY.couldNotSaveCheck, description: SHIPPED_COPY.checkConnection });
      l.onRefused();
    })();
  }, []);

  // TK-D7 before the start: the one seam that reads the timekeeper's presence (M4).
  const offlineName = roles && state ? stepSeams(roles, p.flow?.tkState ?? null).faceoff.timekeeperOfflineName : null;
  return { view: state ? { ...state, readying: phase !== "idle", offlineName } : null, markReady };
}
