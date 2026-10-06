import * as React from "react";
import type { HighlightShareSourceTag, HighlightShareStep } from "@jits/shared/api/highlight-share";
import { track } from "@/lib/highlight-share";
import type { ReelPoolController } from "@/lib/highlight/reel-player-pool";

/** B4 step (jr_be-62n, allowlisted by jr_be 20261008200200; in HIGHLIGHT_SHARE_STEPS). */
export const VIEWER_SWIPED: HighlightShareStep = "viewer_swiped";

interface Pending {
  highlightId: string;
  index: number;
  direction: "next" | "previous";
  at: number;
  prefetched: boolean;
}

/**
 * `viewer_swiped` (spec 8.7, B4) once per landing: `source`, `direction`,
 * `index`, `prefetched` (the page's player already held its item when the
 * swipe settled) and `first_frame_ms` (settle to the first frame on screen;
 * null when the athlete left first). Logged when the first frame shows, or
 * with null on the next landing / unmount. A rejected step is dropped by the
 * funnel wrapper, never surfaced.
 */
export function useSwipeTelemetry(pool: ReelPoolController, source: HighlightShareSourceTag) {
  const pending = React.useRef<Pending | null>(null);

  const flush = React.useCallback(
    (firstFrameMs: number | null) => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      track(p.highlightId, VIEWER_SWIPED, {
        source,
        direction: p.direction,
        index: p.index,
        prefetched: p.prefetched,
        first_frame_ms: firstFrameMs,
      });
    },
    [source],
  );

  const check = React.useCallback(() => {
    const p = pending.current;
    if (p && !pool.snapshot(p.index).covered && pool.slotOf(p.index) !== null) flush(Date.now() - p.at);
  }, [pool, flush]);

  React.useEffect(() => {
    const unsubscribe = pool.subscribe(check);
    return () => {
      unsubscribe();
      flush(null);
    };
  }, [pool, check, flush]);

  const landed = React.useCallback(
    (l: { highlightId: string; index: number; direction: "next" | "previous" }) => {
      flush(null);
      pending.current = { ...l, at: Date.now(), prefetched: pool.isLoaded(l.index) };
    },
    [pool, flush],
  );
  return { landed };
}
