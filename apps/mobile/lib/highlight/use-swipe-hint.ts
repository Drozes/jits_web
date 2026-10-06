import * as React from "react";
import { markSwipeHintShown, swipeHintPending } from "./reel-prefs";

/** C-V1 leaves on its own after this long (spec 8). */
export const SWIPE_HINT_MS = 4_000;

/**
 * C-V1 "Swipe up for the next one" (spec 8, AC 4.6): only when the lane has 2
 * or more pages, once per install (marked shown the moment it appears), and
 * gone for good after the first swipe (`dismiss`) or `SWIPE_HINT_MS`.
 */
export function useSwipeHint(pageCount: number): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = React.useState(false);
  const done = React.useRef(false);
  const eligible = pageCount >= 2;

  const dismiss = React.useCallback(() => {
    done.current = true;
    setVisible(false);
  }, []);

  React.useEffect(() => {
    if (!eligible || done.current) return;
    let cancelled = false;
    void swipeHintPending().then((pending) => {
      if (cancelled || !pending || done.current) return;
      markSwipeHintShown();
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  React.useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, SWIPE_HINT_MS);
    return () => clearTimeout(t);
  }, [visible, dismiss]);

  return { visible, dismiss };
}
