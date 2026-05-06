import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  getAthleteStatsRpc,
  getMatchHistory,
  getPendingChallengeBetween,
  type AthleteStatsRpc,
} from "@jits/shared/api/queries";
import { extractGymName } from "@jits/shared/utils";
import { toast } from "@/components/ui";
import type { Athlete } from "@jits/shared/types/athlete";
import type { HeadToHeadMatch } from "@/components/compare-stats-parts";

export interface AthleteProfileData {
  competitor: Athlete;
  competitorGymName: string | null;
  compStats: AthleteStatsRpc;
  myStats: AthleteStatsRpc;
  pendingChallengeId: string | null;
  headToHead: HeadToHeadMatch[];
}

export function useAthleteProfile(
  competitorId: string | undefined,
  currentAthleteId: string | undefined,
) {
  const [data, setData] = React.useState<AthleteProfileData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!competitorId || !currentAthleteId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [
          { data: competitorRow, error: compErr },
          compStats,
          myStats,
          pending,
          history,
        ] = await Promise.all([
          supabase
            .from("athletes")
            .select("*, gyms!fk_athletes_primary_gym(name)")
            .eq("id", competitorId)
            .maybeSingle(),
          getAthleteStatsRpc(supabase, competitorId),
          getAthleteStatsRpc(supabase, currentAthleteId),
          getPendingChallengeBetween(supabase, currentAthleteId, competitorId),
          getMatchHistory(supabase, currentAthleteId),
        ]);
        if (cancelled) return;
        if (compErr || !competitorRow) {
          setNotFound(true);
          return;
        }
        const headToHead: HeadToHeadMatch[] = history
          .filter((m) => m.opponent_id === competitorId)
          .map((m) => ({
            matchType: m.match_type as "ranked" | "casual",
            result: m.athlete_outcome as "win" | "loss" | "draw" | null,
          }));
        const gymName = extractGymName(
          competitorRow.gyms as unknown as { name: string } | null,
        );
        setData({
          competitor: competitorRow as unknown as Athlete,
          competitorGymName: gymName,
          compStats,
          myStats,
          pendingChallengeId: pending?.id ?? null,
          headToHead,
        });
      } catch (err) {
        console.error("[athlete-profile] fetch failed", err);
        if (!cancelled) toast.error("Failed to load profile");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [competitorId, currentAthleteId]);

  return { data, isLoading, notFound };
}
