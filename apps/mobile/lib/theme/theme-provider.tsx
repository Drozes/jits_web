/**
 * Root theme provider. Wraps the app in a View whose `style` sets every CSS
 * variable used by Tailwind's semantic tokens. Light values are the defaults
 * declared in `tailwind.config.js` (`addBase` plugin); when the system color
 * scheme reports `dark`, this component applies a `vars()` override that
 * propagates the dark token values to all descendants.
 *
 * Components do NOT need to add `dark:` modifiers to every className — they
 * simply use `bg-background`, `text-foreground`, etc. and the values flip
 * automatically when the system theme changes.
 */
import * as React from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { useResolvedColorScheme } from "./use-theme";
import { darkTokens } from "../tokens";

const darkVars = vars({
  "--background": darkTokens.background,
  "--foreground": darkTokens.foreground,
  "--card": darkTokens.card,
  "--card-foreground": darkTokens.cardForeground,
  "--popover": darkTokens.popover,
  "--popover-foreground": darkTokens.popoverForeground,
  "--primary": darkTokens.primary,
  "--primary-foreground": darkTokens.primaryForeground,
  "--secondary": darkTokens.secondary,
  "--secondary-foreground": darkTokens.secondaryForeground,
  "--muted": darkTokens.muted,
  "--muted-foreground": darkTokens.mutedForeground,
  "--accent": darkTokens.accent,
  "--accent-foreground": darkTokens.accentForeground,
  "--destructive": darkTokens.destructive,
  "--destructive-foreground": darkTokens.destructiveForeground,
  "--success": darkTokens.success,
  "--success-foreground": darkTokens.successForeground,
  "--border": darkTokens.border,
  "--input": darkTokens.input,
  "--ring": darkTokens.ring,
  "--gold": darkTokens.gold,
  "--brand-orange": darkTokens.brandOrange,
  "--deep-red": darkTokens.deepRed,
});

export interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const scheme = useResolvedColorScheme();
  // In light mode the root `:root` defaults from `tailwind.config.js` apply.
  // In dark mode we layer the `darkVars` style on top so descendants inherit
  // the dark token values via CSS custom properties.
  const style = scheme === "dark" ? darkVars : undefined;
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
