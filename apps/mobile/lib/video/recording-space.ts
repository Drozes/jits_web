import * as React from "react";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Rough on-disk rate of a match recording: 720p (`camera-overlay.tsx`) at
 * about 8 Mbit/s, the high end of what iOS writes for 720p H.264/HEVC, so
 * the estimate errs toward warning. A 10-minute match is ~600 MB.
 */
export const RECORDING_BYTES_PER_SECOND = 1_000_000;
/** Headroom on top of the estimate (the bead's x1.2). */
export const RECORDING_SPACE_MARGIN = 1.2;
/** Used when the match length is unknown. */
export const DEFAULT_MATCH_SECONDS = 600;

export function estimateRecordingBytes(durationSeconds: number | null | undefined): number {
  const seconds = durationSeconds && durationSeconds > 0 ? durationSeconds : DEFAULT_MATCH_SECONDS;
  return Math.ceil(seconds * RECORDING_BYTES_PER_SECOND * RECORDING_SPACE_MARGIN);
}

/** "1.2" GB, rounded UP to a tenth so freeing that much is always enough. */
function gbToFree(bytes: number): string {
  const tenths = Math.max(1, Math.ceil(bytes / (1024 * 1024 * 1024) / 0.1));
  return (tenths / 10).toFixed(1).replace(/\.0$/, "");
}

/** The warning for a phone without room for the recording, else null (deck section 8). */
export function recordingSpaceWarning(freeBytes: number | null, durationSeconds: number | null | undefined): string | null {
  if (freeBytes == null || !Number.isFinite(freeBytes)) return null;
  const needed = estimateRecordingBytes(durationSeconds);
  if (freeBytes >= needed) return null;
  return `Not enough space on this phone to record. Free up ${gbToFree(needed - freeBytes)} GB.`;
}

/**
 * Check free disk once recording is switched on at the face-off
 * (jits-n2im.6), so a full phone is said up front instead of failing the
 * recording with a generic error. A failed read says nothing: the check
 * is advice, never a gate.
 */
export function useRecordingSpaceWarning(enabled: boolean, durationSeconds: number | null | undefined): string | null {
  const [freeBytes, setFreeBytes] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!enabled) {
      setFreeBytes(null);
      return;
    }
    let cancelled = false;
    void Promise.resolve()
      .then(() => FileSystem.getFreeDiskStorageAsync())
      .then((bytes) => {
        if (!cancelled) setFreeBytes(bytes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? recordingSpaceWarning(freeBytes, durationSeconds) : null;
}
