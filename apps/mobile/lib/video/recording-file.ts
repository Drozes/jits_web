import { Directory, File, Paths } from "expo-file-system";
import { excludeFromBackup } from "@/modules/backup-exclusion";

/**
 * Custody of the local clip between "the camera finished writing it" and
 * "the bytes are in the bucket".
 *
 * WHY MOVE IT. `expo-camera` writes recordings into the app's CACHE
 * directory, which iOS and Android are both free to purge whenever storage
 * is tight, and which iOS purges aggressively for apps that have been
 * backgrounded. Persisting an upload job that points into the cache would
 * be persistence in name only: the record would survive the process kill
 * and the file it names would not. Moving the clip under the DOCUMENT
 * directory first is what makes "resume after an app kill" mean anything.
 *
 * A move within the same volume is a rename, so this is cheap even for a
 * 600 MB clip, and it is what keeps the app from holding two copies.
 *
 * BACKUP. `Paths.document` is `<app>/Documents/` on iOS, which iCloud backs
 * up by default, and `context.filesDir` on Android, which Auto Backup
 * includes and caps at 25 MB per app. A parked 300-600 MB clip would
 * therefore be uploaded to a user's 5 GB iCloud tier, and would make the
 * Android backup of the whole app fail for as long as it sits there. The
 * two platforms need different mechanisms and both are applied: iOS through
 * the per-URL `NSURLIsExcludedFromBackupKey` set here (jits-vjbq), Android
 * declaratively through `plugins/with-android-backup-rules.js`, because it
 * has no per-file equivalent.
 */

/** Subdirectory of the document directory that holds clips awaiting upload. */
export const RETAINED_DIR_NAME = "match-uploads";

/**
 * Move `fileUri` somewhere durable and return its new URI.
 *
 * Best effort: if anything about the move fails (no space, a permission
 * quirk, a platform that will not rename across these paths) the ORIGINAL
 * URI is returned. A cache-resident clip that uploads now is much better
 * than no upload at all; only the cross-restart resume is weakened.
 */
export function retainRecording(fileUri: string, matchId: string, ext: string): string {
  try {
    const dir = new Directory(Paths.document, RETAINED_DIR_NAME);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    // Unconditionally, not only on the create branch. The directory can
    // exist because an EARLIER call created it and then failed to set the
    // flag, or because it was restored by a device migration, and the flag
    // is a per-inode attribute that does not survive being recreated. One
    // idempotent metadata write per recording is cheaper than reasoning
    // about which of those happened.
    markExcludedFromBackup(dir.uri, matchId);

    const source = new File(fileUri);
    if (!source.exists) return fileUri;

    const destination = new File(dir, `${matchId}.${ext}`);
    // A re-recording of the same match supersedes the previous clip; the
    // job record is replaced too, so the old file has no owner left.
    if (destination.exists) destination.delete();

    source.move(destination);
    // `move` rewrites the instance's uri in place.

    // Belt and braces. Apple's QA1719 says excluding a directory excludes
    // its contents, but that is the one claim in this change that cannot be
    // checked without a device, and a clip that slips into a backup is the
    // whole failure being prevented. Setting it on the file as well costs a
    // second metadata write and removes the dependency on that reading.
    markExcludedFromBackup(source.uri, matchId);

    return source.uri;
  } catch (err) {
    console.warn(`[video] could not retain recording for ${matchId}:`, err);
    return fileUri;
  }
}

/**
 * Best-effort backup exclusion. Never throws and never changes the outcome
 * of retention: `retainRecording` exists to make the upload resumable, and
 * an un-excluded clip that uploads beats an excluded one that does not.
 *
 * A `false` is expected on Android (handled declaratively) and on any build
 * without the native module, so it is logged at debug level rather than
 * warned, to keep a routine platform difference out of the noise that real
 * upload failures live in.
 */
function markExcludedFromBackup(uri: string, matchId: string): void {
  try {
    if (!excludeFromBackup(uri) && __DEV__) {
      console.log(`[video] backup exclusion not applied to ${uri} (match ${matchId})`);
    }
  } catch (err) {
    console.warn(`[video] backup exclusion threw for ${uri}:`, err);
  }
}

/**
 * Delete a clip we previously retained, once its upload has settled.
 *
 * Scoped to our own directory on purpose. `fileUri` can still be the
 * camera's cache path when `retainRecording` fell back, and deleting a file
 * we do not own (a user-picked video, say) over a failed move would be a
 * far worse bug than leaving a cache file for the OS to reap.
 */
export function releaseRecording(fileUri: string): void {
  try {
    if (!fileUri.includes(`/${RETAINED_DIR_NAME}/`)) return;
    const file = new File(fileUri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn(`[video] could not delete retained recording ${fileUri}:`, err);
  }
}

/**
 * Delete a local clip wherever it lives. Used by the practice match, whose
 * clip is never uploaded and so never moves under `match-uploads/` (which is
 * why `releaseRecording` cannot be used). Swallows "not found" and any other
 * failure: a leftover cache file is for the OS to reap, not a user error.
 */
export function discardLocalClip(fileUri: string | null | undefined): void {
  if (!fileUri) return;
  try {
    const file = new File(fileUri);
    if (file.exists) file.delete();
  } catch (err) {
    console.warn(`[video] could not discard local clip ${fileUri}:`, err);
  }
}
