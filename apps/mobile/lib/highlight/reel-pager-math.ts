import type { ReelItem } from "./reel-types";

/**
 * Pure page math for the shorts-style reel pager (specs/matches-tab section 8,
 * jits-a4fw.5). No React, no native modules: everything here is unit tested.
 */

/** Players kept alive by the pager: previous, current and next. */
export const REEL_POOL_SIZE = 3;
/** How many pages ahead of the visible one get their signed URL prefetched. */
export const REEL_PREFETCH_AHEAD = 2;
/** Load the lane's next page once the visible page is this close to the end. */
export const REEL_LOAD_MORE_THRESHOLD = 3;
/** A page counts as visible (it plays, it is "landed on") at 80% coverage. */
export const REEL_VISIBLE_PERCENT = 80;

/** Keeps an index inside `[0, count - 1]` (0 for an empty list). */
export function clampIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(count - 1, Math.trunc(index)));
}

/** FlatList `getItemLayout` for full-screen pages of `pageHeight`. */
export function pageLayout(pageHeight: number, index: number): { length: number; offset: number; index: number } {
  return { length: pageHeight, offset: pageHeight * index, index };
}

/** The page a scroll offset rests on (nearest page, clamped). */
export function pageIndexFromOffset(offsetY: number, pageHeight: number, count: number): number {
  if (pageHeight <= 0) return 0;
  return clampIndex(Math.round(offsetY / pageHeight), count);
}

/**
 * Which page each pool slot serves when `active` is visible: slot `k` serves
 * the page in `{active - 1, active, active + 1}` whose index is `k` mod the
 * pool size, or nothing. Indexing by modulo means a one-page swipe reassigns
 * exactly ONE slot (the page that fell two behind becomes the new next page),
 * so the visible and the already-preloaded neighbour keep their players.
 */
export function poolAssignment(active: number, count: number, size = REEL_POOL_SIZE): (number | null)[] {
  const slots: (number | null)[] = Array.from({ length: size }, () => null);
  if (count <= 0) return slots;
  const half = Math.floor(size / 2);
  for (let i = active - half; i <= active + half; i++) {
    if (i < 0 || i >= count) continue;
    slots[i % size] = i;
  }
  return slots;
}

/** The slot serving `index` for the visible `active` page, or null when none does. */
export function slotForIndex(index: number, active: number, count: number, size = REEL_POOL_SIZE): number | null {
  const slot = poolAssignment(active, count, size).indexOf(index);
  return slot === -1 ? null : slot;
}

/** Pages whose signed URL is prefetched: the next `ahead`, then the previous one. */
export function prefetchTargets(active: number, count: number, ahead = REEL_PREFETCH_AHEAD): number[] {
  const out: number[] = [];
  for (let k = 1; k <= ahead; k++) if (active + k < count) out.push(active + k);
  if (active - 1 >= 0) out.push(active - 1);
  return out;
}

export function shouldLoadMore(active: number, count: number, threshold = REEL_LOAD_MORE_THRESHOLD): boolean {
  return count > 0 && active >= count - threshold;
}

export type SwipeDirection = "next" | "previous";

export function swipeDirection(from: number, to: number): SwipeDirection | null {
  if (to === from) return null;
  return to > from ? "next" : "previous";
}

/** Appends a loaded page to the lane, dropping reels already in it (AC 4.4: no duplicate). */
export function mergeReelItems(existing: readonly ReelItem[], more: readonly ReelItem[]): ReelItem[] {
  const seen = new Set(existing.map((r) => r.highlightId));
  const out = [...existing];
  for (const item of more) {
    if (seen.has(item.highlightId)) continue;
    seen.add(item.highlightId);
    out.push(item);
  }
  return out;
}
