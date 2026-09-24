import AVFoundation
import ExpoModulesCore
import UIKit

/**
 iOS half of Meta's documented "Sharing to Reels" handoff.

 THE MECHANISM, and why it looks nothing like a share sheet. Instagram does
 not accept a video through `UIActivityViewController` or through any
 document interaction API. Per Meta's Reels page, the caller writes the
 video bytes to the GENERAL PASTEBOARD under a set of agreed keys, then
 opens `instagram-reels://share`. Instagram reads the pasteboard on launch
 and opens its composer with the clip loaded.

 THE KEYS. `com.instagram.sharedSticker.backgroundVideo` (required, the
 video data), `com.instagram.sharedSticker.stickerImage` (optional overlay)
 and `com.instagram.sharedSticker.appID` (required). The App ID travelling
 on the PASTEBOARD is the thing that differs from the Stories handoff, where
 it is a `source_application` query parameter on the URL. Passing it the
 Stories way here is a silent no-op.

 WHY THE `backgroundVideo` KEY IS TRUSTED HERE AND NOT ON STORIES. It is
 documented on Meta's Reels page. It is absent from the Stories page despite
 that page stating video specs, which is one of the reasons this epic
 targets Reels and not Stories. See `jr_be/research/instagram-highlight-clips.md`
 section 6.

 WHAT THIS COSTS THE USER. `setItems` REPLACES the general pasteboard.
 There is no way to hand the composer a video without doing that. The items
 carry a five-minute expiry so the payload does not linger, and they are
 cleared again if the composer does not open, but whatever the user had
 copied is gone.

 iOS 16 PASTEBOARD PROMPT. Since iOS 16 the system may ask the user to
 allow one app to read pasteboard data written by another, and this handoff
 works BY pasteboard. Nothing here can suppress that, and nothing here
 should assume a silent transition. Spotify, Strava and Peloton all ship
 with this.
 */
public final class InstagramReelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstagramReels")

    /**
     Validate the clip, write it to the pasteboard, open the composer.

     `AsyncFunction` and not `Function`: reading a video's duration is an
     asynchronous asset load on iOS 16+, and loading up to 50 MB of file
     data has no business on the JS thread.

     Rejects with an explicit code (never one inferred from a class name),
     so the Swift and Kotlin halves report the same vocabulary and the JS
     wrapper can map both with one table.
     */
    AsyncFunction("shareToReels") { (options: ReelsShareOptions, promise: Promise) in
      Task {
        do {
          try await handOffToReels(options)
          promise.resolve(nil)
        } catch let failure as ReelsFailure {
          promise.reject(failure.code, failure.message)
        } catch {
          promise.reject(ReelsErrorCode.handoffFailed, error.localizedDescription)
        }
      }
    }
  }
}

// MARK: - Options

internal struct ReelsShareOptions: Record {
  @Field var videoUri: String = ""
  @Field var appId: String = ""
  @Field var stickerImageUri: String?
  /// The media limits. They arrive from JS rather than being constants here
  /// so there is exactly one copy of them in the codebase; see
  /// `modules/instagram-reels/index.ts`.
  @Field var minDurationMs: Double = 0
  @Field var maxDurationMs: Double = 0
  @Field var maxBytes: Double = 0
}

// MARK: - Failure vocabulary

internal enum ReelsErrorCode {
  static let missingAppId = "ERR_REELS_MISSING_APP_ID"
  static let fileNotFound = "ERR_REELS_FILE_NOT_FOUND"
  static let unreadableVideo = "ERR_REELS_UNREADABLE_VIDEO"
  static let videoTooShort = "ERR_REELS_VIDEO_TOO_SHORT"
  static let videoTooLong = "ERR_REELS_VIDEO_TOO_LONG"
  static let videoTooLarge = "ERR_REELS_VIDEO_TOO_LARGE"
  static let instagramUnavailable = "ERR_REELS_INSTAGRAM_UNAVAILABLE"
  static let handoffFailed = "ERR_REELS_HANDOFF_FAILED"
}

internal struct ReelsFailure: Error {
  let code: String
  let message: String

  init(_ code: String, _ message: String) {
    self.code = code
    self.message = message
  }
}

// MARK: - Pasteboard contract

/// Documented on Meta's "Sharing to Reels" iOS page. Required.
private let backgroundVideoKey = "com.instagram.sharedSticker.backgroundVideo"
/// Documented, optional. An overlay composited above the video.
private let stickerImageKey = "com.instagram.sharedSticker.stickerImage"
/// Required since January 2023. On Reels it travels on the PASTEBOARD, not
/// as a URL parameter. This is the difference from the Stories handoff.
private let appIDKey = "com.instagram.sharedSticker.appID"
private let reelsShareURLString = "instagram-reels://share"
/// Meta's own sample uses five minutes. The payload is a video; leaving it
/// on the pasteboard indefinitely is both a privacy and a memory problem.
private let pasteboardTTLSeconds: TimeInterval = 5 * 60

// MARK: - Handoff

private func handOffToReels(_ options: ReelsShareOptions) async throws {
  let appId = options.appId.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !appId.isEmpty else {
    throw ReelsFailure(ReelsErrorCode.missingAppId, "No Facebook App ID was supplied.")
  }

  guard let url = URL(string: options.videoUri), url.isFileURL else {
    throw ReelsFailure(
      ReelsErrorCode.fileNotFound,
      "Expected a local file:// URI, got '\(options.videoUri)'."
    )
  }
  guard FileManager.default.fileExists(atPath: url.path) else {
    throw ReelsFailure(ReelsErrorCode.fileNotFound, "No file at \(url.path).")
  }

  try validateSize(of: url, maxBytes: options.maxBytes)
  try await validateDuration(
    of: url,
    minMs: options.minDurationMs,
    maxMs: options.maxDurationMs
  )

  // Read AFTER validating, so an oversize clip is never pulled into memory.
  // The byte ceiling above is what bounds this allocation. A plain read and
  // not `.mappedIfSafe`: the pasteboard takes ownership of the bytes and
  // the clip's file may well be deleted behind us, which is exactly the
  // case where a memory-mapped `Data` stops being safe.
  let videoData: Data
  do {
    videoData = try Data(contentsOf: url)
  } catch {
    throw ReelsFailure(
      ReelsErrorCode.unreadableVideo,
      "Could not read the clip: \(error.localizedDescription)"
    )
  }

  var item: [String: Any] = [
    backgroundVideoKey: videoData,
    appIDKey: appId,
  ]
  // Best effort. A sticker that cannot be read is dropped rather than
  // failing the share: it is documented as optional and the video is the
  // payload that matters.
  if let stickerUri = options.stickerImageUri,
     let stickerURL = URL(string: stickerUri),
     stickerURL.isFileURL,
     let stickerData = try? Data(contentsOf: stickerURL) {
    item[stickerImageKey] = stickerData
  }

  // Deliberately NOT adding `.localOnly` alongside the expiry, tempting as
  // it is (it would keep a 50 MB clip off Universal Clipboard). Meta's
  // sample sets only `expirationDate`, the failure mode of an option
  // Instagram does not expect is a SILENT no-op, and none of this can be
  // verified without a device. If a device test shows the handoff working,
  // adding `.localOnly` is a worthwhile follow-up with its own device test.
  await MainActor.run {
    UIPasteboard.general.setItems(
      [item],
      options: [.expirationDate: Date().addingTimeInterval(pasteboardTTLSeconds)]
    )
  }

  let opened = await openReelsComposer()
  guard opened else {
    // Do not leave the clip sitting on the user's pasteboard when nothing
    // is going to consume it.
    await MainActor.run { UIPasteboard.general.items = [] }
    throw ReelsFailure(
      ReelsErrorCode.instagramUnavailable,
      "iOS could not open \(reelsShareURLString)."
    )
  }
}

private func validateSize(of url: URL, maxBytes: Double) throws {
  let attributes: [FileAttributeKey: Any]
  do {
    attributes = try FileManager.default.attributesOfItem(atPath: url.path)
  } catch {
    throw ReelsFailure(
      ReelsErrorCode.unreadableVideo,
      "Could not stat the clip: \(error.localizedDescription)"
    )
  }
  guard let size = (attributes[.size] as? NSNumber)?.doubleValue else {
    throw ReelsFailure(ReelsErrorCode.unreadableVideo, "The clip reports no size.")
  }
  if maxBytes > 0 && size > maxBytes {
    throw ReelsFailure(
      ReelsErrorCode.videoTooLarge,
      "The clip is \(Int(size)) bytes, over the \(Int(maxBytes)) byte ceiling."
    )
  }
}

private func validateDuration(of url: URL, minMs: Double, maxMs: Double) async throws {
  let asset = AVURLAsset(url: url)
  let duration: CMTime
  do {
    if #available(iOS 16.0, *) {
      duration = try await asset.load(.duration)
    } else {
      duration = asset.duration
    }
  } catch {
    throw ReelsFailure(
      ReelsErrorCode.unreadableVideo,
      "Could not read the clip's duration: \(error.localizedDescription)"
    )
  }

  let seconds = CMTimeGetSeconds(duration)
  // A non-finite duration is what a corrupt or still-being-written file
  // gives you. Reporting it as "too short" would send the user off to trim
  // a clip that is not the problem.
  guard seconds.isFinite, seconds > 0 else {
    throw ReelsFailure(ReelsErrorCode.unreadableVideo, "The clip reports no usable duration.")
  }

  let milliseconds = seconds * 1000
  if minMs > 0 && milliseconds < minMs {
    throw ReelsFailure(
      ReelsErrorCode.videoTooShort,
      "The clip is \(Int(milliseconds))ms, under the \(Int(minMs))ms minimum."
    )
  }
  if maxMs > 0 && milliseconds > maxMs {
    throw ReelsFailure(
      ReelsErrorCode.videoTooLong,
      "The clip is \(Int(milliseconds))ms, over the \(Int(maxMs))ms maximum."
    )
  }
}

/**
 Open the composer and report whether iOS actually did it.

 `canOpenURL` is NOT consulted first, on purpose. It answers only for
 schemes listed in `LSApplicationQueriesSchemes`, so if that declaration is
 ever dropped from `plugins/with-instagram-reels.js` this would start
 reporting "Instagram not installed" on devices where it plainly is, and the
 share would break for a reason that has nothing to do with Instagram.
 `open` needs no such declaration and its completion handler answers the
 same question directly. The plist entry still matters, for slice
 jits-s6mi.3's pre-flight availability check.
 */
@MainActor
private func openReelsComposer() async -> Bool {
  guard let url = URL(string: reelsShareURLString) else { return false }
  return await withCheckedContinuation { continuation in
    UIApplication.shared.open(url, options: [:]) { success in
      continuation.resume(returning: success)
    }
  }
}
