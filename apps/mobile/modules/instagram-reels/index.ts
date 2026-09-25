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
 * them. The duration window is passed down to the native halves on every
 * call rather than duplicated in Swift and Kotlin, so the three copies
 * cannot drift: a limit that disagrees across platforms is invisible until
 * a user hits it.
 *
 * THE TWO LIMITS ARE DIFFERENT IN KIND, and conflating them was a bug.
 * Meta states 3 to 60 seconds as a REQUIREMENT: a clip under 3s is rejected
 * outright. It states "under 50 MB" and 1080p as RECOMMENDATIONS. So the
 * duration window is enforced and refuses the share; the byte ceiling is
 * advisory and only sets `oversize` on an otherwise successful result.
 *
 * Enforcing both would make them mutually inconsistent: a 60s 1080p clip at
 * 8 Mbps is roughly 60 MB and at 7 Mbps roughly 52 MB, so a clip sitting
 * legally inside the duration requirement would be refused with copy
 * blaming its length when the real cause is bitrate. The render pipeline
 * owns the bitrate ceiling that keeps a 60s clip under 50 MB, and the 9:16
 * 1080p composition with it.
 */
export const REELS_MIN_DURATION_MS = 3_000;
export const REELS_MAX_DURATION_MS = 60_000;
export const REELS_RECOMMENDED_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Copy for the advisory case. Not a failure: the handoff HAS happened and
 * Instagram has the clip. This says only that Meta recommends staying
 * under the ceiling and we did not.
 */
export const REELS_OVERSIZE_WARNING =
  "That clip is larger than Instagram recommends, so it may take a while to upload or lose quality.";

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
  ERR_REELS_INSTAGRAM_UNAVAILABLE: "instagram-unavailable",
  ERR_REELS_HANDOFF_FAILED: "handoff-failed",
};

export type ReelsShareResult =
  | {
      ok: true;
      /**
       * Whether the optional overlay sticker was actually attached.
       *
       * Reported rather than assumed, because a sticker can be dropped for
       * reasons the caller cannot see (an unreadable file, a URI outside
       * the paths the Android FileProvider serves). "Never a silent no-op"
       * has to cover the optional half of the payload too.
       */
      stickerApplied: boolean;
      /** Size of the clip that was handed over, from the file itself. */
      byteCount: number;
      /**
       * ADVISORY. True when `byteCount` exceeds Meta's RECOMMENDED ceiling.
       * The handoff still happened; Instagram has the clip. Show
       * `REELS_OVERSIZE_WARNING` if you want, but do not treat it as a
       * failure, and do not block on it: the ceiling is a recommendation
       * and the duration window is the requirement.
       */
      oversize: boolean;
    }
  | { ok: false; failure: ReelsShareFailure; message: string; detail?: string };

export interface ShareToReelsOptions {
  /** `file://` URI of the rendered clip. */
  videoUri: string;
  /** The registered Facebook App ID. Required by Meta since January 2023. */
  appId: string;
  /**
   * Optional overlay sticker, composited above the video by Instagram.
   * Supported on BOTH platforms: the iOS pasteboard key
   * `com.instagram.sharedSticker.stickerImage` and the Android
   * `interactive_asset_uri` intent extra, both documented by Meta.
   * Check `stickerApplied` on the result; it can be dropped.
   */
  stickerImageUri?: string;
}

/**
 * What the native halves resolve with. `maxBytes` is deliberately NOT sent
 * down: native reports the size it measured and JS decides whether that is
 * over the RECOMMENDED ceiling, which keeps the advisory threshold in one
 * place and out of code that would have to refuse on it.
 */
interface NativeShareOutcome {
  stickerApplied: boolean;
  byteCount: number;
}

interface InstagramReelsNativeModule {
  shareToReels(options: {
    videoUri: string;
    appId: string;
    stickerImageUri?: string;
    minDurationMs: number;
    maxDurationMs: number;
  }): Promise<NativeShareOutcome>;
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
 * Resolves `ok: true` only once the composer has actually been opened. It
 * NEVER throws and never resolves ok for a clip that was not handed off:
 * the documented failure mode of this whole mechanism is a silent no-op
 * (Instagram opens to an empty composer, or does not open at all, with no
 * error anywhere), so every branch that cannot complete returns a named
 * reason and a sentence a person can read.
 *
 * What it validates before touching the pasteboard or the intent: that an
 * App ID was supplied, that the file exists, and that its duration is
 * inside Meta's 3-60s window. The duration is read from the file itself on
 * the native side rather than trusted from the caller, because the caller's
 * idea of the length comes from the render request and the clip is what
 * Instagram will actually reject. SIZE IS NOT A REFUSAL: it comes back as
 * `oversize` on a successful result, because Meta recommends the ceiling
 * and requires the window.
 *
 * ON iOS THIS TOUCHES THE USER'S CLIPBOARD. Meta's mechanism is a
 * pasteboard handoff; there is no way to hand the composer a video without
 * writing to `UIPasteboard.general`. The items carry a five-minute expiry
 * and are `localOnly`, and whatever was on the pasteboard is snapshotted
 * and restored if the composer does not open, so a user without Instagram
 * does not lose what they had copied.
 *
 * ALSO ON iOS: since iOS 16 the system can prompt before one app reads
 * pasteboard data another app wrote, and this handoff works by pasteboard.
 * Do not design the caller assuming a silent transition.
 */
export async function shareToReels(options: ShareToReelsOptions): Promise<ReelsShareResult> {
  if (!native) return failure("module-unavailable");
  if (Platform.OS !== "ios" && Platform.OS !== "android") return failure("unsupported-platform");

  // EVERYTHING that reads `options` is inside the try, including the two
  // pre-flight checks. They used to sit outside it and were the only holes
  // in the "never throws" contract: `appId` reaches this module from config,
  // which is `string | undefined` at its source, so `options.appId.trim()`
  // on an undefined value is a live TypeError, and a caller that passes no
  // options at all throws on the first property access. A share button that
  // throws is a crash, not a message.
  try {
    // Checked here as well as natively so a misconfigured build fails before
    // it touches the pasteboard. Meta has required a registered App ID since
    // January 2023 and a missing one is a silent break on the Instagram side.
    if (typeof options?.appId !== "string" || options.appId.trim().length === 0) {
      return failure("missing-app-id");
    }
    if (typeof options.videoUri !== "string" || options.videoUri.trim().length === 0) {
      return failure("file-not-found");
    }

    const outcome = await native.shareToReels({
      videoUri: options.videoUri,
      appId: options.appId,
      stickerImageUri: options.stickerImageUri,
      minDurationMs: REELS_MIN_DURATION_MS,
      maxDurationMs: REELS_MAX_DURATION_MS,
    });

    // Read defensively: an OTA can land on a binary whose native half
    // predates these fields, in which case they simply are not there.
    const byteCount = typeof outcome?.byteCount === "number" ? outcome.byteCount : 0;
    return {
      ok: true,
      stickerApplied: outcome?.stickerApplied === true,
      byteCount,
      oversize: byteCount > REELS_RECOMMENDED_MAX_BYTES,
    };
  } catch (error) {
    const { reason, detail } = nativeFailureOf(error);
    return failure(reason, detail);
  }
}
