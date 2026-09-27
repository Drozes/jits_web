/** 9:16 at the card's width, capped at 480 pt tall (spec 014 section 10). */
export const HIGHLIGHT_FRAME_STYLE = {
  height: 480,
  maxWidth: "100%",
  aspectRatio: 9 / 16,
  alignSelf: "center",
} as const;
