import * as React from "react";
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";
import { useThemedTokens } from "../../lib/theme/use-theme";

export interface SwitchProps extends Omit<RNSwitchProps, "accessibilityLabel"> {
  /**
   * Required accessible name: the visible label of the setting this switch
   * controls. RN does not associate a sibling <Text> with the switch, so
   * without it a screen reader announces only "switch".
   */
  label: string;
}

export const Switch = React.forwardRef<RNSwitch, SwitchProps>(
  ({ label, ...props }, ref) => {
    const tokens = useThemedTokens();
    return (
      <RNSwitch
        ref={ref}
        accessibilityLabel={label}
        trackColor={{ false: tokens.muted, true: tokens.primary }}
        thumbColor={tokens.background}
        ios_backgroundColor={tokens.muted}
        {...props}
      />
    );
  },
);
Switch.displayName = "Switch";
