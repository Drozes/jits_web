/**
 * The Arena roster's ids, app-wide, so the header chip's `· N` counts the
 * same people the On The Mat rows render (spec 14, D2).
 *
 * `useArenaRoster` publishes the ids of its last good `get_arena_data`
 * read (`looking_athletes`) and clears them on unmount. Null means no roster
 * is loaded: every count built on it is null then, never a placeholder.
 *
 * KNOWN LIMIT: the roster is read by the Arena screen. Until the Arena has
 * loaded it once (tab screens mount on first visit), the chip shows no count
 * (`LIVE` / `GO LIVE`); an athlete who goes live after the last roster read
 * is not counted until the Arena re-reads it (`use-roster-lobby-sync`),
 * exactly as they are not yet a row.
 */
import { useSyncExternalStore } from "react";

let rosterIds: readonly string[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Replace the published roster ids (null: no roster loaded). */
export function publishMatRoster(ids: readonly string[] | null): void {
  if (ids === rosterIds) return;
  if (ids !== null && rosterIds !== null && sameIds(ids, rosterIds)) return;
  rosterIds = ids === null ? null : [...ids];
  emit();
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function getMatRosterIds(): readonly string[] | null {
  return rosterIds;
}

export function subscribeMatRoster(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useMatRosterIds(): readonly string[] | null {
  return useSyncExternalStore(subscribeMatRoster, getMatRosterIds, getMatRosterIds);
}

/** Test helper: back to "no roster loaded". */
export function resetMatRosterStore(): void {
  rosterIds = null;
  listeners.clear();
}
