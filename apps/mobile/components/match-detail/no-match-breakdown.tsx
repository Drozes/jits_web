import * as React from "react";
import { Text, View } from "react-native";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { NO_MATCH_COPY } from "@jits/shared/utils";
import type { VideoRecommendation } from "@jits/shared/api/film-room";
import { usePalette } from "@/lib/theme/palette";

/**
 * The AI BREAKDOWN body when the analysis found no jiu-jitsu in the video
 * (jr_be-0qf): a plain statement, the model's reason as plain text, and any
 * camera / setup tips. Neutral, not an error: no red, no actions.
 */
export function NoMatchBreakdown({
  reason,
  tips,
}: {
  reason: string | null;
  tips: VideoRecommendation[];
}) {
  const p = usePalette();
  return (
    <View testID="breakdown-no-match" style={{ gap: 8 }}>
      <Text className="font-heading" style={[typeStep("subhead"), { lineHeight: 20, color: p.text }]}>
        {NO_MATCH_COPY.title}
      </Text>
      <Text testID="breakdown-no-match-reason" className="font-body" style={[typeStep("callout"), { lineHeight: 21, color: p.text2 }]}>
        {reason ?? NO_MATCH_COPY.fallbackReason}
      </Text>
      <Text className="font-body" style={[typeStep("body"), { lineHeight: 19, color: p.text3 }]}>
        {NO_MATCH_COPY.explainer}
      </Text>
      {tips.length > 0 ? (
        <View testID="breakdown-no-match-tips" style={{ gap: 6, paddingTop: 4 }}>
          <Text className="font-mono-bold uppercase" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text2 }, TABULAR]}>
            {NO_MATCH_COPY.tipsHeading}
          </Text>
          {tips.map((tip, i) => (
            <View key={`${i}-${tip.text}`} className="flex-row" style={{ gap: 8 }}>
              <Text className="font-body" style={[typeStep("callout"), { lineHeight: 21, color: p.text3 }]}>
                {"•"}
              </Text>
              <Text className="flex-1 font-body" style={[typeStep("callout"), { lineHeight: 21, color: p.text }]}>
                {tip.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
