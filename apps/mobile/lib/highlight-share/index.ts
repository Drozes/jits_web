/**
 * Public face of the highlight share funnel (jr_be spec 014 section 16.6.1).
 *
 * This directory is the ONLY app code allowed to touch the Instagram Reels
 * module, expo-sharing, expo-media-library and the clipboard module
 * (`__tests__/modules/highlight-share-guard.test.ts`). This barrel re-exports
 * NOTHING from those packages: only the hook, capability detection, the
 * cache housekeeping, the share-funnel telemetry helper, the copy and types.
 * Every outbound action is gated by `highlight_share_enabled`, checked
 * server side by `prepare_highlight_share` before each download.
 */
export {
  useHighlightShare,
  type SharePath,
  type ShareStage,
  type ShareError,
  type ShareErrorCode,
  type HandoffOutcome,
  type SaveOutcome,
  type UseHighlightShareResult,
  type UseHighlightShareParams,
} from "./use-highlight-share";
export { getShareCapabilities, type ShareCapabilities } from "./capabilities";
export { sweepShareCache, clearShareCache } from "./download";
export { track } from "./telemetry";
export { SHARE_COPY, INSTAGRAM_APP_URL, downloadProgressLabel } from "./share-copy";
