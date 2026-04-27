import * as React from "react";
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from "react-native";
import { useThemedTokens } from "../../lib/theme/use-theme";

export interface SwitchProps extends RNSwitchProps {}

export const Switch = React.forwardRef<RNSwitch, SwitchProps>(
  (props, ref) => {
    const tokens = useThemedTokens();
    return (
      <RNSwitch
        ref={ref}
        trackColor={{ false: tokens.muted, true: tokens.primary }}
        thumbColor={tokens.background}
        ios_backgroundColor={tokens.muted}
        {...props}
      />
    );
  },
);
Switch.displayName = "Switch";
