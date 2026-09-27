import * as React from "react";
import { View, type ViewProps } from "react-native";
import { StatusBar } from "expo-status-bar";
import { darkVarsStyle } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/cn";

/**
 * Root of every Film Room screen: pins the dark token set (so `bg-surface`,
 * `text-ink` and friends resolve to the fight-night palette in both app
 * themes) and turns the status bar light while mounted.
 */
export function FilmSurface({ className, style, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <View {...rest} className={cn("flex-1 bg-surface", className)} style={[darkVarsStyle, style]}>
      <StatusBar style="light" />
      {children}
    </View>
  );
}
