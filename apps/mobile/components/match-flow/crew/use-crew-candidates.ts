import * as React from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase/client";
import {
  getTimekeeperCandidates,
  requestMatchTimekeeper,
  type TimekeeperCandidate,
  type TimekeeperCandidates,
} from "@jits/shared/api/timekeeper";

/** A request this phone just made (`request_match_timekeeper`), before the state shows it. */
export interface AskedRequest {
  requestId: string;
  expiresAt: string;
  invitee: { id: string; displayName: string };
}

/** Refusals that mean the match moved on under the picker (seated, started, cancelled): re-read the match. */
const MATCH_MOVED = new Set(["MATCH_CANCELLED", "MATCH_NOT_PENDING", "TIMEKEEPER_ALREADY_SEATED", "NOT_TIMEKEEPER_MODE"]);

interface Params {
  matchId: string;
  /** A request was sent: the picker shows it until the timekeeper-mode state does. */
  onAsked: (request: AskedRequest) => void;
  /** The match moved on, or another request is open: re-read the match now. */
  onStale: () => void;
}

export interface CrewCandidates {
  candidates: TimekeeperCandidates | null;
  loadError: boolean;
  reload: () => void;
  /** Rows whose Ask was refused because they turned busy (TK-P8, TK-P9), until the next read. */
  busy: Readonly<Record<string, "timekeeper" | "competitor">>;
  /** The athlete whose Ask is in flight. */
  asking: string | null;
  ask: (candidate: TimekeeperCandidate) => void;
}

/**
 * The picker's candidates (`get_timekeeper_candidates`, R3) and its Ask
 * (`request_match_timekeeper`, R4). Read on mount, on the return to the
 * foreground and on demand (Try again, a refusal that changes the list).
 * Each refusal lands where the boards put it: busy on its row, a person who
 * can no longer be asked drops out of a fresh read, and a match that moved
 * on (or a request the other athlete already opened, TK-P20) is re-read.
 * A failed send keeps the row askable (the shipped offline banner explains).
 */
export function useCrewCandidates({ matchId, onAsked, onStale }: Params): CrewCandidates {
  const [candidates, setCandidates] = React.useState<TimekeeperCandidates | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [busy, setBusy] = React.useState<Record<string, "timekeeper" | "competitor">>({});
  const [asking, setAsking] = React.useState<string | null>(null);
  const alive = React.useRef(true);
  const askingRef = React.useRef<string | null>(null);
  const cb = React.useRef({ onAsked, onStale });
  cb.current = { onAsked, onStale };
  React.useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const reload = React.useCallback(() => {
    setLoadError(false);
    void (async () => {
      try {
        const res = await getTimekeeperCandidates(supabase, matchId);
        if (!alive.current) return;
        if (res.ok) {
          setCandidates(res.data);
          setBusy({});
        } else if (MATCH_MOVED.has(res.error.code)) cb.current.onStale();
        else setLoadError(true);
      } catch {
        if (alive.current) setLoadError(true);
      }
    })();
  }, [matchId]);

  React.useEffect(() => {
    reload();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") reload();
    });
    return () => sub?.remove();
  }, [reload]);

  const ask = React.useCallback(
    (c: TimekeeperCandidate) => {
      if (askingRef.current) return;
      askingRef.current = c.athleteId;
      setAsking(c.athleteId);
      void (async () => {
        try {
          const res = await requestMatchTimekeeper(supabase, matchId, c.athleteId);
          if (!alive.current) return;
          if (res.ok) {
            cb.current.onAsked({ ...res.data, invitee: { id: c.athleteId, displayName: c.displayName } });
            return;
          }
          const code = res.error.code;
          if (code === "TIMEKEEPER_BUSY" || code === "ATHLETE_IN_TIMEKEEPER_MATCH") {
            const as = res.error.busyAs ?? (code === "TIMEKEEPER_BUSY" ? "timekeeper" : "competitor");
            setBusy((b) => ({ ...b, [c.athleteId]: as }));
          } else if (code === "TIMEKEEPER_UNAVAILABLE" || code === "TIMEKEEPER_IS_COMPETITOR") reload();
          else if (code === "REQUEST_ALREADY_OPEN" || MATCH_MOVED.has(code)) cb.current.onStale();
        } catch {
          // A failed send: the row stays askable.
        } finally {
          askingRef.current = null;
          if (alive.current) setAsking(null);
        }
      })();
    },
    [matchId, reload],
  );

  return { candidates, loadError, reload, busy, asking, ask };
}
