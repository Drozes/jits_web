import * as React from "react";
import { Text, View } from "react-native";
import type { HighlightPhase } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { useMyHighlight } from "@/lib/highlight/use-my-highlight";
import { useHighlightRetry } from "@/lib/highlight/use-highlight-retry";
import { HighlightProgressSteps } from "./highlight-progress-steps";
import { HighlightFailed, HighlightNote } from "./highlight-states";
import { HighlightReel } from "./highlight-reel";

/** Phases that render no card at all (spec 014 section 10). */
const HIDDEN: ReadonlySet<HighlightPhase> = new Set<HighlightPhase>(["disabled", "unavailable"]);

interface HighlightCardProps {
  matchVideoId: string;
  /** Shown under the title only when the match has more than one recording. */
  angleLabel: string | null;
}

/**
 * "Your highlight" for one match video: the caller's OWN reel. Renders
 * nothing until the first progress read lands, when the read fails (e.g.
 * the backend is not deployed yet) and for `disabled` / `unavailable`, so a
 * card never flashes in or shows a raw error.
 */
export function HighlightCard({ matchVideoId, angleLabel }: HighlightCardProps) {
  const my = useMyHighlight(matchVideoId);
  const progress = my.progress;
  const retry = useHighlightRetry(progress?.highlightId ?? null, my.refresh);
  if (!progress || HIDDEN.has(progress.phase)) return null;
  const { phase } = progress;

  return (
    <View testID={`highlight-card-${matchVideoId}`} className="gap-3">
      <View className="gap-1">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          {HIGHLIGHT_COPY.title}
        </Text>
        {angleLabel ? <Text className="font-heading text-[12px] text-ink">{angleLabel}</Text> : null}
      </View>
      <View className="bg-surface-3 border border-hairline rounded-md p-4 gap-3">
        {phase === "waiting_for_analysis" ? (
          <HighlightNote testID="highlight-waiting">{HIGHLIGHT_COPY.waitingForAnalysis}</HighlightNote>
        ) : phase === "planning" || phase === "rendering" ? (
          <HighlightProgressSteps activeStep={phase === "planning" ? 1 : 2} />
        ) : phase === "ready" || phase === "regenerating" ? (
          <HighlightReel
            progress={progress}
            source={my.source}
            playbackFailed={my.playbackFailed}
            onPlayerError={my.onPlayerError}
            refresh={my.refresh}
          />
        ) : phase === "failed" ? (
          <HighlightFailed
            errorMessage={progress.errorMessage}
            canRetry={progress.rendersRemaining > 0 && !!progress.highlightId}
            busy={retry.busy}
            onRetry={() => void retry.retry()}
          />
        ) : phase === "none" ? (
          <HighlightNote testID="highlight-none">{HIGHLIGHT_COPY.none}</HighlightNote>
        ) : (
          <HighlightNote testID="highlight-invalidated">{HIGHLIGHT_COPY.invalidated}</HighlightNote>
        )}
      </View>
    </View>
  );
}
