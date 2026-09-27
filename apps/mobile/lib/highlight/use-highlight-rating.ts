import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { submitHighlightFeedback } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "./highlight-copy";

export type HighlightRating = -1 | 1;

export interface FeedbackSheetSession {
  /** Distinct per opening, so the form's state starts fresh each time. */
  id: number;
  /** Rating the sheet opens with. */
  preset: HighlightRating | null;
  /** Opened by thumbs down: closing without a submit still stores the -1. */
  fromThumbsDown: boolean;
}

export interface UseHighlightRatingResult {
  /** The toggle shown selected on the card (this screen visit only). */
  rating: HighlightRating | null;
  /** The session the sheet shows; kept until it has finished closing. */
  sheet: FeedbackSheetSession | null;
  /** Whether the sheet should be presented. */
  sheetOpen: boolean;
  thumbsUp: () => void;
  thumbsDown: () => void;
  openImprove: () => void;
  /** The sheet stored feedback (send or regenerate): no extra write on close. */
  markSubmitted: (rating: HighlightRating | null) => void;
  /** The sheet finished closing (swipe, backdrop or after a submit). */
  onSheetClosed: () => void;
  /** Ask the sheet to close (after a successful submit). */
  closeSheet: () => void;
}

/**
 * Card-level feedback (jr_be spec 014 section 10, "Thumbs").
 *
 * Thumbs up writes `{rating: 1}` at once, optimistic, reverted with a toast
 * on error. Thumbs down writes nothing yet: it opens the sheet preset to -1,
 * and only if the athlete then closes the sheet without submitting is the -1
 * stored alone. `sessionRef` makes that close handling run once per sheet,
 * whichever path (gorhom onChange or a programmatic close) reports it.
 * A new reel version (`versionKey`) clears the toggle.
 */
export function useHighlightRating(
  highlightId: string | null,
  versionKey: string | number | null,
): UseHighlightRatingResult {
  const [rating, setRating] = React.useState<HighlightRating | null>(null);
  const [sheet, setSheet] = React.useState<FeedbackSheetSession | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sessionIdRef = React.useRef(0);
  const sessionRef = React.useRef<{ fromThumbsDown: boolean; submitted: boolean } | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    setRating(null);
  }, [versionKey]);

  const writeRating = React.useCallback(
    async (value: HighlightRating, previous: HighlightRating | null) => {
      if (!highlightId) return;
      setRating(value);
      const result = await submitHighlightFeedback(supabase, {
        highlightId,
        rating: value,
        chips: [],
        freeText: null,
      });
      if (!result.ok && mountedRef.current) {
        setRating(previous);
        toast.error(HIGHLIGHT_COPY.feedbackFailedToast);
      }
    },
    [highlightId],
  );

  const thumbsUp = React.useCallback(() => {
    if (rating === 1) return;
    void writeRating(1, rating);
  }, [rating, writeRating]);

  const open = React.useCallback((session: Omit<FeedbackSheetSession, "id">) => {
    sessionRef.current = { fromThumbsDown: session.fromThumbsDown, submitted: false };
    sessionIdRef.current += 1;
    setSheet({ ...session, id: sessionIdRef.current });
    setSheetOpen(true);
  }, []);

  const thumbsDown = React.useCallback(
    () => open({ preset: -1, fromThumbsDown: true }),
    [open],
  );
  const openImprove = React.useCallback(
    () => open({ preset: rating, fromThumbsDown: false }),
    [open, rating],
  );

  const markSubmitted = React.useCallback((value: HighlightRating | null) => {
    if (sessionRef.current) sessionRef.current.submitted = true;
    if (value !== null) setRating(value);
  }, []);

  const onSheetClosed = React.useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setSheetOpen(false);
    setSheet(null);
    if (session?.fromThumbsDown && !session.submitted) void writeRating(-1, rating);
  }, [rating, writeRating]);

  const closeSheet = React.useCallback(() => setSheetOpen(false), []);

  return { rating, sheet, sheetOpen, thumbsUp, thumbsDown, openImprove, markSubmitted, onSheetClosed, closeSheet };
}
