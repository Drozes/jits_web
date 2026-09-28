import * as React from "react";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { HighlightCard } from "./highlight-card";

/**
 * "Your highlight" under the match video(s): one card per recording of the
 * match (in practice one), each the viewer's OWN reel of that recording. A
 * fragment, not a wrapper View, so hidden cards leave no gap in the screen's
 * spaced ScrollView: when every card is disabled/unavailable nothing renders.
 * The opponent's reel is never shown (spec 015 non-goal).
 */
export function HighlightSection({
  videos,
  reloadToken,
}: {
  videos: MatchDetailVideo[];
  /** Bumped by the screen's pull-to-refresh. */
  reloadToken: number;
}) {
  const labelled = videos.length > 1;
  return (
    <>
      {videos.map((v) => (
        <HighlightCard
          key={v.id}
          matchVideoId={v.id}
          angleLabel={labelled ? v.angle_label : null}
          reloadToken={reloadToken}
        />
      ))}
    </>
  );
}
