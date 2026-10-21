import * as React from "react";
import { Text, View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { FIGHT_RADIUS } from "../fight/fight-tokens";

/**
 * One timekeeper-mode line that asks the viewer to act again (boards
 * P-TK-B3 frames 7 and 8, P-TK-B4 frame 4): the picker's TK-P21 (declined),
 * TK-P22 (lapsed) and TK-D1 (the timekeeper left), and the sheet's TK-T8
 * (consent refused). An amber dot and text inside a dashed amber rule, the
 * attention token (never Signal Red: nothing failed, a choice is needed).
 */
export function AttentionLine({ text, testID }: { text: string; testID?: string }) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: p.amber,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.amber }} />
      <Text className="font-body" style={[typeStep("body"), { flex: 1, color: p.amber }]}>
        {text}
      </Text>
    </View>
  );
}
