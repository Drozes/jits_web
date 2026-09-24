package expo.modules.instagramreels

import android.content.ActivityNotFoundException
import android.content.ClipData
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
 * THE MECHANISM. An `Intent` with the custom action
 * `com.instagram.share.ADD_TO_REEL`, MIME type `video/*`, the clip in
 * `Intent.EXTRA_STREAM` as a `content://` URI, and the registered Facebook
 * App ID in `com.instagram.platform.extra.APPLICATION_ID` (required since
 * January 2023). Instagram opens its Reels composer with the clip loaded.
 *
 * THE PART THAT SILENTLY EATS DAYS: THE URI PERMISSION GRANT. The clip is
 * served from a `FileProvider`, and Instagram is a different app, so it
 * cannot read the URI unless it is granted permission. `addFlags(
 * FLAG_GRANT_READ_URI_PERMISSION)` alone is NOT enough here, because that
 * flag grants for the intent's `data` URI and its `ClipData`, and
 * `EXTRA_STREAM` is neither. Android migrates `EXTRA_STREAM` into
 * `ClipData` automatically only for `ACTION_SEND` / `ACTION_SEND_MULTIPLE`
 * (`Intent.migrateExtraStreamToClipData`), and this is a custom action, so
 * nothing migrates. Two things therefore happen below: the URI is ALSO
 * attached as `ClipData`, and `grantUriPermission()` is called explicitly
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
 *
 * NO STICKER OVERLAY HERE. The iOS half supports Meta's documented
 * `com.instagram.sharedSticker.stickerImage` pasteboard key. The equivalent
 * Android extra for the REELS action is not documented on Meta's Android
 * page, and inventing an extra key would be an unverifiable guess whose
 * failure mode is a silent drop. `stickerImageUri` is accepted and ignored
 * on this platform.
 */
class InstagramReelsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("InstagramReels")

    /**
     * Rejects with an explicit code, matching the Swift half exactly, so
     * the JS wrapper maps both platforms with one table. Codes are passed
     * rather than inferred from an exception class name, because the two
     * platforms' inference rules are not the same thing.
     */
    AsyncFunction("shareToReels") { options: ReelsShareOptions, promise: Promise ->
      try {
        handOff(options)
        promise.resolve(null)
      } catch (failure: ReelsFailure) {
        promise.reject(failure.errorCode, failure.message, null)
      } catch (e: ActivityNotFoundException) {
        // Instagram is not installed, or is too old to declare the Reels
        // action, or the <queries> declaration is missing so it is invisible.
        promise.reject(
          ReelsErrorCode.INSTAGRAM_UNAVAILABLE,
          "No activity handles $REELS_ACTION in $INSTAGRAM_PACKAGE.",
          e,
        )
      } catch (e: Exception) {
        promise.reject(ReelsErrorCode.HANDOFF_FAILED, e.message ?: "The handoff failed.", e)
      }
    }
  }

  private fun handOff(options: ReelsShareOptions) {
    val appId = options.appId.trim()
    if (appId.isEmpty()) {
      throw ReelsFailure(ReelsErrorCode.MISSING_APP_ID, "No Facebook App ID was supplied.")
    }

    val file = localFileOf(options.videoUri)
    validateSize(file, options.maxBytes)
    validateDuration(file, options.minDurationMs, options.maxDurationMs)

    val contentUri = FileProvider.getUriForFile(
      context,
      context.applicationInfo.packageName + FILE_PROVIDER_SUFFIX,
      file,
    )

    val intent = Intent(REELS_ACTION).apply {
      setPackage(INSTAGRAM_PACKAGE)
      // `setType` and not `setDataAndType`: Meta's own sample sets only the
      // type, and putting a data URI on an explicit intent adds a filter
      // match that can only make resolution fail.
      type = VIDEO_MIME
      putExtra(Intent.EXTRA_STREAM, contentUri)
      putExtra(APPLICATION_ID_EXTRA, appId)
      // Belt: makes FLAG_GRANT_READ_URI_PERMISSION actually cover the clip,
      // since EXTRA_STREAM is not migrated for a custom action.
      clipData = ClipData.newRawUri("", contentUri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    // Braces. A context-level grant does not depend on how Instagram reads
    // the intent, and it is the grant Meta's own sample relies on. It stays
    // in place until revoked or the device reboots, which is the accepted
    // trade for a file the user explicitly chose to hand over.
    context.grantUriPermission(INSTAGRAM_PACKAGE, contentUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

    // Started from the Activity, not the application context, so the
    // composer lands on top of this task instead of in a new one. Throws
    // `Exceptions.MissingActivity` when there is none, which the outer
    // catch reports as a failed handoff rather than a crash. Same call
    // shape as `expo-sharing`'s ShareModule.
    appContext.throwingActivity.startActivity(intent)
  }

  /**
   * Local files only, matching `expo-sharing`'s restriction. The render
   * pipeline hands back a clip on disk, so a `content://` input would mean
   * a second set of size and duration paths (ContentResolver + OpenableColumns)
   * for a case nothing produces. A caller that needs it should be a
   * deliberate change, not an accident.
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

  private fun validateSize(file: File, maxBytes: Double) {
    val size = file.length().toDouble()
    if (maxBytes > 0 && size > maxBytes) {
      throw ReelsFailure(
        ReelsErrorCode.VIDEO_TOO_LARGE,
        "The clip is ${size.toLong()} bytes, over the ${maxBytes.toLong()} byte ceiling.",
      )
    }
  }

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
    internal const val VIDEO_MIME = "video/*"
    /** Must match `android:authorities` in this module's AndroidManifest. */
    internal const val FILE_PROVIDER_SUFFIX = ".ReelsFileProvider"
  }
}
