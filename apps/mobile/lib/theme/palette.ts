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
import { darkTokens, lightTokens, onMediaTokens } from "../tokens";

export interface Palette {
  /** Page background (`bg-surface`). */
  bg: string;
  /** Plate: cards, strips, inputs (`bg-surface-3`, as `<Plate>`). */
  plate: string;
  /** A step above the plate (`plate-bright`, `bg-surface-4`): tiles, pressed and selected options. */
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
  /** Attention amber (`attention` token): draws, pressure, pending / processing / paused / disputed. */
  amber: string;
  amberRule: string;
  /** Secondary button / chip fill on the page. */
  secondaryBg: string;
  secondaryBgPressed: string;
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
    // The `attention` token pair (amber-500 dark, amber-800 light).
    amber: t.attention,
    amberRule: t.attentionRule,
    secondaryBg: dark ? "rgba(255,255,255,0.08)" : "rgba(13,15,20,0.05)",
    secondaryBgPressed: dark ? "rgba(255,255,255,0.16)" : "rgba(13,15,20,0.10)",
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
 * Chrome over camera, video or a photo scrim: dark in both app themes. An
 * alias of `onMediaTokens` in lib/tokens.ts, the one on-media source (the
 * live screen's BROADCAST reads from it too). Contrast rule: on-media text
 * sits only on `ON_MEDIA.badge` or (dark inks) `ON_MEDIA.chip`; see the
 * comment on `onMediaTokens`.
 */
export const ON_MEDIA = onMediaTokens;

/** Every number in the match flow and Film Room uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
