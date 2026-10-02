import { onMediaTokens as M } from "@/lib/tokens";

/**
 * Fixed colors and sizes for the live broadcast screen. The chrome sits over
 * camera video in both app themes, so it does not follow the light / dark
 * theme tokens. Every color is an alias into `onMediaTokens` (lib/tokens.ts),
 * the one on-media source shared with `ON_MEDIA`; the keys keep the live
 * screen's own names so call sites do not change.
 */
export const BROADCAST = {
  black: M.black,
  ground: M.ground,
  ink: M.ink,
  inkDark: M.text,
  ink3: M.ink3,
  cta: M.cta,
  ctaHover: M.red,
  ctaText: M.inkRed,
  amber: M.amber,
  amberSoft: M.amberSoft,
  amberSpent: M.amberSpent,
  amberRule: M.amberRuleSoft,
  slab: M.slab,
  plate: M.chip,
  plateBorder: M.chipBorder,
  glassFill: M.glassStrong,
  glassFillPressed: M.glassPressed,
  glassBorder: M.strong,
  tagFill: M.tagSoft,
  tagText: M.tagText,
  tallyGlass: M.tallyGlass,
  white: M.white,
  dim62: M.textDim,
  body72: M.text2,
  track: M.chipTrack,
  startingDim: M.dim,
  savingDim: M.scrim,
} as const;

export const BROADCAST_RADIUS = { tag: 2, button: 3, plate: 4 } as const;

export const BROADCAST_SIZE = {
  strip: 32,
  bar: 56,
  slab: 104,
  controls: 64,
  tally: 28,
  maxWidth: 480,
} as const;

/** Widescreen Sideline (landscape) deltas; everything else is as portrait. */
export const BROADCAST_LANDSCAPE = {
  lowerThird: 320,
  rail: 112,
  pauseTile: 112,
  holdTile: 180,
  slab: 96,
  top: 16,
  /** Added to the side safe inset (at least 16): 59 + 12 = 71 on a notched iPhone. */
  edge: 12,
  /** The lower-third and rail bottom: 21 clears the landscape home indicator. */
  bottom: 21,
} as const;

/**
 * The glass button look shared by Pause and Allow camera: 1 px white-40
 * border, white-12 fill (white-20 pressed), a 0.98 press-in.
 */
export function glassButtonStyle(pressed: boolean) {
  return {
    borderRadius: BROADCAST_RADIUS.button,
    borderWidth: 1,
    borderColor: BROADCAST.glassBorder,
    backgroundColor: pressed ? BROADCAST.glassFillPressed : BROADCAST.glassFill,
    transform: [{ scale: pressed ? 0.98 : 1 }],
  };
}

/** Every number on the live screen uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
