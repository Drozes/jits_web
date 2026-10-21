import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import {
  checkAthleteWeightAsTimekeeper,
  type TimekeeperCheckStatus,
  type TimekeeperMatchState,
  type TimekeeperWeightVerdict,
} from "@jits/shared/api/timekeeper";
import { SHIPPED_COPY } from "./timekeeper-copy";
import { useMatchSyncContext } from "./match-sync-context";

/**
 * How long a row stays busy after its verdict succeeded, waiting for the
 * state read (realtime row, or the 4 s poll) to show it. A read that never
 * shows it (the athlete re-weighed meanwhile) frees the row after this.
 */
export const CHECK_ECHO_HOLD_MS = 6_000;

/** What the state shows once the verdict landed (a withdrawn flag reads confirmed). */
const EXPECTED: Record<TimekeeperWeightVerdict, TimekeeperCheckStatus> = {
  confirm: "confirmed",
  flag: "flagged",
  withdraw: "confirmed",
};

/** `calling` while the RPC is in flight, then the status the state should show. */
type Awaiting = Record<string, "calling" | TimekeeperCheckStatus>;

/**
 * The seated timekeeper's weight verdicts (spec R11, A13, A19; COPY-DECK B6):
 * Confirm, Doesn't look right (a flag; it also clears that athlete's ready
 * and blocks the start) and Withdraw flag, per athlete, quoting the rated
 * weight on screen (PM26; the server refuses any other as WEIGHT_CHANGED).
 * The state stays the truth: a row is busy from the tap until the state read
 * shows the verdict (never an optimistic one of its own). A refusal says the
 * shipped `Weight changed` or `Couldn't save your check` once and re-reads
 * the match (`reconcileNow`); the timekeeper-mode state itself (the rows,
 * the rated weights) follows on its realtime rows or its next poll, since
 * the wizard re-reads it at once only on a step change.
 */
export function useTimekeeperChecks({ matchId, state }: { matchId: string; state: TimekeeperMatchState | null }) {
  const { reconcileNow } = useMatchSyncContext();
  const [awaiting, setAwaiting] = React.useState<Awaiting>({});
  const awaitingRef = React.useRef(awaiting);
  awaitingRef.current = awaiting;
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const t = timers.current;
    return () => {
      mountedRef.current = false;
      for (const id of t.values()) clearTimeout(id);
      t.clear();
    };
  }, []);

  const release = React.useCallback((subjectId: string) => {
    const t = timers.current.get(subjectId);
    if (t) clearTimeout(t);
    timers.current.delete(subjectId);
    setAwaiting((prev) => {
      if (!(subjectId in prev)) return prev;
      const { [subjectId]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  // The state shows a verdict we were waiting for: the row is the server's again.
  React.useEffect(() => {
    for (const [subjectId, want] of Object.entries(awaitingRef.current)) {
      if (want === "calling") continue;
      const has = state?.timekeeperChecks.find((c) => c.subjectId === subjectId)?.status ?? null;
      if (has === want) release(subjectId);
    }
  }, [state, release]);

  const check = React.useCallback(
    (subjectId: string, verdict: TimekeeperWeightVerdict, weightSeen: number | null) => {
      if (subjectId in awaitingRef.current) return;
      awaitingRef.current = { ...awaitingRef.current, [subjectId]: "calling" };
      setAwaiting((prev) => ({ ...prev, [subjectId]: "calling" }));
      void (async () => {
        const res = await checkAthleteWeightAsTimekeeper(supabase, {
          matchId,
          subjectId,
          verdict,
          weightSeen: verdict === "withdraw" ? undefined : weightSeen,
        });
        if (!mountedRef.current) return;
        if (!res.ok) {
          release(subjectId);
          if (res.error.code === "WEIGHT_CHANGED") toast.info({ text1: SHIPPED_COPY.weightChanged });
          else toast.error({ text1: SHIPPED_COPY.couldNotSaveCheck });
          reconcileNow();
          return;
        }
        const want = EXPECTED[verdict];
        const shown = stateRef.current?.timekeeperChecks.find((c) => c.subjectId === subjectId)?.status ?? null;
        if (shown === want) {
          release(subjectId);
          return;
        }
        setAwaiting((prev) => ({ ...prev, [subjectId]: want }));
        timers.current.set(
          subjectId,
          setTimeout(() => release(subjectId), CHECK_ECHO_HOLD_MS),
        );
      })();
    },
    [matchId, reconcileNow, release],
  );

  const busy = React.useCallback((subjectId: string) => subjectId in awaiting, [awaiting]);
  return { busy, check };
}
