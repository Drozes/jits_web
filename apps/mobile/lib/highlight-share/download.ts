import * as FileSystem from "expo-file-system/legacy";
import type { HighlightShareSource } from "@jits/shared/api/highlight-share";

/**
 * Download of the LIVE reel into the app cache, for the share handoff and
 * Save to Photos (jr_be spec 014 section 16.6.1). Uses the legacy
 * `expo-file-system` surface, the same one the upload path uses.
 *
 * - Target `${cacheDirectory}highlight-share/${fileName}`; the version is in
 *   the server-built file name, so a new version never reuses an old file.
 * - The bytes land in `<name>.part` and are moved into place only on a 2xx,
 *   so an existing, non-empty target is always a COMPLETE earlier download
 *   and is reused.
 * - Progress-aware timeout: the download fails only after 30 s with no new
 *   bytes, or after a 180 s overall cap, so a large reel on a slow but
 *   working connection is not cut off at a flat deadline. A timeout, a
 *   non-2xx or a throw deletes the partial file and returns a typed failure;
 *   the abandoned native promise is caught so a late rejection after the
 *   cancel is never unhandled.
 * - One download per target at a time: concurrent callers (share + save)
 *   share the in-flight promise; a caller that joined one is told so
 *   (`joined`), so the acquisition is logged once.
 * - A cached file older than 23 h is downloaded again instead of reused, so
 *   the 24 h sweep never deletes a file that is about to be handed off.
 * - NEVER deleted right after a handoff: Android's Instagram reads the
 *   `content://` URI asynchronously. `sweepShareCache` (viewer mount) drops
 *   files older than 24 h and `clearShareCache` runs on sign-out.
 */

export const SHARE_CACHE_DIRNAME = "highlight-share";
/** No new bytes for this long: the download has stalled. */
export const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;
/** Hard cap on one download, however steadily bytes arrive. */
export const DOWNLOAD_MAX_MS = 180_000;
export const SHARE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A cached file older than this is re-downloaded (the sweep deletes at 24 h). */
export const SHARE_CACHE_REUSE_MAX_AGE_MS = 23 * 60 * 60 * 1000;

export interface DownloadTimeouts {
  stallMs?: number;
  maxMs?: number;
}

export type DownloadFailure = "download_timeout" | "download_http" | "unknown";

export type DownloadResult =
  | { ok: true; uri: string; byteCount: number; reused: boolean; elapsedMs: number; joined?: boolean }
  | { ok: false; failure: DownloadFailure; status?: number; elapsedMs: number; joined?: boolean };

/** Fraction 0..1, or null when the server sent no length. */
export type DownloadProgress = (fraction: number | null) => void;

export function shareCacheDir(): string | null {
  const base = FileSystem.cacheDirectory;
  if (!base) return null;
  return `${base.endsWith("/") ? base : `${base}/`}${SHARE_CACHE_DIRNAME}/`;
}

/** A file name safe to join onto the cache dir (no separators, no traversal). */
export function safeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || "elorated-highlight.mp4";
}

async function deleteQuietly(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort.
  }
}

/** Remove one cached reel (the Reels file-not-found / unreadable re-download path). */
export async function deleteCachedFile(uri: string): Promise<void> {
  await deleteQuietly(uri);
}

async function existingFile(uri: string): Promise<{ size: number; modifiedMs: number }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || typeof info.size !== "number") return { size: 0, modifiedMs: 0 };
    return { size: info.size, modifiedMs: (info.modificationTime ?? 0) * 1000 };
  } catch {
    return { size: 0, modifiedMs: 0 };
  }
}

async function existingSize(uri: string): Promise<number> {
  return (await existingFile(uri)).size;
}

const inFlight = new Map<string, { promise: Promise<DownloadResult>; listeners: Set<DownloadProgress> }>();

async function runDownload(
  signedUrl: string,
  dir: string,
  target: string,
  listeners: Set<DownloadProgress>,
  timeouts: Required<DownloadTimeouts>,
): Promise<DownloadResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const cached = await existingFile(target);
  if (cached.size > 0) {
    if (Date.now() - cached.modifiedMs <= SHARE_CACHE_REUSE_MAX_AGE_MS) {
      return { ok: true, uri: target, byteCount: cached.size, reused: true, elapsedMs: elapsed() };
    }
    await deleteQuietly(target); // About to be swept: fetch a fresh copy.
  }

  const part = `${target}.part`;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let fireTimeout: () => void = () => undefined;
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => fireTimeout(), timeouts.stallMs);
  };
  let lastWritten = -1;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    await deleteQuietly(part);
    const resumable = FileSystem.createDownloadResumable(signedUrl, part, {}, (p) => {
      if (p.totalBytesWritten > lastWritten) {
        lastWritten = p.totalBytesWritten;
        armStall(); // Bytes are still arriving.
      }
      const fraction =
        p.totalBytesExpectedToWrite > 0
          ? Math.min(1, p.totalBytesWritten / p.totalBytesExpectedToWrite)
          : null;
      for (const listener of listeners) {
        try {
          listener(fraction);
        } catch {
          // A listener never breaks the download.
        }
      }
    });
    const timeout = new Promise<"timeout">((resolve) => {
      fireTimeout = () => resolve("timeout");
      capTimer = setTimeout(() => resolve("timeout"), timeouts.maxMs);
    });
    armStall();
    const download = resumable.downloadAsync();
    // After a timeout the cancel may reject this later: never unhandled.
    download.catch(() => undefined);
    const outcome = await Promise.race([download, timeout]);
    if (outcome === "timeout") {
      await resumable.cancelAsync().catch(() => undefined);
      await deleteQuietly(part);
      return { ok: false, failure: "download_timeout", elapsedMs: elapsed() };
    }
    if (!outcome || outcome.status < 200 || outcome.status >= 300) {
      await deleteQuietly(part);
      return { ok: false, failure: "download_http", status: outcome?.status, elapsedMs: elapsed() };
    }
    await deleteQuietly(target);
    await FileSystem.moveAsync({ from: part, to: target });
    const byteCount = await existingSize(target);
    if (byteCount <= 0) {
      await deleteQuietly(target);
      return { ok: false, failure: "download_http", status: outcome.status, elapsedMs: elapsed() };
    }
    return { ok: true, uri: target, byteCount, reused: false, elapsedMs: elapsed() };
  } catch {
    await deleteQuietly(part);
    return { ok: false, failure: "unknown", elapsedMs: elapsed() };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    if (capTimer) clearTimeout(capTimer);
  }
}

/**
 * Download `source` (its `fileName`) from `signedUrl` into the share cache,
 * or reuse a complete earlier download of the same file. Never throws.
 */
export function downloadReel(
  source: Pick<HighlightShareSource, "fileName">,
  signedUrl: string,
  onProgress?: DownloadProgress,
  timeouts: DownloadTimeouts = {},
): Promise<DownloadResult> {
  const dir = shareCacheDir();
  if (!dir) return Promise.resolve({ ok: false, failure: "unknown", elapsedMs: 0 });
  const target = `${dir}${safeFileName(source.fileName)}`;

  const running = inFlight.get(target);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise.then((result) => ({ ...result, joined: true }));
  }
  const listeners = new Set<DownloadProgress>();
  if (onProgress) listeners.add(onProgress);
  const limits = { stallMs: timeouts.stallMs ?? DOWNLOAD_STALL_TIMEOUT_MS, maxMs: timeouts.maxMs ?? DOWNLOAD_MAX_MS };
  const promise = runDownload(signedUrl, dir, target, listeners, limits).finally(() => {
    inFlight.delete(target);
  });
  inFlight.set(target, { promise, listeners });
  return promise;
}

/**
 * Delete cached reels (and stray `.part` files) older than 24 h. Run on
 * viewer mount. Skips anything a running download is writing. Never throws.
 */
export async function sweepShareCache(now: number = Date.now()): Promise<void> {
  const dir = shareCacheDir();
  if (!dir) return;
  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return; // No cache directory yet.
  }
  const busy = new Set<string>();
  for (const target of inFlight.keys()) {
    busy.add(target);
    busy.add(`${target}.part`);
  }
  for (const name of names) {
    const uri = `${dir}${name}`;
    if (busy.has(uri)) continue;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) continue;
      const modifiedMs = (info.modificationTime ?? 0) * 1000;
      if (now - modifiedMs > SHARE_CACHE_MAX_AGE_MS) await deleteQuietly(uri);
    } catch {
      // Next file.
    }
  }
}

/** Delete the whole share cache (sign-out). Never throws. */
export async function clearShareCache(): Promise<void> {
  const dir = shareCacheDir();
  if (!dir) return;
  await deleteQuietly(dir);
}
