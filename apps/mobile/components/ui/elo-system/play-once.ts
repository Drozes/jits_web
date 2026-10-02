import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * "Real transitions only" for one-shot result moments (Motion Rule): a
 * moment keyed on a result (e.g. `verdict:<matchId>`) plays the first time
 * that key is seen and never again, across remounts, navigating back and
 * app restarts.
 *
 * The keys live in ONE AsyncStorage entry, a JSON map key -> epoch ms,
 * capped at the newest `PLAYED_CAP`. It is loaded once at import WITHOUT
 * being awaited (a read that lands late only means a very early mount plays
 * once more), and every new key is written through.
 */
export const PLAYED_STORAGE_KEY = "motion:played:v1";
export const PLAYED_CAP = 50;

const played = new Map<string, number>();

function persist(): void {
  const newest = [...played.entries()].sort((a, b) => b[1] - a[1]).slice(0, PLAYED_CAP);
  if (newest.length < played.size) {
    played.clear();
    for (const [k, t] of newest) played.set(k, t);
  }
  try {
    void AsyncStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify(Object.fromEntries(newest))).catch(() => undefined);
  } catch {
    // Storage is best effort: the in-memory set still holds for this run.
  }
}

function load(): Promise<void> {
  try {
    return AsyncStorage.getItem(PLAYED_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, t] of Object.entries(parsed)) {
          if (typeof t === "number" && !played.has(k)) played.set(k, t);
        }
      })
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/** Resolves once the stored keys are in memory (tests). */
export const playedLoaded: Promise<void> = load();

export function hasPlayed(key: string): boolean {
  return played.has(key);
}

export function markPlayed(key: string): void {
  if (played.has(key)) return;
  played.set(key, Date.now());
  persist();
}

/** Tests only: read the stored keys again (as a fresh launch would). */
export function __reloadPlayedForTests(): Promise<void> {
  return load();
}

/** Tests only: forget every key (memory only). */
export function __resetPlayedMomentsForTests(): void {
  played.clear();
}

/**
 * Decides once, on mount, whether this mount plays a one-shot moment: only
 * when `eligible`, and with a `key` only the first time that key is seen.
 * Later prop changes never turn it on (real transitions only).
 */
export function usePlayOnce(key: string | null | undefined, eligible: boolean): boolean {
  const [play] = React.useState(() => eligible && !(key != null && played.has(key)));
  React.useEffect(() => {
    if (play && key != null) markPlayed(key);
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return play;
}

/**
 * Matches this athlete confirmed in this app run: the verdict that follows
 * a confirm is fresh even when the match itself completed long ago.
 */
const confirmedHere = new Set<string>();

export function markResultFresh(matchId: string): void {
  confirmedHere.add(matchId);
}

/** How recent a result must be for its verdict to celebrate. */
export const RESULT_FRESH_MS = 5 * 60_000;

/**
 * A result is fresh (may play its moment) when this athlete just confirmed
 * it here, or it completed within `RESULT_FRESH_MS`. An unknown completion
 * time (older backend) counts as fresh; the played keys still apply.
 */
export function isResultFresh(matchId: string, completedAt: string | null, now: number = Date.now()): boolean {
  if (confirmedHere.has(matchId)) return true;
  if (completedAt == null) return true;
  const t = Date.parse(completedAt);
  if (!Number.isFinite(t)) return true;
  return now - t <= RESULT_FRESH_MS;
}

/** Tests only. */
export function __resetFreshForTests(): void {
  confirmedHere.clear();
}
