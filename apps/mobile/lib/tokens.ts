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
 * Plus, outside ColorTokens, `onMediaTokens` (bottom of this file): the fixed
 * palette for chrome over camera, video or photo, behind ON_MEDIA and BROADCAST.
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
  textTertiary: string;     // Data Gray, AA (4.5:1) on every surface
  textOnAccent: string;     // Label sitting ON the Signal Red fill
  accentCta: string;        // Signal Red (BRAND). Fills and rules only, never text.
  accentCtaText: string;    // Signal Red tuned for TEXT, AA on every surface
  accentCtaHover: string;   // Lifted / dark variant for hover
  statePositive: string;    // Gain Green (dark for light mode)
  stateNegative: string;    // Signal Red tuned for text
  stateNeutral: string;     // Data Gray (tracks textTertiary)
  borderHairline: string;       // Subtle divider
  borderHairlineFaint: string;  // Faintest divider
  borderHairlineStrong: string; // Strongest divider (still hairline)

  // ---- Attention (amber) and Arena heat (added WP7, jits-3eeg.8) ----------
  // Kit names in design/system/project/tokens.json: attention, attention-rule,
  // heat-orange, heat-red. CSS var = kebab of the key (--attention, ...),
  // Tailwind: text-attention / border-attention / bg-attention,
  // border-attention-rule, bg-heat-orange, bg-heat-red.
  attention: string;       // Amber: draws, pressure score, pending / processing / paused / disputed. Text and icons.
  attentionRule: string;   // Amber rule or border (dashed pending edge, draw tile border). Rules only, never text.
  heatOrange: string;      // Arena heat only (tab-icon embers, afterglow edge). Same in both themes.
  heatRed: string;         // Arena heat only (countable embers). Same in both themes; NOT a text red.
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
  bgPrimary: "#F8FAFC",          // paddock (lifted: plate separation 1.18 -> 1.24)
  bgSecondary: "#E8EBF0",        // paddock-panel
  bgElevated: "#DEE2E9",         // paddock-plate
  bgElevatedHover: "#D2D7E0",    // paddock-plate-bright (darkest surface, sets the ink floor)
  textPrimary: "#0D0F14",        // void: 13.27:1 on the darkest surface
  textSecondary: "#4B5563",      // 5.23:1 on the darkest surface
  textTertiary: "#575C68",       // data-gray-dark: 4.64:1 on the darkest surface (was #6B7280, 3.35:1)
  textOnAccent: "#0D0F14",       // void on signal-red: 4.60:1 (was #E8EDF2, 3.54:1)
  accentCta: "#E63946",          // signal-red, BRAND, unchanged
  accentCtaText: "#AC2B34",      // signal-red-text: 4.62:1 on the darkest surface
  accentCtaHover: "#F0556B",     // signal-red lifted: 5.67:1 under the void label (was #C42939, 3.40:1)
  statePositive: "#116A33",      // gain-green-dark: 4.64:1 on the darkest surface (was #15803D, 3.47:1)
  stateNegative: "#AC2B34",      // matches accentCtaText, text-only usage
  stateNeutral: "#575C68",       // tracks textTertiary
  borderHairline: "rgba(13, 15, 20, 0.22)",
  borderHairlineFaint: "rgba(13, 15, 20, 0.11)",
  borderHairlineStrong: "rgba(13, 15, 20, 0.34)",

  // Attention: amber-500 fails 4.5:1 on the light plates, so light uses
  // amber-800 (#92400E, 4.91:1 on the darkest light surface).
  attention: "#92400E",
  attentionRule: "rgba(146,64,14,0.6)",
  // Heat is fixed in both themes (Arena heat, not a theme color).
  heatOrange: "hsl(25, 95%, 53%)",
  heatRed: "#EC6A74",
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
  bgPrimary: "#0D0F14",          // void (unchanged: matches app.json splash, no native drift)
  bgSecondary: "#13151B",        // panel
  bgElevated: "#1E222B",         // plate (lifted: page separation 1.14 -> 1.20)
  bgElevatedHover: "#262A34",    // plate-bright (lightest surface, sets the ink floor)
  textPrimary: "#E8EDF2",        // terminal-white: 12.18:1 on the lightest surface
  textSecondary: "#9CA3AF",      // data-gray-bright: 5.65:1 on the lightest surface
  textTertiary: "#8D929D",       // data-gray-lift: 4.60:1 on the lightest surface (was #6B7280, 3.05:1)
  textOnAccent: "#0D0F14",       // void on signal-red: 4.60:1 (was #E8EDF2, 3.54:1)
  accentCta: "#E63946",          // signal-red, BRAND, unchanged
  accentCtaText: "#EC6A74",      // signal-red-text: 4.70:1 on the lightest surface
  accentCtaHover: "#F0556B",     // signal-red lifted: 5.67:1 under the void label (was 2.87:1 under the white one)
  statePositive: "#22C55E",      // gain-green: 6.30:1 on the lightest surface
  stateNegative: "#EC6A74",      // matches accentCtaText, text-only usage
  stateNeutral: "#8D929D",       // tracks textTertiary
  borderHairline: "rgba(107, 114, 128, 0.45)",
  borderHairlineFaint: "rgba(107, 114, 128, 0.20)",
  borderHairlineStrong: "rgba(107, 114, 128, 0.62)",

  // Attention: amber-500, 6.68:1 on the lightest dark surface.
  attention: "#F59E0B",
  attentionRule: "rgba(245,158,11,0.7)",
  // Heat is fixed in both themes (Arena heat, not a theme color).
  heatOrange: "hsl(25, 95%, 53%)",
  heatRed: "#EC6A74",
};

/**
 * ON-MEDIA: the ONE source for chrome drawn over camera, video or a photo.
 * Fixed in both app themes (the media under it is what sets the ground, not
 * the theme). `ON_MEDIA` (lib/theme/palette.ts) and `BROADCAST`
 * (components/match-flow/live/broadcast-tokens.ts) both read from here; add a
 * value here, never a new literal in either alias.
 *
 * Kit names (design/system/project/tokens.json): `on-media-<kebab key>`, for
 * example `glassStrong` is `on-media-glass-strong`. The mirror drift test
 * (__tests__/lib/tokens-mirror-drift.test.ts) fails when the two disagree.
 *
 * CONTRAST RULE: on-media TEXT sits only on a `badge` or `chip` ground.
 *  - Light inks (white, text, text2, text3, tagText, red, win, amber) on the
 *    `badge` fill (0.88 black) hold 4.5:1 even over a white frame.
 *  - Dark inks (ink, ink3, inkRed) on the light `chip` hold 4.5:1 even over a
 *    black frame.
 *  - `tag`, `tagSoft`, `scrim`, `glass*` and `slab` are fills for marks and
 *    controls; text on them depends on the frame under it (tag text over a
 *    white frame is about 2.9:1). `text3` is a label/mark tint, only legible
 *    on `badge`.
 */
export const onMediaTokens = {
  // Light inks (text and marks over dark media)
  white: "#FFFFFF",
  text: "#E8EDF2",
  text2: "rgba(232,237,242,0.72)",
  /** Dimmed label over media (live clock FINAL, idle strip labels). */
  textDim: "rgba(232,237,242,0.62)",
  text3: "rgba(232,237,242,0.55)",
  tagText: "rgba(255,255,255,0.85)",
  /** Strong 1px border over media (glass buttons, tags). */
  strong: "rgba(255,255,255,0.40)",
  // Accents
  /** Signal Red FILL over media. Never text. */
  cta: "#E63946",
  /** Red TEXT over media (the lifted red). Also the pressed CTA fill. */
  red: "#F0556B",
  redRule: "rgba(240,85,107,0.7)",
  /** Gain Green over media: LIVE pill, LiveDot, win text on film. */
  win: "#22C55E",
  /** Attention amber over media (paused clock, pending HUD states). */
  amber: "#F59E0B",
  amberRule: "rgba(245,158,11,0.7)",
  /** The softer amber rule on the live strip. */
  amberRuleSoft: "rgba(245,158,11,0.5)",
  amberSoft: "rgba(245,158,11,0.16)",
  amberSpent: "rgba(245,158,11,0.22)",
  // Fills
  /** Pure black: the media surface itself (behind video, camera letterbox). */
  black: "#000000",
  /** The Void ground of the live broadcast screen. */
  ground: "#0D0F14",
  /** Progress / seek track over media. */
  track: "rgba(255,255,255,0.18)",
  glass: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.12)",
  glassPressed: "rgba(255,255,255,0.20)",
  /** Tag fill over film (on a scrim). Marks only; see the contrast rule. */
  tag: "rgba(0,0,0,0.45)",
  /** The lighter tag fill of the live HUD tag. Marks only; see the contrast rule. */
  tagSoft: "rgba(0,0,0,0.40)",
  /** THE safe ground for on-media text (every light ink holds 4.5:1 over a white frame). */
  badge: "rgba(0,0,0,0.88)",
  scrim: "rgba(0,0,0,0.55)",
  /** The lighter dim while the live screen is starting. */
  dim: "rgba(0,0,0,0.35)",
  /** The live clock slab. */
  slab: "rgba(13,15,20,0.92)",
  /** The ON AIR tally glass. */
  tallyGlass: "rgba(13,15,20,0.72)",
  // The light chip over the camera, and its dark inks
  /** THE safe ground for dark on-media text (countdown caption, player caption plate). */
  chip: "rgba(232,235,240,0.96)",
  chipBorder: "rgba(13,15,20,0.34)",
  /** The live screen's dark track (state strip bottom track, hold-to-end drain). */
  chipTrack: "rgba(13,15,20,0.25)",
  ink: "#0D0F14",
  ink3: "#575C68",
  inkRed: "#AC2B34",
} as const;

export type OnMediaToken = keyof typeof onMediaTokens;
