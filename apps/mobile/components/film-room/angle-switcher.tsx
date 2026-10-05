import * as React from "react";
import { Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { shortName } from "@/lib/film-room/format";
import { angleLabel, angleTag } from "@jits/shared/utils";
import { BEST_ANGLE } from "@/lib/video/video-status-copy";

export interface AngleOption {
  id: string;
  is_mine: boolean;
  uploaded_by_name: string | null;
  /** "timekeeper" for the sideline angle (jr_be-1qz.5); absent on older data. */
  recording_type?: string | null;
  /**
   * What the UI may do with it (`videoPlayability`). Present on every
   * `MatchDetailVideo`; only a "playable" angle is offered (deck rule 4).
   */
  playability?: string;
  /** The server-elected primary angle (jr_be-1qz.10). */
  is_primary?: boolean | null;
}

/**
 * The angle that wears "Best angle" (COPY-DECK 13): the server-elected
 * primary, only when 2+ angles can be played. Null otherwise.
 */
export function bestAngleId<T extends AngleOption>(switchable: T[]): string | null {
  const playable = switchable.filter((a) => a.playability == null || a.playability === "playable");
  if (playable.length < 2) return null;
  return playable.find((a) => a.is_primary === true)?.id ?? null;
}

/**
 * The angles worth switching to: playable ones only (deck rule 4), so a
 * reservation still uploading, an abandoned one (no file) or a failed one is
 * never offered. The angle on screen always stays, so the switch never
 * loses its selection. An option without `playability` (older callers) is
 * kept.
 */
export function switchableAngles<T extends AngleOption>(angles: T[], activeId: string): T[] {
  return angles.filter((a) => a.id === activeId || a.playability == null || a.playability === "playable");
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
  /**
   * The Film status's own Best angle (match page), so the plate and the
   * switcher always agree; computed from the angles when absent (player).
   */
  bestId?: string | null;
}

/**
 * Two-segment switch between the athletes' recordings of one match. Renders
 * nothing with fewer than two angles.
 */
export function AngleSwitcher({ angles: all, activeId, opponentName, onSelect, variant = "plate", bestId }: AngleSwitcherProps) {
  const p = usePalette();
  const angles = switchableAngles(all, activeId);
  if (angles.length < 2) return null;
  const best = bestId !== undefined ? bestId : bestAngleId(angles);
  // Over video the segments keep the on-film colors; on the page they follow
  // the theme. The active segment inverts (ink fill, page-colored label).
  const c =
    variant === "film"
      ? { on: ON_MEDIA.text, onLabel: ON_MEDIA.ink, border: ON_MEDIA.strong, fill: ON_MEDIA.tag, label: ON_MEDIA.white, sub: ON_MEDIA.text2 }
      : { on: p.text, onLabel: p.bg, border: p.strong, fill: p.secondaryBg, label: p.text, sub: p.text2 };
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
        const isBest = a.id === best;
        const a11y = isBest ? `${angleA11yLabel(a, opponentName)}, ${BEST_ANGLE}` : angleA11yLabel(a, opponentName);
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
            {isBest ? (
              // Deck 13: a small tag under the label, in the chip's own ink.
              <Text testID={`angle-best-${a.id}`} numberOfLines={1} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: on ? c.onLabel : c.sub }, TABULAR]}>
                {BEST_ANGLE.toUpperCase()}
              </Text>
            ) : null}
          </StatePressable>
        );
      })}
    </View>
  );
}
