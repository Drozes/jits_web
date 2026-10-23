/**
 * The live preview box, drawn at the aspect the camera actually records.
 *
 * The interface is locked when the match goes live, and the camera records in
 * that orientation (720p or 1080p, spec 13.4): a portrait frame (9:16) or a
 * landscape frame (16:9). The preview is sized to FIT the screen
 * at that aspect, never to fill it, so what the athlete sees is exactly what
 * is recorded. Portrait: full width, top-aligned (on a screen too short for
 * that, a tablet, full height and horizontally centered). Landscape: full
 * height, horizontally centered (on a window taller than 16:9, full width
 * and vertically centered). The rest of the screen is black.
 */
export const RECORDED_ASPECT = 9 / 16;
export const RECORDED_ASPECT_LANDSCAPE = 16 / 9;

export interface RecordedFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

export function fitRecordedFrame(screenWidth: number, screenHeight: number): RecordedFrame {
  if (screenWidth > screenHeight) {
    const width = screenHeight * RECORDED_ASPECT_LANDSCAPE;
    if (width <= screenWidth) {
      return { width, height: screenHeight, left: (screenWidth - width) / 2, top: 0 };
    }
    const height = screenWidth / RECORDED_ASPECT_LANDSCAPE;
    return { width: screenWidth, height, left: 0, top: (screenHeight - height) / 2 };
  }
  const height = screenWidth / RECORDED_ASPECT;
  if (height <= screenHeight) return { width: screenWidth, height, left: 0, top: 0 };
  const width = screenHeight * RECORDED_ASPECT;
  return { width, height: screenHeight, left: (screenWidth - width) / 2, top: 0 };
}

/**
 * The ready check's 16:9 preview card width in a landscape window, so the
 * preview plus the Ready controls fit with at most a short scroll. The card
 * also caps at the content width. Null in portrait (the card is full width).
 */
export function readyPreviewWidth(windowWidth: number, windowHeight: number): number | null {
  if (windowWidth <= windowHeight) return null;
  return 0.6 * windowHeight * RECORDED_ASPECT_LANDSCAPE;
}

/**
 * The side gutter of the screens that host the ready card: the match
 * wizard's and practice's ScrollView padding (`match-flow-wizard.tsx`,
 * `app/(app)/practice.tsx`).
 */
export const READY_CARD_GUTTER = 16;

/** The ready card's border (`camera-overlay.tsx`, `border`), on each side. */
const READY_CARD_BORDER = 1;

/**
 * The least height the two lines under the shipped 16:9 ready card ever
 * took: `Preview only. Recording starts with the match.` and the retired
 * sideways hint, at least one 13 pt line each at the default text size, each
 * after an 8 pt gap (8 + 13 + 8 + 13).
 */
export const READY_NOTES_MIN_HEIGHT = 42;

/**
 * What the ready preview shows (the capture policy picks it,
 * `readyPreviewShapeFor`): "recorded", the frame the camera records in this
 * window (9:16 in portrait, A21); "wide", the 16:9 card that invites turning
 * the phone sideways (the flow before A21).
 */
export type ReadyPreviewShape = "recorded" | "wide";

export interface ReadyPreviewBox {
  /** In points; null is the full content width. The card also caps at the content width. */
  width: number | null;
  /** Width over height. */
  aspectRatio: number;
  /**
   * Where `MatchRecorderCamera` puts the preview line and the framing hint:
   * beside the narrow 9:16 card, else under the card.
   */
  notes: "under" | "beside";
}

/**
 * The 9:16 ready card's outer width in a portrait window. Sized so the ready
 * controls below it never sit lower than they did under the shipped 16:9
 * card (on the flag-OFF face-off `I'm ready` only just fit an iPhone SE
 * before): the card is as tall as the shipped card plus the least its two
 * lines took (`READY_NOTES_MIN_HEIGHT`), and those lines move beside it. So
 * the whole block is never taller than before, at the default text size or
 * larger, on any portrait width (375 wide: about 134 x 236; 402 wide: about
 * 142 x 251).
 */
export function recordedReadyCardWidth(windowWidth: number): number {
  const shippedInnerWidth = windowWidth - 2 * READY_CARD_GUTTER - 2 * READY_CARD_BORDER;
  const frameHeight = shippedInnerWidth / RECORDED_ASPECT_LANDSCAPE + READY_NOTES_MIN_HEIGHT;
  return frameHeight * RECORDED_ASPECT + 2 * READY_CARD_BORDER;
}

/**
 * The ready preview card. A landscape window always records 16:9 (a portrait
 * lock the system ignores, iPad Split View for one, still records what is on
 * screen), so it gets the landscape card either way; a portrait window gets
 * the recorded 9:16 frame with its lines beside it, or the full-width wide
 * card.
 */
export function readyPreviewBox(
  windowWidth: number,
  windowHeight: number,
  shape: ReadyPreviewShape,
): ReadyPreviewBox {
  const landscapeWidth = readyPreviewWidth(windowWidth, windowHeight);
  if (landscapeWidth != null) {
    return { width: landscapeWidth, aspectRatio: RECORDED_ASPECT_LANDSCAPE, notes: "under" };
  }
  if (shape === "wide") return { width: null, aspectRatio: RECORDED_ASPECT_LANDSCAPE, notes: "under" };
  return { width: recordedReadyCardWidth(windowWidth), aspectRatio: RECORDED_ASPECT, notes: "beside" };
}
