"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createInSessionMatch } from "@jits/shared/api/mutations";
import type { LobbyParticipant } from "@jits/shared/types/session";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Ephemeral in-session challenge (not persisted to DB) */
export interface InSessionChallenge {
  fromAthleteId: string;
  fromDisplayName: string;
  fromElo: number;
  matchType: "casual" | "ranked";
}

function removeBusy(prev: Set<string>, ...ids: string[]) {
  const next = new Set(prev);
  for (const id of ids) next.delete(id);
  return next;
}

function addBusy(prev: Set<string>, ...ids: string[]) {
  return new Set([...prev, ...ids]);
}

export function useSessionLobbyRealtime(
  sessionId: string,
  currentAthleteId: string,
  currentAthleteName: string,
  currentAthleteElo: number,
  initialParticipants: LobbyParticipant[],
) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [incomingChallenge, setIncomingChallenge] = useState<InSessionChallenge | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef(currentAthleteId);
  meRef.current = currentAthleteId;
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  const clearChallenge = useCallback(() => setIncomingChallenge(null), []);

  useEffect(() => {
    const supabase = createClient();
    const pgChannel = supabase
      .channel(`session-participants:${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` }, () => {})
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` }, ({ new: row }) => {
        const r = row as { athlete_id: string; status: string; current_match_id?: string };
        setParticipants((prev) => prev.map((p) => p.athleteId === r.athlete_id ? { ...p, status: r.status, currentMatchId: r.current_match_id ?? null } : p));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` }, ({ old: row }) => {
        const r = row as { athlete_id: string };
        const leaving = participantsRef.current.find((p) => p.athleteId === r.athlete_id);
        if (leaving) setAnnouncement(`${leaving.displayName} left the lobby`);
        setParticipants((prev) => prev.filter((p) => p.athleteId !== r.athlete_id));
      })
      .subscribe();

    const bc = supabase
      .channel(`session:${sessionId}`)
      .on("broadcast", { event: "challenge_sent" }, ({ payload }) => {
        const { from, fromName, fromElo, to, matchType } = payload as { from: string; fromName: string; fromElo: number; to: string; matchType: "casual" | "ranked" };
        setBusyIds((prev) => addBusy(prev, from, to));
        if (to === meRef.current) {
          setIncomingChallenge({ fromAthleteId: from, fromDisplayName: fromName, fromElo, matchType });
          setAnnouncement(`${fromName} challenged you`);
        }
      })
      .on("broadcast", { event: "challenge_accepted" }, ({ payload }) => {
        const { from, to, matchId } = payload as { from: string; to: string; matchId: string };
        setBusyIds((prev) => removeBusy(prev, from, to));
        if (from === meRef.current) router.push(`/session/${sessionId}/match/${matchId}`);
      })
      .on("broadcast", { event: "challenge_declined" }, ({ payload }) => {
        const { from, to } = payload as { from: string; to: string };
        setBusyIds((prev) => removeBusy(prev, from, to));
      })
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        const ids = (payload as { participants: string[] }).participants;
        setBusyIds((prev) => addBusy(prev, ...ids));
        setParticipants((prev) => prev.map((p) => ids.includes(p.athleteId) ? { ...p, status: "in_match" } : p));
      })
      .on("broadcast", { event: "participant_joined" }, ({ payload }) => {
        const raw = payload as Record<string, unknown>;
        const p: LobbyParticipant = {
          participantId: (raw.participantId as string) ?? "",
          athleteId: raw.athleteId as string,
          displayName: raw.displayName as string,
          currentElo: raw.currentElo as number,
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
          if (prev.some((x) => x.athleteId === p.athleteId)) return prev;
          setAnnouncement(`${p.displayName} joined the lobby`);
          return [...prev, p];
        });
      })
      .subscribe();

    channelRef.current = bc;
    return () => { supabase.removeChannel(pgChannel); supabase.removeChannel(bc); };
  }, [sessionId, router]);

  const sendChallenge = useCallback(
    (to: string, matchType: "casual" | "ranked") => {
      setBusyIds((prev) => addBusy(prev, currentAthleteId, to));
      channelRef.current?.send({
        type: "broadcast",
        event: "challenge_sent",
        payload: { from: currentAthleteId, fromName: currentAthleteName, fromElo: currentAthleteElo, to, matchType },
      });
    },
    [currentAthleteId, currentAthleteName, currentAthleteElo],
  );

  const respondToChallenge = useCallback(
    async (accept: boolean) => {
      if (!incomingChallenge) return;
      const { fromAthleteId } = incomingChallenge;
      if (accept) {
        const supabase = createClient();
        const result = await createInSessionMatch(supabase, { sessionId, opponentId: fromAthleteId });
        if (result.ok) {
          channelRef.current?.send({ type: "broadcast", event: "challenge_accepted", payload: { from: fromAthleteId, to: currentAthleteId, matchId: result.data.matchId } });
          setIncomingChallenge(null);
          router.push(`/session/${sessionId}/match/${result.data.matchId}`);
        } else {
          // Remove both from busy on failure
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(incomingChallenge.fromAthleteId);
            next.delete(currentAthleteId);
            return next;
          });
          setIncomingChallenge(null);
        }
      } else {
        channelRef.current?.send({ type: "broadcast", event: "challenge_declined", payload: { from: fromAthleteId, to: currentAthleteId } });
        setIncomingChallenge(null);
      }
    },
    [incomingChallenge, sessionId, currentAthleteId, router],
  );

  return { participants, incomingChallenge, clearChallenge, sendChallenge, respondToChallenge, busyIds, announcement };
}
