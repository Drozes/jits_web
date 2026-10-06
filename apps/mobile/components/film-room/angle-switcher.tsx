import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { PressableScale } from "@/components/ui/pressable-scale";
import { filmChipLabelStyle, filmChipStyle } from "@/components/film-room/film-chip";
import { haptics } from "@/lib/motion";
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
  /**
   * The angle that is selected and still switching (the player passes
   * `switchState.targetId` while a switch is pending and not restoring). It
   * keeps the selected surface and adds `busy` to its accessibility state;
   * the Syncing pill carries the progress, so nothing else is drawn.
   */
  busyId?: string | null;
}

/**
 * Two-segment switch between the athletes' recordings of one match. Renders
 * nothing with fewer than two angles.
 *
 * Over video (`film`) the angles are the key moment chips (`film-chip.ts`):
 * separate outlined chips sized to their labels, the selected one inverted.
 * On the match page (`plate`) they stay two theme-colored segments.
 *
 * Each segment is a `PressableScale` (press-in 0.97, the Reduce Motion
 * opacity dip). Pressing an angle that is not active fires the `select`
 * haptic once, then `onSelect`; pressing the active one does nothing (no
 * haptic, no call), as the tab vocabulary says.
 */
export function AngleSwitcher({ angles: all, activeId, opponentName, onSelect, variant = "plate", bestId, busyId }: AngleSwitcherProps) {
  const p = usePalette();
  const angles = switchableAngles(all, activeId);
  if (angles.length < 2) return null;
  const best = bestId !== undefined ? bestId : bestAngleId(angles);
  const film = variant === "film";
  // On the page the segments follow the theme; the active one inverts.
  const c = { on: p.text, onLabel: p.bg, border: p.strong, fill: p.secondaryBg, label: p.text, sub: p.text2 };
  const chips = angles.map((a) => {
    const on = a.id === activeId;
    const label = angleName(a, opponentName);
    const isBest = a.id === best;
    const a11y = isBest ? `${angleA11yLabel(a, opponentName)}, ${BEST_ANGLE}` : angleA11yLabel(a, opponentName);
    const common = {
      testID: `angle-${a.id}`,
      accessibilityRole: "tab" as const,
      accessibilityLabel: a11y,
      accessibilityState: on && a.id === busyId ? { selected: true, busy: true } : { selected: on },
      onPress: () => {
        if (on) return;
        void haptics.select();
        onSelect(a.id);
      },
    };
    if (film) {
      // Over video: the key moment chip (film-chip.ts), sized to its label,
      // with the Best angle tag inset beside the label.
      return (
        <PressableScale key={a.id} {...common} style={[filmChipStyle(on), { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <Text numberOfLines={1} className="font-mono-bold" style={[filmChipLabelStyle(on), TABULAR]}>
            {label}
          </Text>
          {isBest ? (
            // Unselected, the tag sits on its own ON_MEDIA.badge ground so it
            // holds 4.5:1 over a bright frame (jits-tn2h), outlined in
            // ON_MEDIA.strong so it stays distinct on the badge chip
            // (jits-3liz); selected, it is outlined in the chip's own ink.
            <View
              testID={`angle-best-tag-${a.id}`}
              style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, borderWidth: 1, borderColor: on ? ON_MEDIA.ink : ON_MEDIA.strong, backgroundColor: on ? "transparent" : ON_MEDIA.badge }}
            >
              <Text testID={`angle-best-${a.id}`} numberOfLines={1} className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: on ? ON_MEDIA.ink : ON_MEDIA.text }, TABULAR]}>
                {BEST_ANGLE.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </PressableScale>
      );
    }
    return (
      <PressableScale
        key={a.id}
        {...common}
        className="flex-1 items-center justify-center"
        style={{ height: 44, borderRadius: 2, borderWidth: 1, borderColor: on ? c.on : c.border, backgroundColor: on ? c.on : c.fill }}
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
      </PressableScale>
    );
  });
  if (film) {
    // Like the key moment row: separate chips, scrolling sideways when they
    // do not fit, bleeding to the screen edge.
    return (
      <ScrollView
        testID="angle-switcher"
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel="Camera angle"
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        style={{ marginHorizontal: -16, flexGrow: 0 }}
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View testID="angle-switcher" accessibilityRole="tablist" accessibilityLabel="Camera angle" className="flex-row" style={{ gap: 8 }}>
      {chips}
    </View>
  );
}
