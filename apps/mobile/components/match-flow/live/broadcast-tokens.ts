/**
 * Fixed colors and sizes for the live broadcast screen. The chrome sits over
 * camera video in both app themes, so it does not follow the light / dark
 * theme tokens.
 */
export const BROADCAST = {
  black: "#000000",
  ground: "#0D0F14",
  ink: "#0D0F14",
  inkDark: "#E8EDF2",
  ink3: "#575C68",
  cta: "#E63946",
  ctaHover: "#F0556B",
  ctaText: "#AC2B34",
  amber: "#F59E0B",
  amberSoft: "rgba(245,158,11,0.16)",
  amberSpent: "rgba(245,158,11,0.22)",
  amberRule: "rgba(245,158,11,0.5)",
  slab: "rgba(13,15,20,0.92)",
  plate: "rgba(232,235,240,0.96)",
  plateBorder: "rgba(13,15,20,0.34)",
  glassFill: "rgba(255,255,255,0.12)",
  glassFillPressed: "rgba(255,255,255,0.20)",
  glassBorder: "rgba(255,255,255,0.40)",
  tagFill: "rgba(0,0,0,0.40)",
  tagText: "rgba(255,255,255,0.85)",
  tallyGlass: "rgba(13,15,20,0.72)",
  white: "#FFFFFF",
  dim62: "rgba(232,237,242,0.62)",
  body72: "rgba(232,237,242,0.72)",
  track: "rgba(13,15,20,0.25)",
  startingDim: "rgba(0,0,0,0.35)",
  savingDim: "rgba(0,0,0,0.55)",
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
 * The glass button look of Pause (and the `glass` Button, Allow camera):
 * 1 px white-40 border, white-12 fill (white-20 pressed). The press-in is
 * `PressableScale`'s registered press scale (0.97), not part of this style.
 */
export function glassButtonStyle(pressed: boolean) {
  return {
    borderRadius: BROADCAST_RADIUS.button,
    borderWidth: 1,
    borderColor: BROADCAST.glassBorder,
    backgroundColor: pressed ? BROADCAST.glassFillPressed : BROADCAST.glassFill,
  };
}

/** Every number on the live screen uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
