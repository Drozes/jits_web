import * as React from "react";
import type { RecordingTruncation } from "./use-video-recorder";

/**
 * Match-scoped store for the outcome of a match-video upload (jits-od3).
 *
 * WHY THIS IS NOT COMPONENT STATE. The upload deliberately outlives the
 * component that started it: `useVideoRecorder` lets the storage write and
 * the `match_videos` insert run to completion after unmount, because
 * cancelling a 10-minute clip's upload because a step advanced would be
 * worse than any UI problem. That leaves three separate ways for the
 * RESULT to be lost if it is held by a component:
 *
 *   1. the step that owned it unmounts (the original jits-od3 defect);
 *   2. an ancestor remounts, which the wizard does on EVERY match, because
 *      the confirm step calls refresh() the moment the row completes and
 *      the wizard re-enters its loading branch;
 *   3. the upload finishes LATE, after whichever component would have
 *      recorded the result is already gone, so the write lands on a dead
 *      instance. apps/web still loses its `videoId` exactly this way: the
 *      object is in storage and the UI never learns its id.
 *
 * Hoisting state to a higher component fixes 1 and 2 and only narrows 3.
 * Keying it on the match fixes all three, because nothing that happens to
 * the component tree can reach it. A write always lands; whoever is
 * mounted finds out via `useSyncExternalStore`.
 *
 * SCOPE. In memory only, for the life of the JS context. It is NOT
 * persistence: surviving an app restart, and re-driving a failed upload,
 * are jits-341p. This module is the substrate that issue builds on, not
 * that issue. The file URI is deliberately not held here (holding a temp
 * capture file has its own lifecycle, and that is jits-341p's problem);
 * `storagePath` is recorded because a retry MUST reuse the same key.
 *
 * Mirrored by apps/web separately; the shape is deliberately platform
 * agnostic so the two can converge, but nothing here belongs in
 * packages/shared until both sides actually share it.
 */

export type MatchUploadStatus =
  /** Something is known about the recording, but no upload has started. */
  | "pending"
  /** Posting to storage / writing the match_videos row. */
  | "uploading"
  /** Storage object and match_videos row both landed. */
  | "uploaded"
  /** The upload is over and it failed. `error` says why. */
  | "error";

export interface MatchUploadEntry {
  matchId: string;
  status: MatchUploadStatus;
  /** `match_videos.id`, once the row lands. The handle playback needs. */
  videoId: string | null;
  /** User-facing failure reason. Null unless `status` is "error". */
  error: string | null;
  /** Set when the clip does not cover the whole match (jits-2zpe). */
  truncation: RecordingTruncation | null;
  /**
   * Storage key this attempt used. A retry has to reuse it or it strands
   * the failed attempt's half-written object at a dead path (jits-voh).
   */
  storagePath: string | null;
  /** Wall-clock of the last write, used only for eviction ordering. */
  updatedAt: number;
}

/**
 * Cap on tracked matches. A long session (a gym running a ladder) would
 * otherwise accumulate an entry per match for the life of the process.
 * Eight is far more matches than anyone has open context for, and the
 * oldest entry is the least likely to still have a surface showing it.
 */
export const MAX_TRACKED_MATCHES = 8;

const entries = new Map<string, MatchUploadEntry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function evictIfNeeded(): void {
  if (entries.size <= MAX_TRACKED_MATCHES) return;
  const oldest = [...entries.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const entry of oldest.slice(0, entries.size - MAX_TRACKED_MATCHES)) {
    entries.delete(entry.matchId);
  }
}

/** The current entry for a match, or null if nothing is known about it. */
export function getMatchUpload(matchId: string): MatchUploadEntry | null {
  return entries.get(matchId) ?? null;
}

/**
 * Merge `patch` into the match's entry, creating it if absent, and notify
 * subscribers. Always replaces the entry object, so a `useSyncExternalStore`
 * snapshot compares unequal exactly when something changed.
 *
 * This is called from the upload chain, which by design keeps running after
 * unmount, so it must NEVER be guarded by a mounted check.
 */
export function setMatchUpload(
  matchId: string,
  patch: Partial<Omit<MatchUploadEntry, "matchId" | "updatedAt">>,
): MatchUploadEntry {
  const prev = entries.get(matchId);
  const next: MatchUploadEntry = {
    matchId,
    status: prev?.status ?? "pending",
    videoId: prev?.videoId ?? null,
    error: prev?.error ?? null,
    truncation: prev?.truncation ?? null,
    storagePath: prev?.storagePath ?? null,
    ...patch,
    updatedAt: Date.now(),
  };
  entries.set(matchId, next);
  evictIfNeeded();
  emit();
  return next;
}

/**
 * Forget a match entirely. Nothing in this branch calls it: a failed
 * upload stays visible on purpose, because "it failed" remains true until
 * something re-drives it. It exists so jits-341p's retry has a way to
 * reset an entry it is about to replace, and so tests start clean.
 */
export function clearMatchUpload(matchId: string): void {
  if (!entries.delete(matchId)) return;
  emit();
}

/** Test-only reset. Never called from app code. */
export function resetMatchUploadStore(): void {
  entries.clear();
  emit();
}

export function subscribeMatchUpload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe a component to one match's upload entry. Re-renders only when
 * that match's entry object is replaced, and reads correctly on the first
 * render even if the upload started before this component existed, which
 * is the whole point.
 */
export function useMatchUpload(matchId: string): MatchUploadEntry | null {
  const getSnapshot = React.useCallback(() => getMatchUpload(matchId), [matchId]);
  return React.useSyncExternalStore(subscribeMatchUpload, getSnapshot, getSnapshot);
}
