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
 * - 60 s overall timeout; a timeout, a non-2xx or a throw deletes the
 *   partial file and returns a typed failure.
 * - One download per target at a time: concurrent callers (share + save)
 *   share the in-flight promise.
 * - NEVER deleted right after a handoff: Android's Instagram reads the
 *   `content://` URI asynchronously. `sweepShareCache` (viewer mount) drops
 *   files older than 24 h and `clearShareCache` runs on sign-out.
 */

export const SHARE_CACHE_DIRNAME = "highlight-share";
export const DOWNLOAD_TIMEOUT_MS = 60_000;
export const SHARE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type DownloadFailure = "download_timeout" | "download_http" | "unknown";

export type DownloadResult =
  | { ok: true; uri: string; byteCount: number; reused: boolean; elapsedMs: number }
  | { ok: false; failure: DownloadFailure; status?: number; elapsedMs: number };

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

async function existingSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && typeof info.size === "number" ? info.size : 0;
  } catch {
    return 0;
  }
}

const inFlight = new Map<string, { promise: Promise<DownloadResult>; listeners: Set<DownloadProgress> }>();

async function runDownload(
  signedUrl: string,
  dir: string,
  target: string,
  listeners: Set<DownloadProgress>,
  timeoutMs: number,
): Promise<DownloadResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const reusedSize = await existingSize(target);
  if (reusedSize > 0) return { ok: true, uri: target, byteCount: reusedSize, reused: true, elapsedMs: elapsed() };

  const part = `${target}.part`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    await deleteQuietly(part);
    const resumable = FileSystem.createDownloadResumable(signedUrl, part, {}, (p) => {
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
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const outcome = await Promise.race([resumable.downloadAsync(), timeout]);
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
    if (timer) clearTimeout(timer);
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
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<DownloadResult> {
  const dir = shareCacheDir();
  if (!dir) return Promise.resolve({ ok: false, failure: "unknown", elapsedMs: 0 });
  const target = `${dir}${safeFileName(source.fileName)}`;

  const running = inFlight.get(target);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const listeners = new Set<DownloadProgress>();
  if (onProgress) listeners.add(onProgress);
  const promise = runDownload(signedUrl, dir, target, listeners, timeoutMs).finally(() => {
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
