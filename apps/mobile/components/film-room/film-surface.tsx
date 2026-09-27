import * as React from "react";
import { View, type ViewProps } from "react-native";
import { StatusBar } from "expo-status-bar";
import { darkVarsStyle } from "@/lib/theme/theme-provider";
import { ForcedSchemeContext } from "@/lib/theme/forced-scheme-context";
import { cn } from "@/lib/cn";

/**
 * Root of every Film Room screen: pins the dark token set (so `bg-surface`,
 * `text-ink` and friends resolve to the fight-night palette in both app
 * themes), tells `useThemedTokens()` / `useResolvedColorScheme()` below it
 * that the scheme is dark (the same context `ForceDarkTheme` provides for the
 * match flow), and turns the status bar light while mounted.
 */
export function FilmSurface({ className, style, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <ForcedSchemeContext.Provider value="dark">
      <View {...rest} className={cn("flex-1 bg-surface", className)} style={[darkVarsStyle, style]}>
        <StatusBar style="light" />
        {children}
      </View>
    </ForcedSchemeContext.Provider>
  );
}
