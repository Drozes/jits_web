import * as React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { darkTokens } from "@/lib/tokens";

/** Top scrim: `void` 50% to 0 over 120 pt (spec 8.2). */
export const TOP_SCRIM_PT = 120;
/** Bottom scrim: 0 to `void` 70% over 400 pt (design review: no text on raw video). */
export const BOTTOM_SCRIM_PT = 400;
/** Right-edge scrim behind the rail: 0 to `void` 45% over 96 pt. */
export const RAIL_SCRIM_PT = 96;

interface BandProps {
  id: string;
  style: ViewStyle;
  /** Gradient axis: vertical (top to bottom) or horizontal (left to right). */
  horizontal?: boolean;
  from: number;
  to: number;
}

function Band({ id, style, horizontal = false, from, to }: BandProps) {
  // Gradient ids are unique per page: several pages are mounted at once.
  const gradientId = `${id}-${React.useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <View testID={id} pointerEvents="none" style={[{ position: "absolute" }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
            <Stop offset="0" stopColor={darkTokens.bgPrimary} stopOpacity={from} />
            <Stop offset="1" stopColor={darkTokens.bgPrimary} stopOpacity={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

/**
 * The legibility scrims of a full-bleed reel page (react-native-svg, already
 * linked; no expo-linear-gradient): every overlay sits on one of these, never
 * on raw video. The right-edge band is drawn only when the rail is.
 */
export function ReelScrims({ rail }: { rail: boolean }) {
  return (
    <View testID="reel-scrims" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Band id="reel-scrim-top" style={{ top: 0, left: 0, right: 0, height: TOP_SCRIM_PT }} from={0.5} to={0} />
      <Band id="reel-scrim-bottom" style={{ bottom: 0, left: 0, right: 0, height: BOTTOM_SCRIM_PT }} from={0} to={0.7} />
      {rail ? <Band id="reel-scrim-rail" style={{ top: 0, bottom: 0, right: 0, width: RAIL_SCRIM_PT }} horizontal from={0} to={0.45} /> : null}
    </View>
  );
}
