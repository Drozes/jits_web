/**
 * The live preview box, drawn at the aspect the camera actually records.
 *
 * The interface is locked when the match goes live, and `videoQuality="720p"`
 * records in that orientation: a 720 x 1280 portrait frame (9:16) or a
 * 1280 x 720 landscape frame (16:9). The preview is sized to FIT the screen
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
