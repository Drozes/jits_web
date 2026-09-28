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
 *
 * `fill={false}` sizes the scope to its content instead of `flex: 1`, for a
 * dynamically sized sheet's content: gorhom portals a BottomSheetModal's
 * content to the root provider, OUTSIDE the scope it was opened from, so a
 * sheet opened over forced-dark video re-enters the scope around its content
 * (see `lib/theme/use-sheet-scheme-scope.tsx`).
 */
export function ForceDarkTheme({
  children,
  style,
  fill = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
}) {
  return (
    <ForcedSchemeContext.Provider value="dark">
      <View style={[fill ? { flex: 1 } : null, darkVarsStyle, style]}>{children}</View>
    </ForcedSchemeContext.Provider>
  );
}
