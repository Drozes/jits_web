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

/**
 * Subscribes to realtime challenge changes and maintains a live list
 * of pending received challenges for the current athlete.
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

    // Re-fetch on any challenge insert or status update targeting this athlete
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
        () => fetchChallenges(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${athleteId}`,
        },
        () => fetchChallenges(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [athleteId, fetchChallenges]);

  return { count: challenges.length, challenges };
}
