import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { darkVarsStyle } from "./theme-provider";
import { ForcedSchemeContext } from "./forced-scheme-context";

/**
 * Pins its subtree to the dark token set, whatever the system or user theme:
 * semantic classes (`bg-surface`, `text-ink`, ...) resolve through the dark
 * CSS variables, and `useThemedTokens()` / `useResolvedColorScheme()` report
 * dark. Only for full-bleed video where themed components draw over the
 * picture (the Film Room player's state panel); every other screen follows
 * the app theme.
 */
export function ForceDarkTheme({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ForcedSchemeContext.Provider value="dark">
      <View style={[{ flex: 1 }, darkVarsStyle, style]}>{children}</View>
    </ForcedSchemeContext.Provider>
  );
}
