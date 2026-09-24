import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * JS face of the local `InstagramReels` native module (jits-s6mi.1).
 *
 * WHAT IT IS. Meta's documented "Sharing to Reels" handoff: the app hands a
 * local video file to the Instagram composer, which opens with the clip
 * loaded and the user finishes the post there. It is a first-class,
 * documented Meta integration (`developers.facebook.com/docs/ios/
 * sharing-to-reels-instagram/` and the Android page beside it), not the
 * legacy `.igo` / `UIDocumentInteractionController` trick.
 *
 * WHY IT IS A NATIVE MODULE. `react-native-share` cannot do this: its
 * targets are `INSTAGRAM` and `INSTAGRAM_STORIES` only, and Reels is a
 * different mechanism on both platforms (an iOS pasteboard payload plus a
 * custom URL scheme; an Android intent with a custom action and an explicit
 * URI-permission grant). No Expo module wraps it either.
 *
 * NOTHING IMPORTS THIS YET, ON PURPOSE. The share entry point is slice
 * jits-s6mi.4 and is gated on the `highlight_share_enabled` feature flag,
 * which must stay false while the consent decision `jr_be-17f` is open.
 * Every outbound share affordance is covered by that gate, including the
 * generic share sheet and save-to-camera-roll, because all three hand the
 * OTHER athlete's likeness to a destination outside the two participants.
 * `__tests__/modules/instagram-reels-contract.test.ts` fails the build if
 * any app code starts importing this file.
 *
 * WHAT IS DELIBERATELY NOT HERE. Pre-flight "is Instagram installed"
 * detection, the generic share-sheet fallback and the share-funnel
 * instrumentation are slice jits-s6mi.3. This module only performs the
 * handoff and reports, honestly, why it could not.
 */

/**
 * Meta's stated Reels media constraints, and the single source of truth for
 * them. They are passed down to the native halves on every call rather than
 * duplicated in Swift and Kotlin, so the three copies cannot drift: a limit
 * that disagrees across platforms is invisible until a user hits it.
 *
 * A clip shorter than 3s is REJECTED by Instagram. 60s is the documented
 * ceiling. 50 MB and 1080p are documented as recommendations rather than
 * hard caps, and this module still enforces the byte ceiling, because the
 * alternative is handing Instagram a payload it may silently drop, which is
 * the failure mode this whole path is built to avoid. Resolution is NOT
 * enforced here; the render pipeline owns the 9:16 1080p composition.
 */
export const REELS_MIN_DURATION_MS = 3_000;
export const REELS_MAX_DURATION_MS = 60_000;
export const REELS_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Why a handoff did not happen, as a stable JS-level value.
 *
 * Separate from the native error codes on purpose: the native codes are an
 * implementation detail of two platforms that fail differently, and callers
 * need one vocabulary. `unknown` is the honest bucket, not a fallback for
 * cases we could have named.
 */
export type ReelsShareFailure =
  | "module-unavailable"
  | "unsupported-platform"
  | "missing-app-id"
  | "file-not-found"
  | "unreadable-video"
  | "too-short"
  | "too-long"
  | "too-large"
  | "instagram-unavailable"
  | "handoff-failed"
  | "unknown";

/**
 * User-facing copy for every failure.
 *
 * It lives here rather than at the call site because the acceptance
 * criterion for this slice is that a rejected clip produces a real message
 * instead of a silent no-op, and a message that only exists in a screen is
 * a message that does not exist until that screen is built. Wording is
 * deliberately free of error codes; the raw native text travels separately
 * in `detail`, for logs only.
 */
export const REELS_FAILURE_MESSAGES: Record<ReelsShareFailure, string> = {
  "module-unavailable": "Sharing to Instagram needs the latest version of the app.",
  "unsupported-platform": "Sharing to Instagram is only available on iOS and Android.",
  "missing-app-id": "Sharing to Instagram is not configured yet.",
  "file-not-found": "That clip is no longer on this device.",
  "unreadable-video": "That clip could not be read.",
  "too-short": "Instagram needs at least 3 seconds. Pick a longer moment.",
  "too-long": "Instagram caps Reels at 60 seconds. Pick a shorter moment.",
  "too-large": "That clip is too large for Instagram. Try a shorter moment.",
  "instagram-unavailable": "Instagram is not installed on this device.",
  "handoff-failed": "Instagram could not be opened. Try again.",
  unknown: "Sharing to Instagram failed. Try again.",
};

/**
 * Native error codes, mapped to the JS vocabulary above. Both native halves
 * reject with exactly these strings (they are passed explicitly rather than
 * inferred from a class name, so iOS and Android cannot diverge).
 */
const NATIVE_CODE_TO_FAILURE: Record<string, ReelsShareFailure> = {
  ERR_REELS_MISSING_APP_ID: "missing-app-id",
  ERR_REELS_FILE_NOT_FOUND: "file-not-found",
  ERR_REELS_UNREADABLE_VIDEO: "unreadable-video",
  ERR_REELS_VIDEO_TOO_SHORT: "too-short",
  ERR_REELS_VIDEO_TOO_LONG: "too-long",
  ERR_REELS_VIDEO_TOO_LARGE: "too-large",
  ERR_REELS_INSTAGRAM_UNAVAILABLE: "instagram-unavailable",
  ERR_REELS_HANDOFF_FAILED: "handoff-failed",
};

export type ReelsShareResult =
  | { ok: true }
  | { ok: false; failure: ReelsShareFailure; message: string; detail?: string };

export interface ShareToReelsOptions {
  /** `file://` URI of the rendered clip. */
  videoUri: string;
  /** The registered Facebook App ID. Required by Meta since January 2023. */
  appId: string;
  /** Optional overlay sticker. iOS only; see the note on the native halves. */
  stickerImageUri?: string;
}

interface InstagramReelsNativeModule {
  shareToReels(options: {
    videoUri: string;
    appId: string;
    stickerImageUri?: string;
    minDurationMs: number;
    maxDurationMs: number;
    maxBytes: number;
  }): Promise<void>;
}

/**
 * `requireOptionalNativeModule`, never `requireNativeModule`.
 *
 * `expo.version` is 0.2.0 with a `runtimeVersion` policy of `appVersion`,
 * so the TestFlight build that first carries this native module and every
 * already-installed 0.2.0 binary share a runtime version and accept the
 * same OTA. A JS bundle can never carry a native module, so this file WILL
 * run on binaries where the native half does not exist. It also does not
 * exist under Jest or in Expo Go. In all of those the correct behaviour is
 * "unavailable", not a throw at import time. Same reasoning, same call, as
 * `modules/backup-exclusion/index.ts`.
 */
const native = requireOptionalNativeModule<InstagramReelsNativeModule>("InstagramReels");

/**
 * True when the native half is in this binary AND the platform is one it
 * was built for. Note what this does NOT say: nothing about whether
 * Instagram is installed. That question needs `canOpenURL` on iOS and a
 * package query on Android, both of which depend on the declarations added
 * by `plugins/with-instagram-reels.js`, and both belong to slice
 * jits-s6mi.3.
 */
export const isReelsShareSupported: boolean =
  native != null && (Platform.OS === "ios" || Platform.OS === "android");

function failure(reason: ReelsShareFailure, detail?: string): ReelsShareResult {
  return { ok: false, failure: reason, message: REELS_FAILURE_MESSAGES[reason], detail };
}

/**
 * Read the coded error a native rejection carries.
 *
 * Expo surfaces a rejected `AsyncFunction` as an `Error` with a `code`
 * property. It is read defensively because a JS-layer throw (a bridge
 * teardown, a serialisation failure) arrives through the same catch and has
 * no code at all.
 */
function nativeFailureOf(error: unknown): { reason: ReelsShareFailure; detail?: string } {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const message =
    typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : undefined;
  const reason = typeof code === "string" ? NATIVE_CODE_TO_FAILURE[code] : undefined;
  return { reason: reason ?? "unknown", detail: message };
}

/**
 * Hand `videoUri` to the Instagram Reels composer.
 *
 * Resolves `{ ok: true }` only once the composer has actually been opened.
 * It NEVER throws and never resolves ok for a clip that was not handed off:
 * the documented failure mode of this whole mechanism is a silent no-op
 * (Instagram opens to an empty composer, or does not open at all, with no
 * error anywhere), so every branch that cannot complete returns a named
 * reason and a sentence a person can read.
 *
 * What it validates before touching the pasteboard or the intent: that an
 * App ID was supplied, that the file exists, that its duration is inside
 * Meta's 3-60s window, and that it is under the byte ceiling. The duration
 * is read from the file itself on the native side rather than trusted from
 * the caller, because the caller's idea of the length comes from the render
 * request and the clip is what Instagram will actually reject.
 *
 * ON iOS THIS REPLACES THE USER'S CLIPBOARD. Meta's mechanism is a
 * pasteboard handoff; there is no way to hand the composer a video without
 * writing to `UIPasteboard.general`. The items carry a five-minute
 * expiry, and they are cleared again if the composer does not open, but the
 * clipboard the user had is gone either way. Slice jits-s6mi.3's
 * availability check should therefore run BEFORE this function, so a user
 * without Instagram never pays that cost.
 *
 * ALSO ON iOS: since iOS 16 the system can prompt before one app reads
 * pasteboard data another app wrote, and this handoff works by pasteboard.
 * Do not design the caller assuming a silent transition.
 */
export async function shareToReels(options: ShareToReelsOptions): Promise<ReelsShareResult> {
  if (!native) return failure("module-unavailable");
  if (Platform.OS !== "ios" && Platform.OS !== "android") return failure("unsupported-platform");
  // Checked here as well as natively so a misconfigured build fails before
  // it clobbers the pasteboard. Meta has required a registered App ID since
  // January 2023 and a missing one is a silent break on the Instagram side.
  if (options.appId.trim().length === 0) return failure("missing-app-id");
  if (options.videoUri.trim().length === 0) return failure("file-not-found");

  try {
    await native.shareToReels({
      videoUri: options.videoUri,
      appId: options.appId,
      stickerImageUri: options.stickerImageUri,
      minDurationMs: REELS_MIN_DURATION_MS,
      maxDurationMs: REELS_MAX_DURATION_MS,
      maxBytes: REELS_MAX_BYTES,
    });
    return { ok: true };
  } catch (error) {
    const { reason, detail } = nativeFailureOf(error);
    return failure(reason, detail);
  }
}
