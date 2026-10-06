import * as React from "react";
import { Text, View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import { nearestStep, TABULAR, TRACKING, typeSize, typeStep } from "@/lib/typography";
import { AthleteTile } from "@/components/film-room/athlete-tile";
import type { StillAthlete } from "@/components/film-room/opening-still";

interface MatchGhostCardProps {
  /** C-Z1, C-Z2b or C-L1. */
  caption: string;
  viewer: StillAthlete;
  /** An optional action under the caption (C-L2 Find a match). */
  action?: React.ReactNode;
  testID?: string;
}

const TILE = 40;

/**
 * The MatchFeedCard silhouette for a match that has not happened yet
 * (specs/matches-tab 10.2, 10.3): a dashed 16:9 outline with the viewer on
 * the left and a dashed "?" opponent on the right, the caption, then a
 * dashed meta row. Not pressable itself; only its action is.
 */
export function MatchGhostCard({ caption, viewer, action = null, testID }: MatchGhostCardProps) {
  const p = usePalette();
  const dashed = { borderWidth: 1, borderStyle: "dashed", borderColor: p.strong } as const;
  const faint = { borderWidth: 1, borderStyle: "dashed", borderColor: p.hairline, borderRadius: 2 } as const;
  return (
    <View testID={testID}>
      <View className="items-center justify-center" style={[dashed, { width: "100%", aspectRatio: 16 / 9, borderRadius: 3, gap: 8, paddingHorizontal: 24 }]}>
        <View accessible accessibilityLabel={caption} className="items-center" style={{ gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View style={{ opacity: 0.5 }}>
              <AthleteTile name={viewer.name} photoUrl={viewer.photoUrl} size={TILE} />
            </View>
            <Text className="font-display" style={[typeSize(nearestStep(TILE * 0.3)), { color: p.text3 }]}>
              VS
            </Text>
            <View className="items-center justify-center" style={[dashed, { width: TILE, height: TILE, borderRadius: 2 }]}>
              <Text className="font-heading" style={[typeStep("body"), { color: p.text3 }]}>
                ?
              </Text>
            </View>
          </View>
          <Text className="font-mono-bold uppercase text-center" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}>
            {caption}
          </Text>
        </View>
        {action}
      </View>
      <View className="flex-row" style={{ gap: 10, paddingTop: 12 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[faint, { width: 24, height: 24 }]} />
        <View style={{ flex: 1, gap: 8, paddingTop: 3 }}>
          <View style={[faint, { width: "45%", height: 9 }]} />
          <View style={[faint, { width: "30%", height: 8 }]} />
        </View>
      </View>
    </View>
  );
}
