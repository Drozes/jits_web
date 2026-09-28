import { loadMediaLibrary } from "./native-modules";

export type SavePhotosResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "unavailable" | "failed"; detail?: string };

/**
 * Save the downloaded reel to the camera roll. Asks for WRITE-ONLY access
 * (`requestPermissionsAsync(true)`, the `savePhotosPermission` string that
 * `app.json` already declares); never reads the library.
 */
export async function saveReelToPhotos(fileUri: string): Promise<SavePhotosResult> {
  const media = loadMediaLibrary();
  if (!media) return { ok: false, reason: "unavailable" };
  try {
    const permission = await media.requestPermissionsAsync(true);
    if (!permission?.granted) return { ok: false, reason: "permission" };
  } catch (err) {
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : "permission request failed" };
  }
  try {
    await media.saveToLibraryAsync(fileUri);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : "unknown" };
  }
}
