/**
 * Recording container preference, MP4/H.264 FIRST.
 *
 * Two reasons this order matters (jits-rvc, jits-kaf.1.2):
 *  1. Safari (every iOS browser + macOS Safari) supports MediaRecorder but
 *     rejects EVERY WebM type. The previous WebM-only list fell through to an
 *     unsupported string, which made `new MediaRecorder()` throw.
 *  2. The jr_be slicer muxes chunks to MP4 with `-c copy`. VP8-in-WebM fails
 *     that outright and VP9-in-WebM produces an MP4 iOS cannot decode, so an
 *     H.264 source is the only one that survives the pipeline untouched.
 *
 * WebM remains as a fallback for browsers with no MP4 encoder; the slicer's
 * normalize pass is what makes those usable.
 */
export const MIME_PREFERENCE = [
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4;codecs="avc1"',
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** First supported container, or null when the browser can record none. */
export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_PREFERENCE.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/**
 * Storage extension for a MediaRecorder mimeType. Derived from what the
 * recorder ACTUALLY produced (`recorder.mimeType`), never assumed — the
 * browser may hand back a different type than requested.
 */
export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith("video/mp4")) return "mp4";
  if (mimeType.startsWith("video/webm")) return "webm";
  return mimeType.split("/")[1]?.split(";")[0] ?? "mp4";
}
