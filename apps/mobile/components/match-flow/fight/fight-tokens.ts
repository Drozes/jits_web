/**
 * Fixed "fight night" colors for the match flow around the live screen
 * (face-off, countdown, result, confirm, verdict). Like the live screen's
 * BROADCAST tokens they do not follow the app theme: the whole match flow is
 * dark, and the approved mockups pin these exact values.
 */
export const FIGHT = {
  bg: "#0D0F14",
  plate: "#16191F",
  panel: "#1E222A",
  black: "#000000",
  hairline: "rgba(255,255,255,0.14)",
  strong: "rgba(255,255,255,0.40)",
  text: "#E8EDF2",
  text2: "rgba(232,237,242,0.72)",
  /** Labels only, mono 10px and up. */
  text3: "rgba(232,237,242,0.55)",
  white: "#FFFFFF",
  tagText: "rgba(255,255,255,0.85)",
  cta: "#E63946",
  ctaPressed: "#F0556B",
  onCta: "#0D0F14",
  /** Red text / accent on dark. */
  red: "#F0556B",
  win: "#22C55E",
  winRule: "rgba(34,197,94,0.5)",
  loss: "#F0556B",
  amber: "#F59E0B",
  /** The light athlete chip (as on the live athlete bar). */
  chip: "rgba(232,235,240,0.96)",
  ink: "#0D0F14",
  ink3: "#575C68",
  inkRed: "#AC2B34",
  secondaryBg: "rgba(255,255,255,0.08)",
  secondaryBgPressed: "rgba(255,255,255,0.16)",
  selectedBg: "rgba(230,57,70,0.16)",
  scrim: "rgba(0,0,0,0.55)",
  glass: "rgba(0,0,0,0.45)",
} as const;

export const FIGHT_RADIUS = { tag: 2, button: 3, plate: 4 } as const;

/** Every number in the match flow uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Approved easing for the countdown and verdict celebration. */
export const FIGHT_EASING = [0.22, 1, 0.36, 1] as const;
