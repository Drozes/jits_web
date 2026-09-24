package expo.modules.instagramreels

/**
 * The failure vocabulary, shared verbatim with the Swift half and mapped in
 * `modules/instagram-reels/index.ts`.
 *
 * Codes are written out rather than inferred from exception class names,
 * because `CodedException` on Android and `Exception` on iOS infer them by
 * different rules, and a code that differs per platform makes the JS
 * mapping table quietly wrong on one of them.
 */
internal object ReelsErrorCode {
  const val MISSING_APP_ID = "ERR_REELS_MISSING_APP_ID"
  const val FILE_NOT_FOUND = "ERR_REELS_FILE_NOT_FOUND"
  const val UNREADABLE_VIDEO = "ERR_REELS_UNREADABLE_VIDEO"
  const val VIDEO_TOO_SHORT = "ERR_REELS_VIDEO_TOO_SHORT"
  const val VIDEO_TOO_LONG = "ERR_REELS_VIDEO_TOO_LONG"
  const val VIDEO_TOO_LARGE = "ERR_REELS_VIDEO_TOO_LARGE"
  const val INSTAGRAM_UNAVAILABLE = "ERR_REELS_INSTAGRAM_UNAVAILABLE"
  const val HANDOFF_FAILED = "ERR_REELS_HANDOFF_FAILED"
}

internal class ReelsFailure(
  val errorCode: String,
  override val message: String,
) : Exception(message)
