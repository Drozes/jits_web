import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { getSessionLobbyData } from "@jits/shared/api/queries";
import type {
  LobbyParticipant,
  SessionLobbyData,
} from "@jits/shared/types/session";

interface UseSessionLobbyResult {
  data: SessionLobbyData | null;
  isLoading: boolean;
  error: string | null;
  /** Force a re-fetch (e.g. on pull-to-refresh or after a realtime event). */
  refresh: () => void;
  /** Local participant set; updated by realtime + initial fetch. */
  participants: LobbyParticipant[];
  setParticipants: React.Dispatch<React.SetStateAction<LobbyParticipant[]>>;
}

/**
 * Fetches `getSessionLobbyData` and exposes the participant list with
 * setter so the realtime subscription can mutate it locally without a
 * roundtrip. Cancellation gates state writes.
 */
export function useSessionLobby(sessionId: string): UseSessionLobbyResult {
  const [data, setData] = React.useState<SessionLobbyData | null>(null);
  const [participants, setParticipants] = React.useState<LobbyParticipant[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await getSessionLobbyData(supabase, sessionId);
        if (cancelled) return;
        if (!result.ok) {
          console.error("[session-lobby] lobby fetch failed", {
            sessionId,
            code: result.error.code,
            message: result.error.message,
          });
          setError(result.error.message);
          setData(null);
          setParticipants([]);
          return;
        }
        setData(result.data);
        setParticipants(result.data.participants);
      } catch (err) {
        console.error("[session-lobby] fetch threw", err);
        if (!cancelled) {
          toast.error("Could not load lobby");
          setError(err instanceof Error ? err.message : "Failed to load lobby");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, tick]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);

  return {
    data,
    isLoading,
    error,
    refresh,
    participants,
    setParticipants,
  };
}
