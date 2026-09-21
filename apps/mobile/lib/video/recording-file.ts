import { Directory, File, Paths } from "expo-file-system";

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

    const source = new File(fileUri);
    if (!source.exists) return fileUri;

    const destination = new File(dir, `${matchId}.${ext}`);
    // A re-recording of the same match supersedes the previous clip; the
    // job record is replaced too, so the old file has no owner left.
    if (destination.exists) destination.delete();

    source.move(destination);
    // `move` rewrites the instance's uri in place.
    return source.uri;
  } catch (err) {
    console.warn(`[video] could not retain recording for ${matchId}:`, err);
    return fileUri;
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
