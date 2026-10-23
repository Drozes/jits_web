import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { useCrewLeave } from "@/lib/match-flow/use-crew-leave";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { FaceoffTopBar, TOP_BAR_FONT_CAP } from "../faceoff/faceoff-top";

export interface CrewTopBarProps {
  matchId: string;
  exitHref: string;
  /** The face-off's Leave words (`SHIPPED_COPY.leave`, deck A2), chosen by the crew step. */
  leave: { text: string; a11y: string };
}

/**
 * The picker's top bar (board P-TK-B2): the face-off's own bar
 * (`FaceoffTopBar`, which measures Leave so TK-P1 `FACE-OFF · TIMEKEEPER`
 * stays centred between two equal side slots) with the face-off's Leave on
 * the left (`useCrewLeave`: the shipped alert, cancel for both, Android back
 * the same). Leave draws the crew step's words (`SHIPPED_COPY.leave`), so it
 * is the face-off's `LeaveButton` look with those words, not that component,
 * whose text is its own literal.
 */
export function CrewTopBar({ matchId, exitHref, leave: words }: CrewTopBarProps) {
  const p = usePalette();
  const { cancelling, leave } = useCrewLeave({ matchId, exitHref });
  return (
    <FaceoffTopBar
      label={C["TK-P1"]}
      labelTestID="crew-top-label"
      leave={
        <StatePressable
          testID="crew-leave"
          accessibilityRole="button"
          // The face-off's Leave (deck A2): it cancels the match for both athletes.
          accessibilityLabel={words.a11y}
          accessibilityState={{ disabled: cancelling, busy: cancelling }}
          disabled={cancelling}
          onPress={leave}
          hitSlop={8}
          style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || cancelling ? 0.6 : 1 })}
        >
          <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
            {cancelling ? <ActivityIndicator size="small" color={p.text} /> : <ChevronLeft size={18} color={p.text} />}
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={TOP_BAR_FONT_CAP}
            className="font-heading uppercase"
            style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}
          >
            {words.text}
          </Text>
        </StatePressable>
      }
    />
  );
}
