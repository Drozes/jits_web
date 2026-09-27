import * as React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { FILM } from "@/lib/film-room/film-palette";
import type { CardStatus } from "@/lib/film-room/card-status";

type Tone = "light" | "amber" | "outline" | "red";

const TONES: Record<Tone, { bg: string; fg: string; border?: string }> = {
  light: { bg: FILM.text, fg: FILM.ink },
  amber: { bg: FILM.badge, fg: FILM.amber, border: FILM.amberRule },
  outline: { bg: FILM.badge, fg: FILM.text, border: FILM.strong },
  red: { bg: FILM.badge, fg: FILM.redText, border: "rgba(240,85,107,0.7)" },
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
          borderWidth: t.border ? 1 : 0,
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
