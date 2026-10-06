import * as React from "react";
import { useRouter } from "expo-router";
import { ARENA_HREF } from "@/lib/arena/constants";
import { logEmptyCta } from "@/lib/matches/telemetry";
import type { StillAthlete } from "@/components/film-room/opening-still";
import { MatchGhostCard } from "./match-ghost-card";
import { TextAction } from "./text-action";

/** C-L1 and C-L2. */
export const NEXT_MATCH_COPY = { caption: "Your next match goes here", action: "Find a match" } as const;

/**
 * Under the last card of a short history (1 to 3 matches, all loaded, no
 * filter; specs/matches-tab 10.3): the ghost of the next match with a Find a
 * match text action to the Arena tab. Never red.
 */
export function NextMatchGhostCard({ viewer }: { viewer: StillAthlete }) {
  const router = useRouter();
  return (
    <MatchGhostCard
      testID="matches-next-ghost"
      caption={NEXT_MATCH_COPY.caption}
      viewer={viewer}
      action={
        <TextAction
          testID="matches-next-ghost-arena"
          label={NEXT_MATCH_COPY.action}
          accessibilityLabel={`${NEXT_MATCH_COPY.action} in the Arena`}
          chevron
          onPress={() => {
            logEmptyCta({ surface: "matches", state: "low_data", cta: "arena" });
            router.push(ARENA_HREF);
          }}
        />
      }
    />
  );
}
