import { loadSharing } from "./native-modules";
import { SHARE_COPY } from "./share-copy";

export type ShareSheetResult = { ok: true } | { ok: false; detail: string };

/**
 * Hand the downloaded reel to the system share sheet. `shareAsync` cannot
 * report whether the user actually completed a share, so success only means
 * the sheet opened (and closed).
 */
export async function openShareSheet(fileUri: string): Promise<ShareSheetResult> {
  const sharing = loadSharing();
  if (!sharing) return { ok: false, detail: "module-unavailable" };
  try {
    await sharing.shareAsync(fileUri, {
      mimeType: "video/mp4",
      UTI: "public.mpeg-4",
      dialogTitle: SHARE_COPY.sheetTitle,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown" };
  }
}
