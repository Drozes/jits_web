/**
 * Semantic color tokens for the mobile app.
 *
 * Two parallel naming families coexist here:
 *
 *  1. Legacy shadcn-style tokens (background/card/primary/muted/...) used by
 *     the pre-redesign codebase. Kept for backwards compatibility while the
 *     ELO design system migration is in flight.
 *
 *  2. ELO design system tokens (bgPrimary/bgSecondary/bgElevated/...) mirroring
 *     apps/web/app/design-system/tokens.css 1:1. New code should reach for
 *     these via NativeWind classes (bg-primary, text-tertiary, accent-cta, ...).
 *
 * Most components should reach for the NativeWind class names defined in
 * tailwind.config.js. This module exists for the rare cases where a color
 * value must be passed into an RN API that does not accept className
 * (e.g. `StatusBar.barStyle`, `ActivityIndicator.color`, toast config,
 * Switch trackColor, BottomSheet backgroundStyle).
 */

export type ColorTokens = {
  // ---- Legacy shadcn-style ---------------------------------------------------
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

  // ---- ELO design system (Void / Paddock palettes) --------------------------
  bgPrimary: string;        // Void / Paddock — page background
  bgSecondary: string;      // Panel — lifted surface (nav, footer)
  bgElevated: string;       // Plate — card / data plate
  bgElevatedHover: string;  // Plate Bright — hover / focused state
  textPrimary: string;      // Terminal White / Void
  textSecondary: string;    // Data Gray Bright / #4B5563
  textTertiary: string;     // Data Gray
  textOnAccent: string;     // Always terminal white
  accentCta: string;        // Signal Red
  accentCtaHover: string;   // Lifted / dark variant for hover
  statePositive: string;    // Gain Green (dark for light mode)
  stateNegative: string;    // Signal Red
  stateNeutral: string;     // Data Gray
  borderHairline: string;       // Subtle divider
  borderHairlineFaint: string;  // Faintest divider
  borderHairlineStrong: string; // Strongest divider (still hairline)
};

export const lightTokens: ColorTokens = {
  // Legacy
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

  // ELO — Paddock family (light surfaces shift DARKER as they elevate)
  bgPrimary: "#F2F4F7",          // paddock
  bgSecondary: "#E8EBF0",        // paddock-panel
  bgElevated: "#DEE2E9",         // paddock-plate
  bgElevatedHover: "#D2D7E0",    // paddock-plate-bright
  textPrimary: "#0D0F14",        // void
  textSecondary: "#4B5563",      // AA-passing on light
  textTertiary: "#6B7280",       // data-gray
  textOnAccent: "#E8EDF2",       // terminal-white
  accentCta: "#E63946",          // signal-red
  accentCtaHover: "#C42939",     // signal-red-dark
  statePositive: "#15803D",      // gain-green-dark (AA on light)
  stateNegative: "#E63946",      // signal-red
  stateNeutral: "#6B7280",       // data-gray
  borderHairline: "rgba(13, 15, 20, 0.14)",
  borderHairlineFaint: "rgba(13, 15, 20, 0.07)",
  borderHairlineStrong: "rgba(13, 15, 20, 0.25)",
};

export const darkTokens: ColorTokens = {
  // Legacy
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

  // ELO — Void family (dark surfaces shift LIGHTER as they elevate)
  bgPrimary: "#0D0F14",          // void
  bgSecondary: "#13151B",        // panel
  bgElevated: "#1A1D24",         // plate
  bgElevatedHover: "#242832",    // plate-bright
  textPrimary: "#E8EDF2",        // terminal-white
  textSecondary: "#9CA3AF",      // data-gray-bright
  textTertiary: "#6B7280",       // data-gray
  textOnAccent: "#E8EDF2",       // terminal-white
  accentCta: "#E63946",          // signal-red
  accentCtaHover: "#F0556B",     // signal-red lifted
  statePositive: "#22C55E",      // gain-green
  stateNegative: "#E63946",      // signal-red
  stateNeutral: "#6B7280",       // data-gray
  borderHairline: "rgba(107, 114, 128, 0.25)",
  borderHairlineFaint: "rgba(107, 114, 128, 0.12)",
  borderHairlineStrong: "rgba(107, 114, 128, 0.40)",
};
