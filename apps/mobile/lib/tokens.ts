/**
 * Semantic color tokens for the mobile app. Ported from apps/web/app/globals.css.
 *
 * Most components should reach for the NativeWind class names defined in
 * tailwind.config.js (`bg-background`, `text-foreground`, `bg-primary`, etc.).
 * This module exists for the rare cases where a color value must be passed
 * into an RN API that does not accept className (e.g. `StatusBar.barStyle`,
 * `ActivityIndicator.color`, `react-native-toast-message` config).
 */

export type ColorTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  border: string;
  input: string;
  ring: string;
  gold: string;
  brandOrange: string;
  deepRed: string;
};

export const lightTokens: ColorTokens = {
  background: "hsl(220, 20%, 97%)",
  foreground: "hsl(222, 47%, 11%)",
  card: "hsl(0, 0%, 100%)",
  cardForeground: "hsl(222, 47%, 11%)",
  popover: "hsl(0, 0%, 100%)",
  popoverForeground: "hsl(222, 47%, 11%)",
  primary: "hsl(0, 85%, 46%)",
  primaryForeground: "hsl(0, 0%, 100%)",
  secondary: "hsl(220, 14%, 94%)",
  secondaryForeground: "hsl(222, 47%, 11%)",
  muted: "hsl(220, 14%, 92%)",
  mutedForeground: "hsl(220, 9%, 46%)",
  accent: "hsl(0, 85%, 46%)",
  accentForeground: "hsl(0, 0%, 100%)",
  destructive: "hsl(0, 84%, 50%)",
  destructiveForeground: "hsl(0, 0%, 100%)",
  success: "hsl(145, 63%, 37%)",
  successForeground: "hsl(0, 0%, 100%)",
  border: "hsl(220, 13%, 91%)",
  input: "hsl(220, 13%, 87%)",
  ring: "hsl(0, 85%, 46%)",
  gold: "hsl(38, 92%, 50%)",
  brandOrange: "hsl(25, 95%, 53%)",
  deepRed: "hsl(0, 84%, 50%)",
};

export const darkTokens: ColorTokens = {
  background: "hsl(224, 25%, 6%)",
  foreground: "hsl(210, 40%, 98%)",
  card: "hsl(224, 25%, 9%)",
  cardForeground: "hsl(210, 40%, 98%)",
  popover: "hsl(224, 25%, 9%)",
  popoverForeground: "hsl(210, 40%, 98%)",
  primary: "hsl(0, 85%, 50%)",
  primaryForeground: "hsl(0, 0%, 100%)",
  secondary: "hsl(224, 25%, 14%)",
  secondaryForeground: "hsl(210, 40%, 98%)",
  muted: "hsl(224, 20%, 16%)",
  mutedForeground: "hsl(218, 11%, 55%)",
  accent: "hsl(0, 85%, 50%)",
  accentForeground: "hsl(0, 0%, 100%)",
  destructive: "hsl(0, 84%, 60%)",
  destructiveForeground: "hsl(0, 0%, 100%)",
  success: "hsl(145, 63%, 49%)",
  successForeground: "hsl(0, 0%, 100%)",
  border: "hsl(224, 18%, 16%)",
  input: "hsl(224, 18%, 20%)",
  ring: "hsl(0, 85%, 50%)",
  gold: "hsl(38, 92%, 50%)",
  brandOrange: "hsl(25, 95%, 53%)",
  deepRed: "hsl(0, 84%, 50%)",
};
