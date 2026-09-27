/**
 * Fixed colors for the Film Room (library, match page, player). Like the live
 * broadcast screen these surfaces are dark "fight night" in both app themes,
 * so the few values that must be passed as props (icons, SVG fills, overlays
 * on film) live here; everything else uses the semantic classes under
 * `<FilmSurface>`, which pins the dark token set.
 */
export const FILM = {
  bg: "#0D0F14",
  plate: "#16191F",
  panel: "#1E222A",
  hairline: "rgba(255,255,255,0.14)",
  strong: "rgba(255,255,255,0.40)",
  text: "#E8EDF2",
  text2: "rgba(232,237,242,0.72)",
  text3: "rgba(232,237,242,0.55)",
  white: "#FFFFFF",
  cta: "#E63946",
  redText: "#F0556B",
  win: "#22C55E",
  amber: "#F59E0B",
  amberRule: "rgba(245,158,11,0.7)",
  glass: "rgba(255,255,255,0.08)",
  glassStrong: "rgba(255,255,255,0.12)",
  track: "rgba(255,255,255,0.18)",
  tag: "rgba(0,0,0,0.45)",
  badge: "rgba(0,0,0,0.6)",
  lightChip: "rgba(232,235,240,0.96)",
  ink: "#0D0F14",
} as const;

/** Every number in the Film Room uses tabular figures. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
