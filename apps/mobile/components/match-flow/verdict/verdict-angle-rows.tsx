import * as React from "react";
import { Text, View } from "react-native";
import type { MatchDetailVideo } from "@jits/shared/api/queries";
import { angleTag } from "@jits/shared/utils";
import { angleName, angleText } from "@/components/film-room/angle-switcher";
import { toneColor } from "@/components/match-detail/film-angles";
import { shortName } from "@/lib/film-room/format";
import { angleOwnerName, angleRowA11yLabel, angleStatus } from "@/lib/video/angle-status";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";

interface VerdictAngleRowsProps {
  /** The other athletes' angles (never the viewer's own). */
  videos: MatchDetailVideo[];
  opponentName: string;
}

/**
 * The other athlete's (and the timekeeper's) angle on the verdict
 * (jits-n2im.12): Uploading with its %, Paused, Processing, or Ready to
 * watch, live over realtime. Deck rows (COPY-DECK v2.2 section 2c), one
 * accessible element each (section 10.2). Not pressable: "Watch film" /
 * "Open match" below is the way in. Renders nothing without another angle.
 */
export function VerdictAngleRows({ videos, opponentName }: VerdictAngleRowsProps) {
  const p = usePalette();
  if (videos.length === 0) return null;
  return (
    <View testID="verdict-angle-rows" style={{ borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}>
      {videos.map((v, i) => {
        const status = angleStatus(v, { name: angleOwnerName(v, opponentName, shortName) });
        const tag = angleTag(v.recording_type);
        const a11y = angleRowA11yLabel(angleText(v, opponentName), tag, status);
        const uploading = status.percent != null && status.tone === "progress";
        return (
          <View
            key={v.id}
            testID={`verdict-angle-${v.id}`}
            accessible
            accessibilityLabel={a11y}
            accessibilityRole={uploading ? "progressbar" : undefined}
            accessibilityValue={uploading ? { min: 0, max: 100, now: status.percent ?? 0 } : undefined}
            style={{
              minHeight: 52,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 4,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: p.hairline,
            }}
          >
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text numberOfLines={1} className="font-heading" style={[typeStep("callout"), { flexShrink: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
                {angleName(v, opponentName)}
              </Text>
              {tag ? (
                <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text3 }, TABULAR]}>
                  {tag.toUpperCase()}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: toneColor(status.tone, p) }, TABULAR]}>
                {status.tag.toUpperCase()}
              </Text>
              {status.right ? (
                <Text className="font-mono-medium" style={[typeStep("small"), { color: p.text }, TABULAR]}>
                  {status.right}
                </Text>
              ) : null}
            </View>
            {status.helper ? (
              <Text className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
                {status.helper}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
