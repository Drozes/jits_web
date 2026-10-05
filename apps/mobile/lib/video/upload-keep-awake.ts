import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { hasActiveVideoUploads, subscribeUploadActivity } from "./video-upload-manager";

/**
 * Its own tag, so it never releases (or is released by) the match wizard's
 * `match-live` lock (lib/match-flow/use-keep-awake.ts).
 */
export const UPLOAD_KEEP_AWAKE_TAG = "match-upload";

let held = false;
let unbind: (() => void) | null = null;

function release(): void {
  if (!held) return;
  held = false;
  try {
    void Promise.resolve(deactivateKeepAwake(UPLOAD_KEEP_AWAKE_TAG)).catch(() => undefined);
  } catch {
    /* a wake-lock failure is never fatal */
  }
}

function sync(): void {
  if (hasActiveVideoUploads()) {
    if (held) return;
    held = true;
    void activateKeepAwakeAsync(UPLOAD_KEEP_AWAKE_TAG).catch(() => {
      // Non-fatal: the upload still runs, the screen may just lock.
      held = false;
    });
    return;
  }
  release();
}

/**
 * Hold the screen awake while ANY match-video upload is running, app-wide
 * (jits-n2im.1).
 *
 * The wizard's lock is released when the step leaves live, which is the
 * exact moment the upload starts, so auto-lock suspended a foreground-only
 * upload (prod: angle B arrived 5.6 minutes late). Owned by the upload
 * bootstrap rather than any screen, so it survives the athlete leaving the
 * verdict, and keyed on the manager's live runners: it is released when
 * every upload settles (landed, paused, failed or abandoned). A paused job
 * holds nothing; its retry re-acquires the lock when it runs.
 *
 * Idempotent; returns an unbind that also releases a held lock.
 */
export function bindUploadKeepAwake(): () => void {
  if (unbind) return unbind;
  const off = subscribeUploadActivity(sync);
  sync();
  unbind = () => {
    off();
    release();
    unbind = null;
  };
  return unbind;
}

/** Test-only. */
export function __resetUploadKeepAwake(): void {
  unbind?.();
  held = false;
  unbind = null;
}
