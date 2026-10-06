import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";
import type { ReelItem } from "@/lib/highlight/reel-types";

/**
 * What a viewer page needs from its host: the single-reel viewer (one page,
 * always visible, always the athlete's own reel) or the swipe pager.
 */
export interface ReelBinding {
  pool: ReelPoolController;
  /** The page's index in the lane (0 in the single-reel viewer). */
  index: number;
  /** The visible page: only it plays, marks seen and logs `viewer_opened`. */
  active: boolean;
  /**
   * `canManageReel(item)`: false hides Share to Instagram, Save to Photos and
   * Improve this reel (owner decision 2026-10-06, not-yours rule).
   */
  canManage: boolean;
  /** The page was reached by a swipe (`viewer_opened` detail `swiped: true`). */
  swiped: boolean;
  /** Pager only: reuse the prefetched signature for the first sign. */
  prefetched: boolean;
  /** Pager only: true the first time a reel is opened in this pager session. */
  firstOpen?: (highlightId: string) => boolean;
  /** Pager only: a sheet opened or closed on this page (paging is suspended while open). */
  onModalChange?: (open: boolean) => void;
  /** Pager only: C-V1 shows on this page. */
  showHint?: boolean;
  /** Pager only: C-V2 "You're all caught up" shows on this (last) page. */
  caughtUp?: boolean;
  /** Pager only: the lane item (ownership, title rule, Open match / View profile). */
  item?: ReelItem | null;
  /** The lane's signed cover, shown while the page loads (pager only). */
  poster?: { url: string | null; path: string | null } | null;
}
