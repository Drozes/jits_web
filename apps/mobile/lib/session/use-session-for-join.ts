import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { getSessionForJoin } from "@jits/shared/api/queries";
import type { SessionJoinData } from "@jits/shared/types/session";

interface UseSessionForJoinResult {
  data: SessionJoinData | null;
  /** Active app-level waiver id (when one exists and the athlete hasn't signed). */
  activeWaiverId: string | null;
  /** True when the athlete already has a non-finished participant row. */
  alreadyParticipant: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hydrates the data needed by the session join wizard:
 *   1. `getSessionForJoin` — gym coords + requiresWaiver/hasSignedWaiver +
 *      cached current_weight.
 *   2. The active app waiver row (when needed) so the waiver step can
 *      attribute the acknowledgement.
 *   3. A check for an existing non-finished participant row, which
 *      mirrors the web `JoinContent` redirect ("if already in lobby, skip
 *      the wizard").
 *
 * Cancellation gates state writes (Phase 3 W3-4 review note).
 */
export function useSessionForJoin(
  sessionId: string,
  athleteId: string | undefined,
): UseSessionForJoinResult {
  const [data, setData] = React.useState<SessionJoinData | null>(null);
  const [activeWaiverId, setActiveWaiverId] = React.useState<string | null>(null);
  const [alreadyParticipant, setAlreadyParticipant] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const session = await getSessionForJoin(supabase, sessionId, athleteId);

        if (!session) {
          if (!cancelled) {
            setData(null);
            setError("Session not found or no longer available");
          }
          return;
        }

        // Check if athlete is already a participant (and not done/left)
        const { data: existing } = await supabase
          .from("session_participants")
          .select("id, status")
          .eq("session_id", sessionId)
          .eq("athlete_id", athleteId)
          .not("status", "in", "(done,left)")
          .limit(1)
          .maybeSingle();

        // If we still need a waiver, look up its id for the waiver step
        let waiverId: string | null = null;
        if (session.requiresWaiver && !session.hasSignedWaiver) {
          const { data: waiver } = await supabase
            .from("waivers")
            .select("id")
            .eq("scope", "app")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          waiverId = waiver?.id ?? null;
        }

        if (cancelled) return;
        setData(session);
        setActiveWaiverId(waiverId);
        setAlreadyParticipant(!!existing);
      } catch (err) {
        console.error("[session-join] fetch failed", err);
        if (!cancelled) {
          toast.error("Could not load session");
          setError(err instanceof Error ? err.message : "Failed to load session");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, athleteId]);

  return { data, activeWaiverId, alreadyParticipant, isLoading, error };
}
