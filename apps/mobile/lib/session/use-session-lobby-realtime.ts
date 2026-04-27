import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { LobbyParticipant } from "@jits/shared/types/session";

/**
 * Mobile-local realtime hook for the session lobby. Subscribes to:
 *   - `postgres_changes` on `session_participants` for status/leave updates
 *   - `broadcast` on `session:{sessionId}` for ephemeral lobby events
 *     (`participant_joined`, `match_started`, `challenge_*`).
 *
 * Mirrors `apps/web/hooks/use-session-lobby-realtime.ts` but adapted for
 * mobile. We don't import the web hook (Next.js-only) or the shared
 * `useLobbySync` (challenge-lobby shape, not session-lobby shape).
 *
 * Caller owns the `participants` state via `setParticipants`; this hook
 * only mutates it through the supplied setter so the lobby screen has a
 * single source of truth.
 */

export interface InSessionChallenge {
  fromAthleteId: string;
  fromDisplayName: string;
  fromElo: number;
  matchType: "casual" | "ranked";
}

interface UseSessionLobbyRealtimeOpts {
  sessionId: string;
  currentAthleteId: string;
  setParticipants: React.Dispatch<React.SetStateAction<LobbyParticipant[]>>;
  /** Called when the session match-started broadcast names this athlete. */
  onMatchStarted?: (matchId: string) => void;
}

interface UseSessionLobbyRealtimeResult {
  busyIds: Set<string>;
  channel: RealtimeChannel | null;
}

export function useSessionLobbyRealtime({
  sessionId,
  currentAthleteId,
  setParticipants,
  onMatchStarted,
}: UseSessionLobbyRealtimeOpts): UseSessionLobbyRealtimeResult {
  const [busyIds, setBusyIds] = React.useState<Set<string>>(new Set());
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const meRef = React.useRef(currentAthleteId);
  meRef.current = currentAthleteId;
  const onMatchStartedRef = React.useRef(onMatchStarted);
  onMatchStartedRef.current = onMatchStarted;

  React.useEffect(() => {
    const pgChannel = supabase
      .channel(`session-participants:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        ({ new: row }) => {
          const r = row as {
            athlete_id: string;
            status: string;
            current_match_id?: string | null;
          };
          setParticipants((prev) =>
            prev.map((p) =>
              p.athleteId === r.athlete_id
                ? {
                    ...p,
                    status: r.status,
                    currentMatchId: r.current_match_id ?? null,
                  }
                : p,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${sessionId}`,
        },
        ({ old: row }) => {
          const r = row as { athlete_id: string };
          setParticipants((prev) => prev.filter((p) => p.athleteId !== r.athlete_id));
        },
      )
      .subscribe();

    const bc = supabase
      .channel(`session:${sessionId}`)
      .on("broadcast", { event: "challenge_sent" }, ({ payload }) => {
        const p = payload as { from: string; to: string };
        setBusyIds((prev) => new Set([...prev, p.from, p.to]));
      })
      .on("broadcast", { event: "challenge_accepted" }, ({ payload }) => {
        const p = payload as { from: string; to: string; matchId: string };
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(p.from);
          next.delete(p.to);
          return next;
        });
        // Whichever side initiated the challenge gets pushed to the match.
        if (p.from === meRef.current) {
          onMatchStartedRef.current?.(p.matchId);
        }
      })
      .on("broadcast", { event: "challenge_declined" }, ({ payload }) => {
        const p = payload as { from: string; to: string };
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(p.from);
          next.delete(p.to);
          return next;
        });
      })
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const ids = (payload as { participants: string[] }).participants ?? [];
        setBusyIds((prev) => new Set([...prev, ...ids]));
        setParticipants((prev) =>
          prev.map((p) =>
            ids.includes(p.athleteId) ? { ...p, status: "in_match" } : p,
          ),
        );
      })
      .on("broadcast", { event: "participant_joined" }, ({ payload }) => {
        const raw = payload as Record<string, unknown>;
        const aId = raw.athleteId as string | undefined;
        if (!aId) return;
        const newParticipant: LobbyParticipant = {
          participantId: (raw.participantId as string) ?? "",
          athleteId: aId,
          displayName: (raw.displayName as string) ?? "Unknown",
          currentElo: (raw.currentElo as number) ?? 0,
          currentWeight: (raw.currentWeight as number) ?? null,
          profilePhotoUrl: (raw.profilePhotoUrl as string) ?? null,
          primaryGymId: null,
          gymName: null,
          status: "checked_in",
          weightConfirmed: (raw.currentWeight as number) ?? null,
          currentMatchId: null,
          checkedInAt: new Date().toISOString(),
          eloDistance: 0,
        };
        setParticipants((prev) => {
          if (prev.some((x) => x.athleteId === aId)) return prev;
          return [...prev, newParticipant];
        });
      })
      .subscribe();

    channelRef.current = bc;

    return () => {
      supabase.removeChannel(pgChannel);
      supabase.removeChannel(bc);
    };
  }, [sessionId, setParticipants]);

  return { busyIds, channel: channelRef.current };
}
