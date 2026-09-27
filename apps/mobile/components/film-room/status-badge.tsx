import * as React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import type { CardStatus } from "@/lib/film-room/card-status";

type Tone = "light" | "amber" | "outline" | "red";

/**
 * Badges sit over the poster (a photo, or the themed plate when there is no
 * still), so each carries its own fixed backing and reads on both themes.
 */
const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  light: { bg: ON_MEDIA.chip, fg: ON_MEDIA.ink, border: ON_MEDIA.chipBorder },
  amber: { bg: ON_MEDIA.badge, fg: ON_MEDIA.amber, border: ON_MEDIA.amberRule },
  outline: { bg: ON_MEDIA.badge, fg: ON_MEDIA.text, border: ON_MEDIA.strong },
  red: { bg: ON_MEDIA.badge, fg: ON_MEDIA.red, border: ON_MEDIA.redRule },
};

export function toneFor(status: CardStatus): Tone {
  if (status.kind === "new") return "light";
  if (status.kind === "failed") return "red";
  if (status.kind === "ready") return "outline";
  return "amber";
}

/** A small mono caps badge over film (NEW, ANALYZING 3/7, 2 ANGLES ...). */
export function FilmBadge({
  label,
  tone,
  style,
  testID,
}: {
  label: string;
  tone: Tone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = TONES[tone];
  return (
    <View
      testID={testID}
      style={[
        {
          height: 20,
          paddingHorizontal: 7,
          borderRadius: 2,
          justifyContent: "center",
          backgroundColor: t.bg,
          borderWidth: 1,
          borderColor: t.border,
        },
        style,
      ]}
    >
      <Text className="font-mono-bold" style={{ fontSize: 9, letterSpacing: 1.6, color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}
