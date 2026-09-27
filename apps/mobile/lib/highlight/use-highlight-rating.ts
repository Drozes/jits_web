import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import {
  regenerateHighlight,
  submitHighlightFeedback,
  type HighlightFeedbackParams,
} from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY, highlightErrorCopy } from "./highlight-copy";

export type HighlightRating = -1 | 1;
export type FeedbackSubmitKind = "regenerated" | "sent";
export type FeedbackPayload = Omit<HighlightFeedbackParams, "highlightId">;

export interface FeedbackSheetSession {
  /** Distinct per opening, so the form's state starts fresh each time. */
  id: number;
  /** Rating the sheet opens with. */
  preset: HighlightRating | null;
  /** Opened by thumbs down: closing without a stored submit still stores the -1. */
  fromThumbsDown: boolean;
}

interface SessionState {
  fromThumbsDown: boolean;
  inFlight: boolean;
  stored: boolean;
}

export interface UseHighlightRatingResult {
  /** The toggle shown selected on the card (this screen visit only). */
  rating: HighlightRating | null;
  /** The session the sheet shows; kept until it has finished closing. */
  sheet: FeedbackSheetSession | null;
  sheetOpen: boolean;
  /** A sheet submit is running (the sheet cannot be swiped away meanwhile). */
  busy: FeedbackSubmitKind | null;
  /** Inline error copy for the open sheet. */
  sheetError: string | null;
  thumbsUp: () => void;
  thumbsDown: () => void;
  openImprove: () => void;
  submit: (kind: FeedbackSubmitKind, payload: FeedbackPayload) => void;
  /** The sheet finished closing (swipe, backdrop, or after a submit). */
  onSheetClosed: () => void;
}

/**
 * All of the card's feedback writes (jr_be spec 014 section 10).
 *
 * Thumbs up writes `{rating: 1}` at once, optimistic, reverted with a toast on
 * error. Thumbs down opens the sheet preset to -1 and writes nothing yet; if
 * the sheet then closes without a stored submit, the -1 is written alone.
 *
 * The sheet's submit (Regenerate / Just send) runs HERE, not in the sheet, so
 * its outcome survives the sheet closing: success toasts, refreshes and
 * closes; an error shows inline while that sheet is open, else as a toast.
 * A close while a submit is in flight never writes the -1 (the submit carries
 * the rating); a close after a submit that stored nothing still does. A
 * client timeout on Regenerate is not an error: the render may be armed, so
 * it closes, says "still working" and re-reads progress.
 */
export function useHighlightRating(
  highlightId: string | null,
  versionKey: string | number | null,
  onChanged: () => void,
): UseHighlightRatingResult {
  const [rating, setRating] = React.useState<HighlightRating | null>(null);
  const [sheet, setSheet] = React.useState<FeedbackSheetSession | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<FeedbackSubmitKind | null>(null);
  const [sheetError, setSheetError] = React.useState<string | null>(null);
  const sessionIdRef = React.useRef(0);
  const sessionRef = React.useRef<SessionState | null>(null);
  const busyRef = React.useRef(false);
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
    sessionRef.current = { fromThumbsDown: session.fromThumbsDown, inFlight: false, stored: false };
    sessionIdRef.current += 1;
    setSheet({ ...session, id: sessionIdRef.current });
    setSheetError(null);
    setSheetOpen(true);
  }, []);

  const thumbsDown = React.useCallback(() => open({ preset: -1, fromThumbsDown: true }), [open]);
  const openImprove = React.useCallback(
    () => open({ preset: rating, fromThumbsDown: false }),
    [open, rating],
  );

  const submit = React.useCallback(
    async (kind: FeedbackSubmitKind, payload: FeedbackPayload) => {
      if (!highlightId || busyRef.current) return;
      const session = sessionRef.current;
      busyRef.current = true;
      if (session) session.inFlight = true;
      setBusy(kind);
      setSheetError(null);
      const params = { highlightId, ...payload };
      const result =
        kind === "regenerated"
          ? await regenerateHighlight(supabase, params)
          : await submitHighlightFeedback(supabase, params);
      busyRef.current = false;
      if (session) session.inFlight = false;
      if (!mountedRef.current) return;
      setBusy(null);
      // A regenerate the AI could not satisfy still stored the feedback row.
      const stored = result.ok || result.error.code === "HIGHLIGHT_REGEN_FAILED";
      if (stored) {
        if (session) session.stored = true;
        if (payload.rating !== null) setRating(payload.rating);
      }
      const stillOpen = session !== null && sessionRef.current === session;
      if (!result.ok && result.error.code === "HIGHLIGHT_REGEN_TIMEOUT") {
        // Outcome unknown: the server may have stored the feedback and armed
        // the render. Close softly and re-read instead of an error.
        if (session) session.stored = true;
        toast.info(highlightErrorCopy(result.error));
        if (stillOpen) setSheetOpen(false);
        onChanged();
        return;
      }
      if (result.ok) {
        toast.success(kind === "regenerated" ? HIGHLIGHT_COPY.regenerateToast : HIGHLIGHT_COPY.feedbackSentToast);
        if (stillOpen) setSheetOpen(false);
        onChanged();
        return;
      }
      const copy = highlightErrorCopy(result.error);
      if (stillOpen) setSheetError(copy);
      else toast.error(copy);
    },
    [highlightId, onChanged],
  );

  const submitAndForget = React.useCallback(
    (kind: FeedbackSubmitKind, payload: FeedbackPayload) => void submit(kind, payload),
    [submit],
  );

  const onSheetClosed = React.useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setSheetOpen(false);
    setSheet(null);
    setSheetError(null);
    if (session?.fromThumbsDown && !session.stored && !session.inFlight) void writeRating(-1, rating);
  }, [rating, writeRating]);

  return {
    rating,
    sheet,
    sheetOpen,
    busy,
    sheetError,
    thumbsUp,
    thumbsDown,
    openImprove,
    submit: submitAndForget,
    onSheetClosed,
  };
}
