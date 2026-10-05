import * as React from "react";
import { Text, View, type DimensionValue } from "react-native";
import { usePalette, type Palette } from "@/lib/theme/palette";
import type { AngleTone } from "@/lib/video/angle-status";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";

/** Every new control is 44 px tall (deck convention 10). */
export const CONTROL_HEIGHT = 44;

/** A 2 px progress track (data, not decoration: no elevation). */
export function ProgressTrack({ percent, color, testID }: { percent: number; color: string; testID?: string }) {
  const p = usePalette();
  const w = `${Math.max(0, Math.min(100, Math.round(percent)))}%` as DimensionValue;
  return (
    <View style={{ height: 2, width: "100%", backgroundColor: p.strong }}>
      <View testID={testID} style={{ height: 2, width: w, backgroundColor: color }} />
    </View>
  );
}

/** A small bordered mono caps tag ("TIMEKEEPER", "BEST ANGLE"). */
export function RowChip({ label, testID, p }: { label: string; testID?: string; p: Palette }) {
  return (
    <View
      testID={testID}
      style={{ height: 18, paddingHorizontal: 5, borderRadius: 2, borderWidth: 1, borderColor: p.strong, justifyContent: "center" }}
    >
      <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** The deck's color class for a row's tag (COPY-DECK v2.2 section 0.8). */
export function toneColor(tone: AngleTone, p: Palette): string {
  switch (tone) {
    case "progress":
      return p.text2;
    case "waiting":
      return p.amber;
    case "negative":
      return p.red;
    case "info":
      return p.text3;
    default:
      return p.text2;
  }
}
