import * as React from "react";
import { Text, View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { DeadlineChip } from "./deadline-chip";

/**
 * The picker's heading (board P-TK-B2): TK-P2 `Pick a timekeeper` with the
 * pick deadline (TK-W1) beside it, then the helper TK-P3.
 */
export function CrewHeading({ deadlineAt }: { deadlineAt: string | null | undefined }) {
  const p = usePalette();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text accessibilityRole="header" className="font-heading" style={[typeStep("title-l"), { flexShrink: 1, color: p.text }]}>
          {C["TK-P2"]}
        </Text>
        <DeadlineChip deadlineAt={deadlineAt} />
      </View>
      <Text className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
        {C["TK-P3"]}
      </Text>
    </View>
  );
}
