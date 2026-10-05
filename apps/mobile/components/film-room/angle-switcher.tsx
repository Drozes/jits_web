import * as React from "react";
import { Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { shortName } from "@/lib/film-room/format";
import { angleLabel, angleTag } from "@jits/shared/utils";

export interface AngleOption {
  id: string;
  is_mine: boolean;
  uploaded_by_name: string | null;
  /** "timekeeper" for the sideline angle (jr_be-1qz.5); absent on older data. */
  recording_type?: string | null;
}

/**
 * "Your angle" / "M. Park's angle" (COPY-DECK v2.2 section 1). A timekeeper's
 * angle keeps its name label (`angleTag` adds "Timekeeper"); the opponent's
 * name is only a fallback for a competitor's angle, never the timekeeper's.
 */
export function angleText(v: AngleOption, opponentName?: string | null): string {
  const fallback = v.recording_type === "timekeeper" ? null : opponentName;
  return angleLabel(v.is_mine, shortName(v.uploaded_by_name ?? fallback ?? "Opponent"));
}

/** The same label in the mono caps the switcher and rows render: "YOUR ANGLE" / "M. PARK'S ANGLE". */
export function angleName(v: AngleOption, opponentName?: string | null): string {
  return angleText(v, opponentName).toUpperCase();
}

/**
 * Screen-reader label: the rendered label plus its "Timekeeper" tag when it
 * has one. Kept in the rendered caps so the player and the match-loop
 * harness keep finding the segments by the labels they always had.
 */
export function angleA11yLabel(v: AngleOption, opponentName?: string | null): string {
  const tag = angleTag(v.recording_type);
  const label = angleName(v, opponentName);
  return tag ? `${label}, ${tag.toUpperCase()}` : label;
}

interface AngleSwitcherProps {
  angles: AngleOption[];
  activeId: string;
  opponentName?: string | null;
  onSelect: (id: string) => void;
  /** "plate" on the match page, "film" over video in the player. */
  variant?: "plate" | "film";
}

/**
 * Two-segment switch between the athletes' recordings of one match. Renders
 * nothing with fewer than two angles.
 */
export function AngleSwitcher({ angles, activeId, opponentName, onSelect, variant = "plate" }: AngleSwitcherProps) {
  const p = usePalette();
  if (angles.length < 2) return null;
  // Over video the segments keep the on-film colors; on the page they follow
  // the theme. The active segment inverts (ink fill, page-colored label).
  const c =
    variant === "film"
      ? { on: ON_MEDIA.text, onLabel: ON_MEDIA.ink, border: ON_MEDIA.strong, fill: ON_MEDIA.tag, label: ON_MEDIA.white }
      : { on: p.text, onLabel: p.bg, border: p.strong, fill: p.secondaryBg, label: p.text };
  return (
    <View
      testID="angle-switcher"
      accessibilityRole="tablist"
      accessibilityLabel="Camera angle"
      className="flex-row"
      style={{ gap: 8 }}
    >
      {angles.map((a) => {
        const on = a.id === activeId;
        const label = angleName(a, opponentName);
        const a11y = angleA11yLabel(a, opponentName);
        return (
          <StatePressable
            dim
            key={a.id}
            testID={`angle-${a.id}`}
            accessibilityRole="tab"
            accessibilityLabel={a11y}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(a.id)}
            className="flex-1 items-center justify-center"
            style={{
              height: 44,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: on ? c.on : c.border,
              backgroundColor: on ? c.on : c.fill,
            }}
          >
            <Text numberOfLines={1} className="font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING.caps, color: on ? c.onLabel : c.label }, TABULAR]}>
              {label}
            </Text>
          </StatePressable>
        );
      })}
    </View>
  );
}
