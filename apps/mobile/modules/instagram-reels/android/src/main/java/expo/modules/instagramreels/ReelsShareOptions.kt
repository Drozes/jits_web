package expo.modules.instagramreels

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Arguments for `shareToReels`, mirroring `ShareToReelsOptions` in
 * `modules/instagram-reels/index.ts`.
 *
 * The media limits arrive from JS rather than being constants here. There
 * is then exactly ONE copy of Meta's 3-60s window and the byte ceiling in
 * the codebase, instead of three that can drift apart silently across a
 * Swift file, a Kotlin file and a TypeScript file.
 */
data class ReelsShareOptions(
  @Field val videoUri: String = "",
  @Field val appId: String = "",
  /** Accepted and ignored on Android; see the module docblock. */
  @Field val stickerImageUri: String? = null,
  @Field val minDurationMs: Double = 0.0,
  @Field val maxDurationMs: Double = 0.0,
  @Field val maxBytes: Double = 0.0,
) : Record
