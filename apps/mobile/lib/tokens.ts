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
  background: "hsl(216, 24%, 96%)",
  foreground: "hsl(223, 21%, 6%)",
  card: "hsl(218, 20%, 89%)",
  cardForeground: "hsl(223, 21%, 6%)",
  popover: "hsl(218, 20%, 89%)",
  popoverForeground: "hsl(223, 21%, 6%)",
  primary: "hsl(355, 78%, 56%)",
  primaryForeground: "hsl(210, 28%, 93%)",
  secondary: "hsl(217, 21%, 93%)",
  secondaryForeground: "hsl(223, 21%, 6%)",
  muted: "hsl(219, 18%, 85%)",
  mutedForeground: "hsl(215, 14%, 34%)",
  accent: "hsl(355, 78%, 56%)",
  accentForeground: "hsl(210, 28%, 93%)",
  destructive: "hsl(355, 78%, 56%)",
  destructiveForeground: "hsl(210, 28%, 93%)",
  success: "hsl(142, 72%, 29%)",
  successForeground: "hsl(0, 0%, 100%)",
  border: "hsl(218, 12%, 83%)",
  input: "hsl(218, 14%, 79%)",
  ring: "hsl(355, 78%, 56%)",
  gold: "hsl(38, 92%, 50%)",
  brandOrange: "hsl(25, 95%, 53%)",
  deepRed: "hsl(355, 67%, 47%)",
};

export const darkTokens: ColorTokens = {
  background: "hsl(223, 21%, 6%)",
  foreground: "hsl(210, 28%, 93%)",
  card: "hsl(222, 16%, 12%)",
  cardForeground: "hsl(210, 28%, 93%)",
  popover: "hsl(222, 16%, 12%)",
  popoverForeground: "hsl(210, 28%, 93%)",
  primary: "hsl(355, 78%, 56%)",
  primaryForeground: "hsl(210, 28%, 93%)",
  secondary: "hsl(225, 17%, 9%)",
  secondaryForeground: "hsl(210, 28%, 93%)",
  muted: "hsl(223, 16%, 17%)",
  mutedForeground: "hsl(218, 11%, 65%)",
  accent: "hsl(355, 78%, 56%)",
  accentForeground: "hsl(210, 28%, 93%)",
  destructive: "hsl(355, 78%, 56%)",
  destructiveForeground: "hsl(210, 28%, 93%)",
  success: "hsl(142, 71%, 45%)",
  successForeground: "hsl(0, 0%, 100%)",
  border: "hsl(222, 13%, 18%)",
  input: "hsl(222, 13%, 21%)",
  ring: "hsl(355, 78%, 56%)",
  gold: "hsl(38, 92%, 50%)",
  brandOrange: "hsl(25, 95%, 53%)",
  deepRed: "hsl(355, 67%, 47%)",
};
