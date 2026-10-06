/**
 * Multi-angle player strings. Angle labels, row tags and helpers come from
 * the COPY-DECK v2.2 helpers (`angleText`, `angleTag`, `angleStatus`); the
 * strings below are NEW and need a deck amendment before the flag ships
 * (see docs/spikes/2026-10-multi-angle-player.md, "Design notes").
 */
export const MULTI_ANGLE_COPY = {
  approxSync: "Approx. sync",
  sheetTitle: "Angles",
  sheetHelper: "Only angles that are ready can play.",
  watching: "Watching",
  switchingTo: (label: string) => `Switching to ${label}`,
  nextAngle: "Next angle",
  previousAngle: "Previous angle",
  frameBack: "Back one frame",
  frameForward: "Forward one frame",
  videoSurface: "Match video. Swipe left or right to change angle.",
} as const;

/** `2 OF 3 ANGLES`: ready angles of all expected ones (the chip that opens the sheet). */
export function angleCountChip(ready: number, total: number): string {
  return ready === total ? `${total} ANGLES` : `${ready} OF ${total} ANGLES`;
}

/** Announced once when a switch lands (deck 10: state changes only). */
export function switchAnnouncement(label: string, approximate: boolean): string {
  return approximate ? `${label}. Approximate sync.` : `${label}.`;
}
