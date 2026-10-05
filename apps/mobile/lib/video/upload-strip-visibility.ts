import * as React from "react";
import { useIsScreenFocused } from "./use-upload-announcements";

/**
 * Where the app-wide upload strip must stay out of the way (jits-n2im.2,
 * COPY-DECK v2.2 section 3): hidden on the countdown and the live screen
 * (every job), and on the verdict and match detail of the SAME match (they
 * show the full Film status). A screen registers while it is FOCUSED, so a
 * verdict left mounted under a pushed screen does not hide the strip there.
 */
export type StripSuppression = { kind: "all" } | { kind: "match"; matchId: string };

const active = new Map<number, StripSuppression>();
const listeners = new Set<() => void>();
let seq = 0;
let snapshot: StripSuppression[] = [];

function emit(): void {
  snapshot = [...active.values()];
  for (const l of listeners) l();
}

export function getStripSuppressions(): StripSuppression[] {
  return snapshot;
}

export function subscribeStripSuppressions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the strip must not show a job for `matchId` right now. */
export function isStripSuppressed(suppressions: StripSuppression[], matchId: string): boolean {
  return suppressions.some((s) => s.kind === "all" || s.matchId === matchId);
}

export function useStripSuppressions(): StripSuppression[] {
  return React.useSyncExternalStore(subscribeStripSuppressions, getStripSuppressions, getStripSuppressions);
}

/** Register a suppression while the calling screen is focused (null registers nothing). */
export function useSuppressUploadStrip(rule: StripSuppression | null): void {
  const focused = useIsScreenFocused();
  const key = rule ? (rule.kind === "all" ? "all" : `match:${rule.matchId}`) : null;
  React.useEffect(() => {
    if (!key || !focused) return;
    const id = ++seq;
    active.set(id, key === "all" ? { kind: "all" } : { kind: "match", matchId: key.slice("match:".length) });
    emit();
    return () => {
      active.delete(id);
      emit();
    };
  }, [key, focused]);
}

/** Test-only. */
export function __resetStripSuppressionsForTests(): void {
  active.clear();
  emit();
}
