import * as React from "react";
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";
import type { ColorTokens } from "../../lib/tokens";
import { useThemedTokens } from "../../lib/theme/use-theme";

type SwitchColors = Pick<RNSwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor">;

/**
 * The one switch look (WP2, R3 ST-1): a neutral track, never Signal Red or
 * Gain Green. "On" is an `ink` track, "off" an `ink-3` track, and the thumb
 * is the page color (`void`), so the thumb holds contrast on both tracks in
 * both themes and on and off differ by the track's lightness as well as the
 * thumb's side. Exported so the face-off record toggle (a raw RN `Switch`
 * until WP4) shares the same look.
 */
export function switchColors(t: ColorTokens): SwitchColors {
  return {
    trackColor: { false: t.textTertiary, true: t.textPrimary },
    thumbColor: t.bgPrimary,
    ios_backgroundColor: t.textTertiary,
  };
}

/** The switch colors for the active theme. */
export function useSwitchColors(): SwitchColors {
  return switchColors(useThemedTokens());
}

export interface SwitchProps
  extends Omit<RNSwitchProps, "accessibilityLabel" | "trackColor" | "thumbColor" | "ios_backgroundColor"> {
  /**
   * Required accessible name: the visible label of the setting this switch
   * controls. RN does not associate a sibling <Text> with the switch, so
   * without it a screen reader announces only "switch".
   */
  label: string;
}

export const Switch = React.forwardRef<RNSwitch, SwitchProps>(
  ({ label, ...props }, ref) => {
    const colors = useSwitchColors();
    return <RNSwitch ref={ref} accessibilityLabel={label} {...colors} {...props} />;
  },
);
Switch.displayName = "Switch";
