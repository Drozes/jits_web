import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { AngleSwitcher, type AngleOption } from "@/components/film-room/angle-switcher";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { MULTI_ANGLE_COPY, angleCountChip } from "@/lib/video/multi-angle/copy";

export function OnMediaTag({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text
      testID={testID}
      className="font-mono-medium"
      style={[
        typeStep("micro"),
        { letterSpacing: TRACKING.caps, color: ON_MEDIA.text2, backgroundColor: ON_MEDIA.badge, borderColor: ON_MEDIA.strong, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
        TABULAR,
      ]}
    >
      {text.toUpperCase()}
    </Text>
  );
}

interface AngleBarProps {
  /** The quick switch: ready (playable, loaded) angles only (deck rule 4). */
  switchable: AngleOption[];
  activeId: string;
  opponentName?: string | null;
  /** Every expected angle, ready or not (the chip's denominator). */
  totalAngles: number;
  approximate: boolean;
  switchingLabel: string | null;
  onSelect: (id: string) => void;
  onOpenSheet: () => void;
}

/**
 * The angle control in the bottom thumb zone (research 03, 4.8): the
 * existing segmented AngleSwitcher (props unchanged, so the Best angle chip
 * from the Film status work lands here as is), a persistent "Approx. sync"
 * tag while a clock-only angle is on screen, a "Switching to …" note on a
 * slow switch, and the angle-count chip that opens the Angles sheet.
 */
export function AngleBar({ switchable, activeId, opponentName, totalAngles, approximate, switchingLabel, onSelect, onOpenSheet }: AngleBarProps) {
  if (totalAngles < 2) return null;
  return (
    <View testID="angle-bar" style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 8, minHeight: 44 }}>
        <Pressable
          testID="angle-count-chip"
          accessibilityRole="button"
          accessibilityLabel={`${angleCountChip(switchable.length, totalAngles)}. Opens ${MULTI_ANGLE_COPY.sheetTitle}.`}
          onPress={onOpenSheet}
          className="items-center justify-center active:opacity-70"
          style={{ height: 44, paddingHorizontal: 10, borderRadius: 2, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.tag }}
        >
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: ON_MEDIA.white }, TABULAR]}>
            {angleCountChip(switchable.length, totalAngles)}
          </Text>
        </Pressable>
        {approximate ? <OnMediaTag testID="angle-approx-tag" text={MULTI_ANGLE_COPY.approxSync} /> : null}
        {switchingLabel ? <OnMediaTag testID="angle-switching" text={MULTI_ANGLE_COPY.switchingTo(switchingLabel)} /> : null}
      </View>
      <AngleSwitcher variant="film" angles={switchable} activeId={activeId} opponentName={opponentName} onSelect={onSelect} />
    </View>
  );
}
