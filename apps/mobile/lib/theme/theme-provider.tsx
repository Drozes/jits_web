/**
 * Root theme provider. Wraps the app in a View whose `style` sets every CSS
 * variable used by Tailwind's semantic tokens. Light values are the defaults
 * declared in `tailwind.config.js` (`addBase` plugin); when the system color
 * scheme reports `dark`, this component applies a `vars()` override that
 * propagates the dark token values to all descendants.
 *
 * Components do NOT need to add `dark:` modifiers to every className — they
 * simply use `bg-background`, `text-foreground`, `bg-elevated`, `text-tertiary`,
 * etc. and the values flip automatically when the system theme changes.
 */
import * as React from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { useResolvedColorScheme, useRestoreThemePreference } from "./use-theme";
import { darkTokens, lightTokens } from "../tokens";

function buildVars(t: typeof lightTokens) {
  return vars({
    // Legacy shadcn-style tokens
    "--background": t.background,
    "--foreground": t.foreground,
    "--card": t.card,
    "--card-foreground": t.cardForeground,
    "--popover": t.popover,
    "--popover-foreground": t.popoverForeground,
    "--primary": t.primary,
    "--primary-foreground": t.primaryForeground,
    "--secondary": t.secondary,
    "--secondary-foreground": t.secondaryForeground,
    "--muted": t.muted,
    "--muted-foreground": t.mutedForeground,
    "--accent": t.accent,
    "--accent-foreground": t.accentForeground,
    "--destructive": t.destructive,
    "--destructive-foreground": t.destructiveForeground,
    "--success": t.success,
    "--success-foreground": t.successForeground,
    "--border": t.border,
    "--input": t.input,
    "--ring": t.ring,
    "--gold": t.gold,
    "--brand-orange": t.brandOrange,
    "--deep-red": t.deepRed,
    // ELO design system tokens
    "--bg-primary": t.bgPrimary,
    "--bg-secondary": t.bgSecondary,
    "--bg-elevated": t.bgElevated,
    "--bg-elevated-hover": t.bgElevatedHover,
    "--text-primary": t.textPrimary,
    "--text-secondary": t.textSecondary,
    "--text-tertiary": t.textTertiary,
    "--text-on-accent": t.textOnAccent,
    "--accent-cta": t.accentCta,
    "--accent-cta-hover": t.accentCtaHover,
    "--state-positive": t.statePositive,
    "--state-negative": t.stateNegative,
    "--state-neutral": t.stateNeutral,
    "--border-hairline": t.borderHairline,
    "--border-hairline-faint": t.borderHairlineFaint,
    "--border-hairline-strong": t.borderHairlineStrong,
  });
}

const lightVarsStyle = buildVars(lightTokens);
const darkVarsStyle = buildVars(darkTokens);

export interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const scheme = useResolvedColorScheme();
  const { restore } = useRestoreThemePreference();

  React.useEffect(() => {
    // Defer restore so the navigation tree finishes mounting first;
    // calling setColorScheme synchronously during the initial layout
    // triggers a state update on the Stack before it's ready.
    const id = requestAnimationFrame(() => restore());
    return () => cancelAnimationFrame(id);
  }, []);

  // Always apply a vars() style so React updates the existing View in-place
  // rather than remounting children (which would tear down the navigation
  // container and crash Expo Router).
  const themeVars = scheme === "dark" ? darkVarsStyle : lightVarsStyle;
  return <View style={[{ flex: 1 }, themeVars]}>{children}</View>;
}
