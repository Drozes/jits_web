import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { TRACKING, typeStep } from "@/lib/typography";
import { PlayCircle } from "lucide-react-native";
import { formatClock, type KeyMoment } from "@jits/shared/utils";
import { usePalette, TABULAR } from "@/lib/theme/palette";

/**
 * Dots along a hairline, placed by time over the clip. The finish is a larger
 * ink square: a finish is not a gain (it shows on losses too), so it is told
 * apart by shape and size, never by Gain Green (WP2, R3 FR-1).
 */
export function MomentTimeline({ moments, durationS }: { moments: KeyMoment[]; durationS: number }) {
  const p = usePalette();
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / durationS) * 100))}%` as const;
  const finish = moments.find((m) => m.kind === "finish");
  return (
    <View testID="moment-timeline" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 18 }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 8, height: 2, backgroundColor: p.track }} />
      {finish ? <View style={{ position: "absolute", left: 0, top: 8, height: 2, width: pct(finish.t), backgroundColor: p.text2 }} /> : null}
      {moments.map((m, i) => {
        const size = m.kind === "finish" ? 14 : 10;
        return (
          <View
            key={`${m.t}-${i}`}
            style={{ position: "absolute", left: pct(m.t), top: 9 - size / 2, width: size, height: size, marginLeft: -size / 2, borderRadius: m.kind === "finish" ? 2 : size / 2, backgroundColor: p.text }}
          />
        );
      })}
      <View style={{ position: "absolute", right: 0, top: 3, width: 2, height: 12, backgroundColor: p.strong }} />
    </View>
  );
}

interface KeyMomentsProps {
  moments: KeyMoment[];
  durationS: number | null;
  tags: string[];
  onJump: (t: number) => void;
}

/** KEY MOMENTS: timeline, one tappable row per moment, technique tags. */
export function KeyMoments({ moments, durationS, tags, onJump }: KeyMomentsProps) {
  const p = usePalette();
  if (moments.length === 0 && tags.length === 0) return null;
  const span = durationS && durationS > 0 ? durationS : Math.max(...moments.map((m) => m.t), 1) * 1.05;
  return (
    <View testID="key-moments" style={{ gap: 10 }}>
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text }, TABULAR]}>
          KEY MOMENTS
        </Text>
        {moments.length > 0 ? (
          <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text3 }, TABULAR]}>
            TAP TO JUMP
          </Text>
        ) : null}
      </View>
      {moments.length > 0 ? <MomentTimeline moments={moments} durationS={span} /> : null}
      <View style={{ borderTopWidth: moments.length ? 1 : 0, borderTopColor: p.hairline }}>
        {moments.map((m, i) => (
          <Pressable
            key={`${m.t}-${i}`}
            testID={`key-moment-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Play from ${formatClock(m.t)}, ${m.label}`}
            onPress={() => onJump(m.t)}
            className="flex-row items-center active:opacity-70"
            style={{ height: 52, gap: 14, borderBottomWidth: 1, borderBottomColor: p.hairline }}
          >
            <Text className="font-mono-bold" style={[typeStep("body"), { width: 44, color: p.text }, TABULAR]}>
              {formatClock(m.t)}
            </Text>
            <Text numberOfLines={1} className="flex-1 font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.loose, color: p.text }]}>
              {m.label}
            </Text>
            {m.kind === "finish" ? (
              <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 2, borderWidth: 1, borderColor: p.strong, justifyContent: "center" }}>
                <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text }, TABULAR]}>
                  FINISH
                </Text>
              </View>
            ) : null}
            <PlayCircle size={20} color={p.text2} />
          </Pressable>
        ))}
      </View>
      {tags.length > 0 ? (
        <View testID="technique-tags" className="flex-row flex-wrap" style={{ gap: 6 }}>
          {tags.map((t) => (
            <View key={t} style={{ height: 26, paddingHorizontal: 9, borderRadius: 2, borderWidth: 1, borderColor: p.hairline, backgroundColor: p.secondaryBg, justifyContent: "center" }}>
              <Text className="font-mono-medium uppercase" style={[typeStep("micro"), { letterSpacing: TRACKING.caps, color: p.text }, TABULAR]}>
                {t}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
