"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PendingChallenge {
  id: string;
  challengerName: string;
  matchType: string;
  createdAt: string;
  expiresAt: string;
}

interface UsePendingChallengesResult {
  count: number;
  challenges: PendingChallenge[];
}

/** Raw challenge row shape from realtime payload (no FK joins). */
interface ChallengePayload {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  match_type: string;
  created_at: string;
  expires_at: string;
}

/**
 * Subscribes to realtime challenge changes and maintains a live list
 * of pending received challenges for the current athlete.
 *
 * Uses optimistic state patching: INSERT appends to state (with a
 * lightweight name lookup), UPDATE removes non-pending challenges.
 * Falls back to full refetch only on initial load.
 */
export function usePendingChallenges(
  athleteId: string,
): UsePendingChallengesResult {
  const [challenges, setChallenges] = useState<PendingChallenge[]>([]);

  const fetchChallenges = useCallback(async () => {
    const supabase = createClient();
    const now = new Date().toISOString();

    const { data } = await supabase
      .from("challenges")
      .select(
        "id, created_at, expires_at, match_type, challenger:athletes!fk_challenges_challenger(display_name)",
      )
      .eq("opponent_id", athleteId)
      .eq("status", "pending")
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    if (data) {
      setChallenges(
        data.map((c) => {
          const challenger = c.challenger as unknown as
            | { display_name: string }
            | null;
          return {
            id: c.id,
            challengerName: challenger?.display_name ?? "Unknown",
            matchType: c.match_type,
            createdAt: c.created_at,
            expiresAt: c.expires_at,
          };
        }),
      );
    }
  }, [athleteId]);

  useEffect(() => {
    fetchChallenges();

    const supabase = createClient();

    const channel = supabase
      .channel(`challenges-${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        async (payload) => {
          const row = payload.new as ChallengePayload;
          if (row.status !== "pending" || new Date(row.expires_at) <= new Date()) return;

          // Lightweight lookup for challenger name (no full refetch)
          const { data: challenger } = await supabase
            .from("athletes")
            .select("display_name")
            .eq("id", row.challenger_id)
            .single();

          const newChallenge: PendingChallenge = {
            id: row.id,
            challengerName: challenger?.display_name ?? "Unknown",
            matchType: row.match_type,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
          };

          setChallenges((prev) => [newChallenge, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as ChallengePayload;
          // Remove challenge if it's no longer pending
          if (row.status !== "pending") {
            setChallenges((prev) => prev.filter((c) => c.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, fetchChallenges]);

  return { count: challenges.length, challenges };
}
