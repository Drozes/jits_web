/**
 * The live preview box, drawn at the aspect the camera actually records.
 *
 * iOS portrait-locked `videoQuality="720p"` records a 720 x 1280 portrait
 * frame (9:16). The preview is sized to FIT the screen at that aspect, never
 * to fill it, so what the athlete sees is exactly what is recorded: full
 * width, top-aligned, and on a screen too short for that (a tablet) full
 * height, horizontally centered. The rest of the screen is black.
 */
export const RECORDED_ASPECT = 9 / 16;

export interface RecordedFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

export function fitRecordedFrame(screenWidth: number, screenHeight: number): RecordedFrame {
  const height = screenWidth / RECORDED_ASPECT;
  if (height <= screenHeight) return { width: screenWidth, height, left: 0, top: 0 };
  const width = screenHeight * RECORDED_ASPECT;
  return { width, height: screenHeight, left: (screenWidth - width) / 2, top: 0 };
}
