/**
 * Colors for the match flow and Film Room that must be passed as props or
 * inline styles (icons, SVG fills, Switch tracks, computed borders).
 *
 * `usePalette()` follows the app theme: every value is the active scheme's
 * semantic token from `lib/tokens.ts`, plus the few tints the token set does
 * not carry (amber, translucent fills, rules), each chosen per scheme so text
 * keeps 4.5:1 on the theme's surfaces. Screens that CAN use className should
 * keep using the semantic classes (`bg-surface`, `text-ink`, ...).
 *
 * `ON_MEDIA` is the opposite: fixed colors for chrome drawn over camera,
 * video or a photo scrim, which is dark whatever the app theme.
 */
import { useResolvedColorScheme, type ColorScheme } from "./use-theme";
import { darkTokens, lightTokens } from "../tokens";

export interface Palette {
  /** Page background (`bg-surface`). */
  bg: string;
  /** Plate: cards, strips, inputs (`bg-surface-3`, as `<Plate>`). */
  plate: string;
  /** A step above the plate: tiles, the Switch track (`bg-surface-4`). */
  panel: string;
  hairline: string;
  strong: string;
  text: string;
  text2: string;
  /** Labels only, mono 10px and up. */
  text3: string;
  /** Signal Red fill (CTA, rules). Never text. */
  cta: string;
  ctaPressed: string;
  /** Label on the Signal Red fill. */
  onCta: string;
  /** Red text (AA-tuned per scheme). */
  red: string;
  win: string;
  winRule: string;
  loss: string;
  /** Amber text / fills: draws, pending and processing states. */
  amber: string;
  amberRule: string;
  /** Secondary button / chip fill on the page. */
  secondaryBg: string;
  secondaryBgPressed: string;
  /** A selected option's fill. */
  selectedBg: string;
  /** Progress / timeline track. */
  track: string;
}

export function paletteFor(scheme: ColorScheme): Palette {
  const t = scheme === "dark" ? darkTokens : lightTokens;
  const dark = scheme === "dark";
  return {
    bg: t.bgPrimary,
    plate: t.bgElevated,
    panel: t.bgElevatedHover,
    hairline: t.borderHairline,
    strong: t.borderHairlineStrong,
    text: t.textPrimary,
    text2: t.textSecondary,
    text3: t.textTertiary,
    cta: t.accentCta,
    ctaPressed: t.accentCtaHover,
    onCta: t.textOnAccent,
    red: t.accentCtaText,
    win: t.statePositive,
    loss: t.stateNegative,
    // Light: a #116A33 rule; dark: the gain green.
    winRule: dark ? "rgba(34,197,94,0.5)" : "rgba(17,106,51,0.55)",
    // No amber token: amber-500 reads on the dark plates, but on the light
    // plates only amber-800 reaches 4.5:1 (#92400E is 5.4:1 on #DEE2E9).
    amber: dark ? "#F59E0B" : "#92400E",
    amberRule: dark ? "rgba(245,158,11,0.7)" : "rgba(146,64,14,0.6)",
    secondaryBg: dark ? "rgba(255,255,255,0.08)" : "rgba(13,15,20,0.05)",
    secondaryBgPressed: dark ? "rgba(255,255,255,0.16)" : "rgba(13,15,20,0.10)",
    selectedBg: "rgba(230,57,70,0.16)",
    track: dark ? "rgba(255,255,255,0.18)" : "rgba(13,15,20,0.14)",
  };
}

const LIGHT = paletteFor("light");
const DARK = paletteFor("dark");

/** The palette for the app's current theme. */
export function usePalette(): Palette {
  return useResolvedColorScheme() === "dark" ? DARK : LIGHT;
}

/**
 * Chrome over camera, video or a photo scrim: dark in both app themes (like
 * the live screen's BROADCAST tokens).
 */
export const ON_MEDIA = {
  white: "#FFFFFF",
  text: "#E8EDF2",
  text2: "rgba(232,237,242,0.72)",
  text3: "rgba(232,237,242,0.55)",
  tagText: "rgba(255,255,255,0.85)",
  strong: "rgba(255,255,255,0.40)",
  cta: "#E63946",
  red: "#F0556B",
  redRule: "rgba(240,85,107,0.7)",
  win: "#22C55E",
  amber: "#F59E0B",
  amberRule: "rgba(245,158,11,0.7)",
  track: "rgba(255,255,255,0.18)",
  glass: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.12)",
  /** Tag fill over film (on a scrim). */
  tag: "rgba(0,0,0,0.45)",
  /**
   * Badge fill: dense enough that every on-media ink (red included) holds
   * 4.5:1 over a white frame or the light theme's plate.
   */
  badge: "rgba(0,0,0,0.88)",
  scrim: "rgba(0,0,0,0.55)",
  /** The light chip over the camera (countdown) and the player's caption plate. */
  chip: "rgba(232,235,240,0.96)",
  chipBorder: "rgba(13,15,20,0.34)",
  ink: "#0D0F14",
  ink3: "#575C68",
  inkRed: "#AC2B34",
} as const;

/** Every number in the match flow and Film Room uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
