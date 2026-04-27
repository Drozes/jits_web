import * as React from "react";
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";
import { lightTokens } from "../../lib/tokens";

export interface SwitchProps extends RNSwitchProps {}

export const Switch = React.forwardRef<RNSwitch, SwitchProps>(
  (props, ref) => (
    <RNSwitch
      ref={ref}
      trackColor={{ false: lightTokens.muted, true: lightTokens.primary }}
      thumbColor={lightTokens.background}
      ios_backgroundColor={lightTokens.muted}
      {...props}
    />
  ),
);
Switch.displayName = "Switch";
