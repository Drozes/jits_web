import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";

/** Plate, row and 16:9 blocks while the match loads. */
export function MatchDetailSkeleton() {
  return (
    <View testID="match-detail-loading" accessibilityLabel="Loading match" className="p-4 gap-4">
      <SkeletonProvider>
        <View style={{ gap: 16 }}>
          <SkeletonBlock height={120} />
          <SkeletonBlock height={56} radius="xs" />
          <SkeletonBlock style={{ aspectRatio: 16 / 9 }} />
        </View>
      </SkeletonProvider>
    </View>
  );
}

export function MatchNoVideo() {
  return (
    <Plate testID="match-detail-no-video" className="gap-1">
      <Text className="font-body text-[12px] text-ink-2">
        No video was recorded for this match.
      </Text>
      <Text className="font-body text-[12px] text-ink-3">
        Videos show up here when either athlete records the match.
      </Text>
    </Plate>
  );
}

const PANELS = {
  NOT_PARTICIPANT: {
    testID: "match-detail-not-participant",
    title: "You can't view this match",
    body: "Only the two athletes in a match can see its details and video.",
  },
  MATCH_NOT_FOUND: {
    testID: "match-detail-not-found",
    title: "Match not found",
    body: "It may have been cancelled or removed.",
  },
  OTHER: {
    testID: "match-detail-error",
    title: "Couldn't load this match",
    body: "Check your connection and try again.",
  },
} as const;

interface MatchDetailErrorProps {
  code: string;
  onBack: () => void;
  onRetry: () => void;
}

/** The three screen-level failures: not yours (Back), gone (Back), other (Try again). */
export function MatchDetailError({ code, onBack, onRetry }: MatchDetailErrorProps) {
  const panel =
    code === "NOT_PARTICIPANT" || code === "MATCH_NOT_FOUND" ? PANELS[code] : PANELS.OTHER;
  const retryable = panel === PANELS.OTHER;
  const label = retryable ? "Try again" : "Back";
  return (
    <View testID={panel.testID} className="flex-1 items-center justify-center px-8 gap-2">
      <Text className="font-mono text-[11px] text-ink uppercase tracking-caps-l text-center">
        {panel.title}
      </Text>
      <Text className="font-body text-[12px] text-ink-3 text-center">{panel.body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={retryable ? onRetry : onBack}
        hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
        className="active:opacity-70"
      >
        <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
