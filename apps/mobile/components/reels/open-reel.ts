import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import { highlightHref } from "@/lib/highlight/discovery";

export interface OpenReelRequest {
  /** The lane's ready items, in tile order (the pager's pages). */
  items: ReelItem[];
  /** Index of the tapped reel in `items`. */
  startIndex: number;
  lane: ReelLaneKey;
}

/**
 * THE ONE SEAM between the reel carousels and the viewer.
 *
 * Today: opens the tapped reel in the existing single-reel viewer route
 * (`/highlight/<id>?source=home|matches`), so tiles work before the
 * full-screen swipe viewer lands. When it does, replace the body with
 * `openReelViewer({ items, startIndex, lane, loadMore })` from
 * `lib/highlight/reel-viewer-session.ts` (it returns the lane token, or null
 * when it falls back to single-reel mode) and push its route; no caller
 * changes. Returns false when there is nothing to open.
 */
export function openReelFromLane(router: { push: (href: never) => void }, req: OpenReelRequest): boolean {
  const item = req.items[req.startIndex];
  if (!item) return false;
  router.push(highlightHref(item.highlightId, req.lane) as never);
  return true;
}
