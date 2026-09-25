package expo.modules.instagramreels

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Android half of Meta's documented "Sharing to Reels" handoff.
 *
 * THE MECHANISM, matching Meta's single-media sample on the Android
 * Sharing-to-Reels page: an `Intent` with the custom action
 * `com.instagram.share.ADD_TO_REEL`, the clip set as the intent's DATA via
 * `setDataAndType(uri, "image/* video/*")`, the same URI also in
 * `Intent.EXTRA_STREAM`, and the registered Facebook App ID in
 * `com.instagram.platform.extra.APPLICATION_ID` (required since January
 * 2023). Instagram opens its Reels composer with the clip loaded.
 *
 * WHY `setDataAndType` AND NOT `setType`. Meta publishes two samples on
 * that page and they are not interchangeable. The single-media one, which
 * is this path, uses `setDataAndType` with the combined `"image/* video/*"`
 * type; only the `ADD_TO_REEL_MULTIPLE` variant uses a bare `setType`.
 * Taking the multiple-media form for a single clip deviates twice at once:
 * the URI leaves `intent.data`, and the MIME string narrows to `video/*`.
 * `setPackage` makes the intent explicit at PACKAGE level but it is still
 * matched against Instagram's intent filters, so both of those feed
 * resolution. If that filter is declared with `<data>` rather than a bare
 * type, `startActivity` throws `ActivityNotFoundException`, which this maps
 * to "Instagram is not installed on this device" on a phone where it
 * plainly is. That is precisely the indistinguishable failure this module
 * exists to prevent, so the documented form is the one to match.
 *
 * THE URI PERMISSION GRANT, WHICH SILENTLY EATS DAYS. The clip is served
 * from a `FileProvider` and Instagram is a different app, so it cannot read
 * the URI without a grant. `FLAG_GRANT_READ_URI_PERMISSION` covers the
 * intent's DATA uri (which is why Meta's sample sets it as data) and its
 * `ClipData`. It does NOT cover `EXTRA_STREAM`: Android migrates
 * `EXTRA_STREAM` into `ClipData` only for `ACTION_SEND` /
 * `ACTION_SEND_MULTIPLE` (`Intent.migrateExtraStreamToClipData`), and this
 * is a custom action, so nothing migrates. The sticker extra below is not
 * covered either. So `grantUriPermission()` is called explicitly, per URI,
 * against the Instagram package. Get this wrong and Instagram receives a
 * URI it cannot open, which presents as "Instagram ignored us" with no
 * error anywhere.
 *
 * PACKAGE VISIBILITY. `setPackage("com.instagram.android")` makes this an
 * explicit intent, which is what stops another app claiming the action. On
 * Android 11+ an explicit intent at a package your app cannot SEE throws
 * `ActivityNotFoundException`, so the `<queries>` declaration added by
 * `plugins/with-instagram-reels.js` is load-bearing for the share itself,
 * not only for the availability check in slice jits-s6mi.3.
 */
class InstagramReelsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("InstagramReels")

    /**
     * Resolves a map rather than nothing, matching the Swift half: whether
     * the optional sticker was attached, and the clip's measured size,
     * which JS compares against Meta's RECOMMENDED ceiling. Size is not a
     * refusal here, because Meta recommends it and requires the duration.
     *
     * Rejects with an explicit code, matching the Swift half exactly, so
     * the JS wrapper maps both platforms with one table. Codes are passed
     * rather than inferred from an exception class name, because the two
     * platforms' inference rules are not the same thing.
     */
    AsyncFunction("shareToReels") { options: ReelsShareOptions, promise: Promise ->
      try {
        promise.resolve(handOff(options))
      } catch (failure: ReelsFailure) {
        promise.reject(failure.errorCode, failure.message, null)
      } catch (e: ActivityNotFoundException) {
        // FOUR DIFFERENT CAUSES REACH THIS ONE CODE, and a device tester
        // cannot tell them apart from the code alone: Instagram is absent,
        // Instagram is too old to declare the Reels action, the <queries>
        // declaration is missing so the package is invisible, or the intent
        // simply did not MATCH Instagram's filter. The last one is live:
        // MEDIA_MIME is Meta's combined "image/* video/*" string and
        // `IntentFilter.findMimeType` splits on the first '/', so the
        // combined form and a bare "video/*" are not interchangeable.
        // Flipping it is a one-line experiment, and the detail below is
        // what lets someone decide to run it rather than guessing.
        promise.reject(
          ReelsErrorCode.INSTAGRAM_UNAVAILABLE,
          "${e.javaClass.name}: no activity handles $REELS_ACTION in $INSTAGRAM_PACKAGE " +
            "with type '$MEDIA_MIME'. Instagram absent, too old, invisible to <queries>, " +
            "or its filter did not match that type. Original: ${e.message}",
          e,
        )
      } catch (e: Exception) {
        // The exception class is carried too: this branch is a catch-all
        // and "the handoff failed" on its own tells a device tester
        // nothing about whether it was the FileProvider, the grant, the
        // activity or the context.
        promise.reject(
          ReelsErrorCode.HANDOFF_FAILED,
          "${e.javaClass.name}: ${e.message ?: "no message"}",
          e,
        )
      }
    }
  }

  private fun handOff(options: ReelsShareOptions): Map<String, Any> {
    val appId = options.appId.trim()
    if (appId.isEmpty()) {
      throw ReelsFailure(ReelsErrorCode.MISSING_APP_ID, "No Facebook App ID was supplied.")
    }

    val file = localFileOf(options.videoUri)
    // Measured, not enforced: Meta states "under 50 MB" as a recommendation
    // and 3-60s as a requirement. See the note in index.ts for why
    // enforcing both makes them mutually inconsistent at 1080p.
    val byteCount = file.length().toDouble()
    validateDuration(file, options.minDurationMs, options.maxDurationMs)

    val contentUri = contentUriFor(file)
    val stickerUri = options.stickerImageUri?.let { stickerContentUriFor(it) }

    val intent = Intent(REELS_ACTION).apply {
      setPackage(INSTAGRAM_PACKAGE)
      // Meta's documented single-media form. The data URI is also what
      // FLAG_GRANT_READ_URI_PERMISSION attaches to.
      setDataAndType(contentUri, MEDIA_MIME)
      putExtra(Intent.EXTRA_STREAM, contentUri)
      putExtra(APPLICATION_ID_EXTRA, appId)
      if (stickerUri != null) {
        // Documented on the same page, in Meta's "Example with Sticker"
        // block. An earlier revision of this file claimed there was no
        // documented Android sticker extra, which was simply wrong.
        putExtra(STICKER_ASSET_EXTRA, stickerUri)
      }
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    // Per URI, and explicitly. The flag above covers `data` only; the
    // sticker extra and EXTRA_STREAM are not reached by it.
    //
    // Wrapped, and the outcome deliberately ignored: a grant at a package
    // that is not installed does nothing useful and on some builds throws,
    // and letting that propagate would pre-empt startActivity's
    // ActivityNotFoundException with a generic "the handoff failed",
    // mis-reporting "Instagram is missing" as an unexplained error.
    // startActivity stays the authority on availability. The residual is
    // real and accepted: a grant that fails for some OTHER reason while
    // Instagram IS installed opens the composer to an unreadable URI, which
    // is only visible on a device.
    runCatching {
      context.grantUriPermission(INSTAGRAM_PACKAGE, contentUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      if (stickerUri != null) {
        context.grantUriPermission(INSTAGRAM_PACKAGE, stickerUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    }

    // Started from the Activity, not the application context, so the
    // composer lands on top of this task instead of in a new one. Throws
    // `Exceptions.MissingActivity` when there is none, which the outer
    // catch reports as a failed handoff rather than a crash. Same call
    // shape as `expo-sharing`'s ShareModule.
    appContext.throwingActivity.startActivity(intent)

    return mapOf(
      "stickerApplied" to (stickerUri != null),
      "byteCount" to byteCount,
    )
  }

  /**
   * Local files only, matching `expo-sharing`'s restriction. The render
   * pipeline hands back a clip on disk, so a `content://` input would mean
   * a second set of size and duration paths (ContentResolver +
   * OpenableColumns) for a case nothing produces. A caller that needs it
   * should be a deliberate change, not an accident.
   */
  private fun localFileOf(videoUri: String): File {
    val uri = Uri.parse(videoUri)
    if (uri.scheme != "file") {
      throw ReelsFailure(
        ReelsErrorCode.FILE_NOT_FOUND,
        "Expected a local file:// URI, got '$videoUri'.",
      )
    }
    val path = uri.path
      ?: throw ReelsFailure(ReelsErrorCode.FILE_NOT_FOUND, "The URI '$videoUri' has no path.")
    val file = File(path)
    if (!file.exists() || !file.isFile) {
      throw ReelsFailure(ReelsErrorCode.FILE_NOT_FOUND, "No file at $path.")
    }
    return file
  }

  private fun contentUriFor(file: File): Uri = FileProvider.getUriForFile(
    context,
    context.applicationInfo.packageName + FILE_PROVIDER_SUFFIX,
    file,
  )

  /**
   * The sticker is optional, so a bad one is DROPPED rather than failing
   * the share. It is still reported, through `stickerApplied`, because a
   * silently missing overlay is the same class of no-op this module exists
   * to stop. `getUriForFile` throws for a path outside the roots the
   * provider serves, which is a real case (a sticker rendered somewhere
   * `elo_reels_provider_paths.xml` does not cover).
   */
  private fun stickerContentUriFor(stickerUri: String): Uri? = runCatching {
    contentUriFor(localFileOf(stickerUri))
  }.getOrNull()

  private fun validateDuration(file: File, minMs: Double, maxMs: Double) {
    val milliseconds = durationMsOf(file)
    if (minMs > 0 && milliseconds < minMs) {
      throw ReelsFailure(
        ReelsErrorCode.VIDEO_TOO_SHORT,
        "The clip is ${milliseconds.toLong()}ms, under the ${minMs.toLong()}ms minimum.",
      )
    }
    if (maxMs > 0 && milliseconds > maxMs) {
      throw ReelsFailure(
        ReelsErrorCode.VIDEO_TOO_LONG,
        "The clip is ${milliseconds.toLong()}ms, over the ${maxMs.toLong()}ms maximum.",
      )
    }
  }

  /**
   * Read the duration from the file itself rather than trusting the caller.
   * The caller's idea of the length comes from the render request; the clip
   * is what Instagram will actually measure.
   */
  private fun durationMsOf(file: File): Double {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(file.absolutePath)
      val raw = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
      val milliseconds = raw?.toDoubleOrNull()
      // A missing or non-positive duration is what a corrupt or
      // still-being-written file gives you. Reporting that as "too short"
      // would send the user off to trim a clip that is not the problem.
      if (milliseconds == null || milliseconds <= 0) {
        throw ReelsFailure(
          ReelsErrorCode.UNREADABLE_VIDEO,
          "The clip reports no usable duration.",
        )
      }
      return milliseconds
    } catch (failure: ReelsFailure) {
      throw failure
    } catch (e: Exception) {
      throw ReelsFailure(
        ReelsErrorCode.UNREADABLE_VIDEO,
        "Could not read the clip's duration: ${e.message}",
      )
    } finally {
      // `release()` is declared to throw on API 29+. A failure to release
      // must not mask the real outcome of the call.
      runCatching { retriever.release() }
    }
  }

  companion object {
    internal const val INSTAGRAM_PACKAGE = "com.instagram.android"
    internal const val REELS_ACTION = "com.instagram.share.ADD_TO_REEL"
    internal const val APPLICATION_ID_EXTRA = "com.instagram.platform.extra.APPLICATION_ID"
    /** Meta's "Example with Sticker" extra, on the same Android page. */
    internal const val STICKER_ASSET_EXTRA = "interactive_asset_uri"
    /**
     * Exactly the string in Meta's single-media sample, and deliberately
     * not narrowed to `"video/*"`.
     *
     * The two are NOT interchangeable: `IntentFilter.findMimeType` takes
     * `type.substring(0, type.indexOf('/'))`, so this string tests as
     * `"image"` and a bare `"video/*"` tests as `"video"`. What makes
     * verbatim positively right rather than merely deferential is that Meta
     * publishes BOTH strings against this same `ADD_TO_REEL` action on the
     * same page: the combined form in the single-media sample and
     * `"video/*"` in the sticker example. For both of Meta's own samples to
     * work, Instagram's filter has to accept both.
     */
    internal const val MEDIA_MIME = "image/* video/*"
    /** Must match `android:authorities` in this module's AndroidManifest. */
    internal const val FILE_PROVIDER_SUFFIX = ".ReelsFileProvider"
  }
}
