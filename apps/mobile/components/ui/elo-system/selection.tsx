import * as React from "react";
import { View } from "react-native";
import { Check } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * The ONE selected-state treatment (WP2, bead jits-3eeg.3; R3 ST-2, MF-5, D-7;
 * DESIGN.md "Selected is a surface, not a color"):
 *
 *   selected   = `plate-bright` fill + `hairline-strong` edge + `ink` label,
 *                plus an `ink` check glyph (`SelectCheck`) wherever the
 *                option would otherwise rely on its edge alone
 *   unselected = `plate` fill + `hairline-strong` edge
 *
 * Never a Signal Red fill, border, dot or check: red is for the step's one
 * CTA and for negatives. `hairline-strong` is below 3:1 on every surface, so
 * the surface step and the glyph carry the state, not the edge. The chip is
 * the one documented exception to the glyph (its label also steps from
 * `ink-2` to `ink`; DESIGN.md Open decision 14).
 */
export const SELECTED_SURFACE = "bg-surface-4 border-hairline-strong";
export const UNSELECTED_SURFACE = "bg-surface-3 border-hairline-strong";

/** Class pair for an option: `selectionSurface(active)`. */
export function selectionSurface(selected: boolean): string {
  return selected ? SELECTED_SURFACE : UNSELECTED_SURFACE;
}

/**
 * The `ink` check glyph of a selected option (decorative: the control carries
 * `accessibilityState`). Pass `color` from `usePalette().text` in the match
 * flow; it defaults to the theme's `ink`.
 */
export function SelectCheck({ size = 14, color }: { size?: number; color?: string }) {
  const tokens = useThemedTokens();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Check size={size} strokeWidth={2.5} color={color ?? tokens.textPrimary} />
    </View>
  );
}
