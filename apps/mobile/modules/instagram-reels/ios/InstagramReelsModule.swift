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

 WHAT THIS COSTS THE USER, AND WHAT IT NO LONGER COSTS THEM. `setItems`
 REPLACES the general pasteboard, and there is no way to hand the composer a
 video without doing that. So when Instagram looks absent the previous
 contents are snapshotted first and PUT BACK if iOS then refuses to open the
 URL: a user without Instagram used to silently lose whatever they had
 copied, in exchange for nothing. While the handoff is live the items carry
 a five-minute expiry and `localOnly`.

 iOS 16 PASTEBOARD PROMPT. Since iOS 16 the system may ask the user to allow
 one app to read pasteboard data written by another, and this handoff works
 BY pasteboard. Nothing here can suppress that, and nothing here should
 assume a silent transition. Spotify, Strava and Peloton all ship with this.
 The snapshot is ITSELF such a read, which is why it is gated on Instagram
 looking absent rather than taken every time; see
 `snapshotPasteboardIfInstagramLooksAbsent`. And a TIMEOUT restores nothing
 at all, because a merely delayed handoff must not have its payload pulled
 out from under it; see `openReelsComposer`.
 */
public final class InstagramReelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstagramReels")

    /**
     Validate the clip, write it to the pasteboard, open the composer.

     `AsyncFunction` and not `Function`: reading a video's duration is an
     asynchronous asset load on iOS 16+, and loading tens of MB of file data
     has no business on the JS thread.

     Resolves a dictionary rather than nothing, because two things the
     caller cannot otherwise see have to be reported: whether the optional
     sticker actually made it, and how large the clip was. Meta's 50 MB is a
     RECOMMENDATION, so the size is measured and handed back for JS to judge
     rather than being a refusal here.

     Rejects with an explicit code (never one inferred from a class name),
     so the Swift and Kotlin halves report the same vocabulary and the JS
     wrapper can map both with one table.
     */
    AsyncFunction("shareToReels") { (options: ReelsShareOptions, promise: Promise) in
      Task {
        do {
          let outcome = try await handOffToReels(options)
          promise.resolve([
            "stickerApplied": outcome.stickerApplied,
            "byteCount": outcome.byteCount,
          ])
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
  /// Meta's duration REQUIREMENT. It arrives from JS rather than being a
  /// constant here so there is exactly one copy of it in the codebase; see
  /// `modules/instagram-reels/index.ts`. There is deliberately no
  /// `maxBytes`: the byte ceiling is a recommendation, so this side only
  /// measures and reports it.
  @Field var minDurationMs: Double = 0
  @Field var maxDurationMs: Double = 0
}

internal struct ReelsShareOutcome {
  let stickerApplied: Bool
  let byteCount: Double
}

// MARK: - Failure vocabulary

internal enum ReelsErrorCode {
  static let missingAppId = "ERR_REELS_MISSING_APP_ID"
  static let fileNotFound = "ERR_REELS_FILE_NOT_FOUND"
  static let unreadableVideo = "ERR_REELS_UNREADABLE_VIDEO"
  static let videoTooShort = "ERR_REELS_VIDEO_TOO_SHORT"
  static let videoTooLong = "ERR_REELS_VIDEO_TOO_LONG"
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
/// How long to wait for `open`'s completion handler before giving up. It is
/// not guaranteed to arrive; the reported case is the app being suspended
/// mid-transition.
private let openTimeoutSeconds: TimeInterval = 10

// MARK: - Handoff

private func handOffToReels(_ options: ReelsShareOptions) async throws -> ReelsShareOutcome {
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

  // Measured, not enforced. Meta states "under 50 MB" as a recommendation
  // while stating 3-60s as a requirement, and enforcing both makes them
  // mutually inconsistent at 1080p; see the note in index.ts.
  let byteCount = try measuredSize(of: url)
  try await validateDuration(
    of: url,
    minMs: options.minDurationMs,
    maxMs: options.maxDurationMs
  )

  // A plain read and not `.mappedIfSafe`: the pasteboard takes ownership of
  // the bytes and the clip's file may well be deleted behind us, which is
  // exactly the case where a memory-mapped `Data` stops being safe.
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
  // failing the share, since it is documented as optional and the video is
  // the payload that matters. It is REPORTED though, because a silently
  // missing overlay is exactly the class of no-op this module exists to
  // stop.
  var stickerApplied = false
  if let stickerUri = options.stickerImageUri,
     let stickerURL = URL(string: stickerUri),
     stickerURL.isFileURL,
     let stickerData = try? Data(contentsOf: stickerURL) {
    item[stickerImageKey] = stickerData
    stickerApplied = true
  }

  let previousItems = await snapshotPasteboardIfInstagramLooksAbsent()

  await MainActor.run {
    UIPasteboard.general.setItems(
      [item],
      options: [
        .expirationDate: Date().addingTimeInterval(pasteboardTTLSeconds),
        // Keeps a video OF THE OTHER ATHLETE off Universal Clipboard, so it
        // cannot land on the user's other Apple devices. That is the same
        // out-of-scope disclosure class the consent gate on this feature
        // exists to decide, so it is not optional here. The option is
        // consumed by the pasteboard server and is not visible to the
        // reading app, so it cannot change what Instagram sees.
        .localOnly: true,
      ]
    )
  }

  switch await openReelsComposer() {
  case .opened:
    return ReelsShareOutcome(stickerApplied: stickerApplied, byteCount: byteCount)

  case .refused:
    // iOS told us it did not open the URL, so nothing is going to read the
    // pasteboard and it is safe to undo the write.
    //
    // `previousItems` is nil when no snapshot was taken, which is the case
    // where `canOpenURL` said Instagram was there and `open` then refused
    // anyway. The user's clipboard was overwritten by `setItems` and cannot
    // be recovered either way, so the only remaining question is whether
    // the OTHER ATHLETE'S VIDEO lingers for the five-minute expiry. It
    // should not, so clear.
    await MainActor.run { UIPasteboard.general.items = previousItems ?? [] }
    throw ReelsFailure(
      ReelsErrorCode.instagramUnavailable,
      "iOS refused to open \(reelsShareURLString)."
    )

  case .timedOut:
    // DELIBERATELY TOUCH NOTHING. A timeout means we do not know what
    // happened, and the likeliest cause is a completion handler that was
    // merely DELAYED (an app suspended mid-transition) rather than dropped.
    // In that case iOS has already switched to Instagram and restoring the
    // pasteboard here would yank the payload out from under a handoff that
    // is about to succeed, opening the composer empty with no error
    // anywhere: this module's cardinal failure mode. The five-minute
    // expiry exists so a late read still works, and it is also what cleans
    // up if the handoff really did die.
    //
    // Reported as `handoffFailed`, NOT `instagramUnavailable`. Telling a
    // user with Instagram installed that it is not installed, because our
    // own timer fired, is the same mis-report this module exists to
    // prevent.
    throw ReelsFailure(
      ReelsErrorCode.handoffFailed,
      "No callback from opening \(reelsShareURLString) within \(Int(openTimeoutSeconds))s."
    )
  }
}

/**
 The pasteboard as it was, so it can be restored if the handoff fails, or
 `nil` when no snapshot was taken and the pasteboard must not be touched.

 TAKEN ONLY WHEN INSTAGRAM LOOKS ABSENT, and that gate is the point.
 Reading `items` IS the cross-app read iOS 16 can prompt for. Snapshotting
 on every share would make the user risk a paste prompt on the SUCCESS path
 in order to insure the failure path, at the worst moment in a funnel
 already known to be fragile, with a real chance of two prompts back to
 back: ours to read, then Instagram's to read what we wrote.

 `canOpenURL` is metadata. It triggers no prompt, and it needs only the
 `LSApplicationQueriesSchemes` entry `plugins/with-instagram-reels.js`
 already ships. So: Instagram present, no snapshot and no prompt; Instagram
 absent, snapshot, and that user was going to lose their clipboard anyway.

 NOTE WHAT THIS DOES NOT DO. It does not decide the RESULT. `open`'s
 completion handler remains the sole authority for that, exactly so a
 dropped plist entry cannot break the share (see `openReelsComposer`). A
 dropped entry now costs one unnecessary snapshot and nothing else.

 `numberOfItems` is checked before reading `items` because it does not
 prompt either, so an empty pasteboard is free even on this branch. It
 returns `[]`, meaning "snapshotted, and there was nothing", which is
 different from `nil`.
 */
@MainActor
private func snapshotPasteboardIfInstagramLooksAbsent() -> [[String: Any]]? {
  guard let url = URL(string: reelsShareURLString) else { return nil }
  if UIApplication.shared.canOpenURL(url) { return nil }
  guard UIPasteboard.general.numberOfItems > 0 else { return [] }
  return UIPasteboard.general.items
}

private func measuredSize(of url: URL) throws -> Double {
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
  return size
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
 One-shot latch, so the continuation below resumes exactly once.

 Both claimants run on the main queue in practice (`open`'s completion
 handler is delivered there, and so is the timeout), but this deliberately
 does not rely on that: resuming a `CheckedContinuation` twice is a hard
 crash, and the entire point of the timeout is to cover the system NOT
 behaving as expected.
 */
private final class ResumeOnce: @unchecked Sendable {
  private let lock = NSLock()
  private var used = false

  /// True for the first caller and nobody else.
  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if used { return false }
    used = true
    return true
  }
}

/**
 What happened when we asked iOS to open the composer.

 THREE VALUES AND NOT A BOOL, because two of them mean opposite things to a
 user. `refused` is iOS saying it did not open the URL, which on this scheme
 means Instagram is not there. `timedOut` is our own timer firing, which
 says nothing at all about Instagram and happens on a phone that has it.
 Collapsing them, which an earlier revision did, told a user with Instagram
 installed that it was not installed: the same mis-report this module exists
 to prevent, reintroduced by the fix for the hang.
 */
private enum ReelsOpenOutcome {
  case opened
  case refused
  case timedOut
}

/**
 Open the composer and report which of the three things happened.

 `canOpenURL` is NOT consulted to decide the RESULT, on purpose. It answers
 only for schemes listed in `LSApplicationQueriesSchemes`, so if that
 declaration is ever dropped from `plugins/with-instagram-reels.js` this
 would start reporting "Instagram not installed" on devices where it plainly
 is, and the share would break for a reason that has nothing to do with
 Instagram. `open` needs no such declaration and its completion handler
 answers the same question directly. (`canOpenURL` IS used, upstream, to
 decide whether a pasteboard snapshot is worth a possible paste prompt; a
 wrong answer there costs one wasted snapshot and cannot change the
 outcome.)

 The timeout exists because that completion handler is not guaranteed to
 arrive; the reported case is the app being suspended mid-transition. With
 no timeout the Task never finishes, the Promise never settles and the JS
 `await` hangs forever, which is strictly worse than any named failure: the
 caller's spinner never resolves and the user is told nothing at all.
 */
@MainActor
private func openReelsComposer() async -> ReelsOpenOutcome {
  guard let url = URL(string: reelsShareURLString) else { return .refused }
  let latch = ResumeOnce()
  return await withCheckedContinuation { (continuation: CheckedContinuation<ReelsOpenOutcome, Never>) in
    DispatchQueue.main.asyncAfter(deadline: .now() + openTimeoutSeconds) {
      if latch.claim() {
        continuation.resume(returning: .timedOut)
      }
    }
    UIApplication.shared.open(url, options: [:]) { success in
      if latch.claim() {
        continuation.resume(returning: success ? .opened : .refused)
      }
    }
  }
}
