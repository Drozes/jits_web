import * as React from "react";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";

interface LiveAutoEndParams {
  /** This phone may auto-end at 00:00 (`useLiveControls().canAutoEnd`). */
  canAutoEnd: boolean;
  /** The live step's pause-aware timer. */
  timer: { remaining: number; running: boolean; paused: boolean };
  /** A live control in flight (`useLiveControls().busy`): defers the auto-end. */
  busy: string | null;
  /** The live step's one-shot end guard. */
  endedRef: React.MutableRefObject<boolean>;
  /** The live step's end (`useLiveControls().handleEnd`). */
  handleEnd: () => void;
  /** Server ends that failed so far (`useLiveControls().endFailures`): each re-arms the auto-end. */
  endFailures: number;
}

/**
 * The live step's auto-end on time expiry, mirroring web (moved out of
 * `LiveStep` unchanged, slice M4). `handleEnd` is a new function on every
 * render (its `sync` and `onEnded` are), and the timer keeps re-rendering
 * every second at 00:00, so it is read through a ref: with it in the deps,
 * the first tick inside AUTO_END_DELAY_MS cancelled the armed timeout and
 * the match sat LIVE at 00:00 forever (jits-2y8i). The effect keys only on
 * whether an auto-end is due, so it arms once and is cancelled only by
 * unmount or by the match stopping being due: a pause at 00:00 holds it (an
 * athlete stopped the clock on purpose) and resuming re-arms it; an
 * in-flight pause/resume (`busy`) defers it rather than letting `handleEnd`
 * drop it. `endedRef` makes the end one-shot, whether this device ended it
 * or the opponent's `match_ended` arrived first. The practice match
 * (components/practice/practice-live.tsx) mirrors this auto-end.
 *
 * Timekeeper mode: an athlete's phone never auto-ends (the timekeeper's
 * phone or the server does), and a server end that keeps failing stops being
 * retried (`canAutoEnd`, `MAX_AUTO_END_ATTEMPTS`).
 */
export function useLiveAutoEnd({ canAutoEnd, timer, busy, endedRef, handleEnd, endFailures }: LiveAutoEndParams): void {
  const handleEndRef = React.useRef(handleEnd);
  handleEndRef.current = handleEnd;
  const autoEndDue =
    canAutoEnd &&
    timer.remaining === 0 &&
    timer.running &&
    !timer.paused &&
    busy === null &&
    !endedRef.current;
  // `endFailures` re-arms it after a failed server end, even when the
  // attempt settled inside one render (always 0 in a two-athlete match).
  React.useEffect(() => {
    if (!autoEndDue) return;
    const t = setTimeout(() => {
      if (!endedRef.current) handleEndRef.current();
    }, AUTO_END_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoEndDue, endFailures, endedRef]);
}
