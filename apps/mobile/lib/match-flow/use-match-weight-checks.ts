import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { getMatchWeightChecks, type MatchWeightChecks } from "@jits/shared/api/match-weight-checks";

/**
 * idle: not asked (not on the face-off, or not a challenge-backed match).
 * loading: the first read is in flight.
 * ready: `state` holds the DB's weight checks.
 * unavailable: the match has no checks (no challenge, an older backend, or
 *   the first read failed). The face-off falls back to its pre-check flow;
 *   start_match still enforces any flag server side.
 */
export type WeightChecksStatus = "idle" | "loading" | "ready" | "unavailable";

export interface WeightChecksHandle {
  status: WeightChecksStatus;
  state: MatchWeightChecks | null;
  /** Re-read the DB (after weight_changed, a failed start, a foreground). */
  refetch: () => void;
  /** Take the payload a check / reweigh call returned. */
  apply: (next: MatchWeightChecks) => void;
}

export const NO_WEIGHT_CHECKS: WeightChecksHandle = {
  status: "unavailable",
  state: null,
  refetch: () => undefined,
  apply: () => undefined,
};

/**
 * The face-off weight checks (jr_be-ahn.4) for one match, kept current by
 * postgres_changes on `match_weight_checks` for this match, a re-read on
 * foreground, and whatever the check / reweigh RPCs return. Every source
 * only ever triggers a full re-read of the RPC; a raw row is never trusted.
 */
export function useMatchWeightChecks(matchId: string, enabled: boolean): WeightChecksHandle {
  const [state, setState] = React.useState<MatchWeightChecks | null>(null);
  const [status, setStatus] = React.useState<WeightChecksStatus>("idle");
  // Only the newest read (or applied payload) wins.
  const seqRef = React.useRef(0);
  const statusRef = React.useRef(status);
  statusRef.current = status;

  React.useEffect(() => {
    seqRef.current += 1;
    setState(null);
    setStatus("idle");
  }, [matchId]);

  const refetch = React.useCallback(() => {
    const seq = ++seqRef.current;
    if (statusRef.current === "idle") setStatus("loading");
    void Promise.resolve()
      .then(() => getMatchWeightChecks(supabase, matchId))
      .then((res) => {
        if (seq !== seqRef.current) return;
        if (res.ok) {
          setState(res.data);
          setStatus("ready");
        } else if (statusRef.current !== "ready") {
          // A later failure keeps the last good state.
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (seq === seqRef.current && statusRef.current !== "ready") setStatus("unavailable");
      });
  }, [matchId]);

  const apply = React.useCallback(
    (next: MatchWeightChecks) => {
      if (next.matchId !== matchId) return;
      seqRef.current += 1;
      setState(next);
      setStatus("ready");
    },
    [matchId],
  );

  React.useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);

  React.useEffect(() => {
    if (!enabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`match-weight-checks:${matchId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "match_weight_checks", filter: `match_id=eq.${matchId}` },
          () => refetch(),
        )
        .subscribe();
    } catch (err) {
      // Best effort: the foreground re-read and the RPC payloads cover.
      console.warn("[match-flow] weight check listener unavailable", err);
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, matchId, refetch]);

  React.useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") refetch();
    });
    // Optional: the test renderer's AppState may return no subscription.
    return () => sub?.remove?.();
  }, [enabled, refetch]);

  return React.useMemo(() => ({ status, state, refetch, apply }), [status, state, refetch, apply]);
}
