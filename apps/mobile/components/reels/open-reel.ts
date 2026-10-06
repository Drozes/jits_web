import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import type { ReelCursor } from "@/lib/highlight/reel-lane";
import { highlightHref } from "@/lib/highlight/discovery";
import { openReelViewer } from "@/lib/highlight/reel-viewer-session";
import { fetchReelPage } from "@/lib/highlight/use-reel-lane";

export interface OpenReelRequest {
  /** The lane's ready items, in tile order (the pager's pages). */
  items: ReelItem[];
  /** Index of the tapped reel in `items`. */
  startIndex: number;
  lane: ReelLaneKey;
  /** The lane's next page for the pager (see `laneLoadMore`); omitted when the lane has no more. */
  loadMore?: () => Promise<ReelItem[]>;
}

/** What the lane already holds past the tiles, and where its next page starts. */
export interface LanePageSource {
  /** Every ready item the lane hook has loaded (may run past the tiles, e.g. Home's first 10). */
  loaded: readonly ReelItem[];
  /** The lane's B1 cursor after `loaded`; null on the last page. */
  cursor: ReelCursor | null;
  /** The signed-in athlete (the read's owner and each item's subject). */
  viewerId: string | null;
}

/**
 * The pager's `loadMore` for a lane: first the reels the lane already loaded
 * but did not show as tiles, then further pages from the lane's cursor
 * (`fetchReelPage`, posters batch-signed), each call returning only reels
 * the pager has not had. Resolves `[]` once the lane is exhausted, and
 * REJECTS on a failed read so the pager can retry later. Undefined when
 * there is nothing more at all.
 */
export function laneLoadMore(shown: readonly ReelItem[], source: LanePageSource): (() => Promise<ReelItem[]>) | undefined {
  const had = new Set(shown.map((i) => i.highlightId));
  let leftover = source.loaded.filter((i) => !had.has(i.highlightId));
  let cursor = source.cursor;
  if (leftover.length === 0 && !cursor) return undefined;
  return async () => {
    if (leftover.length > 0) {
      const out = leftover;
      leftover = [];
      out.forEach((i) => had.add(i.highlightId));
      return out;
    }
    // Skip pages that bring nothing new (an empty page would read as exhausted too early).
    while (cursor) {
      const page = await fetchReelPage(cursor, undefined, source.viewerId);
      if (!page) throw new Error("Couldn't load more highlights.");
      cursor = page.cursor;
      const fresh = page.items.filter((i) => !had.has(i.highlightId));
      if (fresh.length > 0) {
        fresh.forEach((i) => had.add(i.highlightId));
        return fresh;
      }
    }
    return [];
  };
}

/**
 * THE ONE SEAM between the reel carousels and the viewer: opens the
 * full-screen swipe viewer (`openReelViewer`, spec 8) on the lane's ready
 * items at the tapped reel, with the lane's `loadMore`. Falls back to the
 * single-reel route only when the viewer declines (returns null). Returns
 * false when there is nothing to open.
 */
export function openReelFromLane(router: { push: (href: never) => void }, req: OpenReelRequest): boolean {
  const item = req.items[req.startIndex];
  if (!item) return false;
  const token = openReelViewer({ items: req.items, startIndex: req.startIndex, lane: req.lane, loadMore: req.loadMore });
  if (token === null) router.push(highlightHref(item.highlightId, req.lane) as never);
  return true;
}
