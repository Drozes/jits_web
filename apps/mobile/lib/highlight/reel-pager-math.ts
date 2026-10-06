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
/**
 * A cached playback signature is reused while younger than this. Signed URLs
 * live 1 h and `useMyHighlight` re-signs on demand past 50 min; 45 leaves a
 * prefetched URL at least 15 min of life on screen before that renewal.
 */
export const REEL_SIGN_REUSE_MS = 45 * 60_000;
/** Prefetched progress (to find a page's live render) is reused this long. */
export const REEL_PROGRESS_TTL_MS = 90_000;

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

/**
 * The page a scroll offset rests on (nearest page, clamped). With `footer`,
 * index `count` (the loading page after the last reel) is a valid rest too.
 */
export function pageIndexFromOffset(offsetY: number, pageHeight: number, count: number, footer = false): number {
  if (pageHeight <= 0) return 0;
  return clampIndex(Math.round(offsetY / pageHeight), footer ? count + 1 : count);
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

/**
 * Pages whose signed URL is prefetched: the next `ahead`. The previous page
 * was just watched, so its slot already holds it (review M4).
 */
export function prefetchTargets(active: number, count: number, ahead = REEL_PREFETCH_AHEAD): number[] {
  const out: number[] = [];
  for (let k = 1; k <= ahead; k++) if (active + k < count) out.push(active + k);
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

/** A drag past the last page by more than this shows C-V2 (spec 8.3). */
export const CAUGHT_UP_OVERSCROLL_PT = 48;

export interface CaughtUpInput {
  platform: "ios" | "android" | string;
  /** The page the athlete rests on, and the last loaded page. */
  active: number;
  lastIndex: number;
  pageHeight: number;
  /** The content offset when the drag began. */
  beginOffsetY: number;
  /** The content offset when the drag ended. */
  endOffsetY: number;
}

/** Offsets within this of the last page's offset count as "at the end" (Android clamps there). */
const AT_END_PT = 1;

/**
 * Whether a drag was an attempt to go past the last reel (C-V2), from scroll
 * offsets only. iOS reports the bounce: the drag ends more than 48 pt past
 * the last page. Android clamps the offset at the end (and the native
 * ScrollView owns the touch, so JS touch events are unreliable): a drag that
 * both began and ended resting on the last page, within 1 pt, is the attempt.
 */
export function isCaughtUpAttempt(i: CaughtUpInput): boolean {
  if (i.lastIndex < 0 || i.active !== i.lastIndex) return false;
  const lastOffset = i.lastIndex * i.pageHeight;
  if (i.platform === "android") {
    return Math.abs(i.beginOffsetY - lastOffset) <= AT_END_PT && Math.abs(i.endOffsetY - lastOffset) <= AT_END_PT;
  }
  return i.endOffsetY - lastOffset > CAUGHT_UP_OVERSCROLL_PT;
}
