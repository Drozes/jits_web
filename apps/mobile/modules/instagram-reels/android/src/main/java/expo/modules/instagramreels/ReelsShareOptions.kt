package expo.modules.instagramreels

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Arguments for `shareToReels`, mirroring `ShareToReelsOptions` in
 * `modules/instagram-reels/index.ts`.
 *
 * The duration REQUIREMENT arrives from JS rather than being a constant
 * here. There is then exactly ONE copy of Meta's 3-60s window in the
 * codebase, instead of three that can drift apart silently across a Swift
 * file, a Kotlin file and a TypeScript file. There is no `maxBytes`,
 * because Meta's byte ceiling is a RECOMMENDATION: this side measures the
 * clip and reports it, and JS decides whether to warn.
 */
data class ReelsShareOptions(
  @Field val videoUri: String = "",
  @Field val appId: String = "",
  /**
   * Optional overlay, attached through Meta's documented
   * `interactive_asset_uri` extra. Dropped, and reported as
   * `stickerApplied: false`, if it cannot be served as a content URI.
   */
  @Field val stickerImageUri: String? = null,
  @Field val minDurationMs: Double = 0.0,
  @Field val maxDurationMs: Double = 0.0,
) : Record
