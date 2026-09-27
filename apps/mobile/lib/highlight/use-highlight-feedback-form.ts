import * as React from "react";
import type { HighlightFeedbackChip } from "@jits/shared/api/highlights";
import {
  HIGHLIGHT_FEEDBACK_CHIPS,
  HIGHLIGHT_FREE_TEXT_MAX,
} from "@jits/shared/constants/highlights";
import type {
  FeedbackPayload,
  FeedbackSubmitKind,
  HighlightRating,
} from "./use-highlight-rating";

export interface UseHighlightFeedbackFormResult {
  rating: HighlightRating | null;
  /** Tapping the selected thumb again clears it. */
  toggleRating: (value: HighlightRating) => void;
  chips: HighlightFeedbackChip[];
  toggleChip: (code: HighlightFeedbackChip) => void;
  text: string;
  setText: (value: string) => void;
  busy: FeedbackSubmitKind | null;
  error: string | null;
  /**
   * Something new would be stored: a chip, text, or a rating that differs from
   * the one the card already stored. Gates "Just send feedback" so a
   * rating-only duplicate row is never written.
   */
  hasFeedback: boolean;
  regenerate: () => void;
  send: () => void;
}

interface Options {
  preset: HighlightRating | null;
  /** The rating the card already stored this visit (null when none). */
  storedRating: HighlightRating | null;
  busy: FeedbackSubmitKind | null;
  error: string | null;
  onSubmit: (kind: FeedbackSubmitKind, payload: FeedbackPayload) => void;
}

/** Chip codes in canonical (render) order, so payloads are deterministic. */
function ordered(selected: HighlightFeedbackChip[]): HighlightFeedbackChip[] {
  return HIGHLIGHT_FEEDBACK_CHIPS.map((c) => c.code).filter((code) => selected.includes(code));
}

/**
 * The "Improve your reel" sheet's field state. The network call and its
 * outcome live in `useHighlightRating` (they must survive the sheet closing);
 * this hook only builds the payload: rating, ordered chip codes, trimmed text
 * capped at 280 (the edge function rejects longer text rather than truncating).
 */
export function useHighlightFeedbackForm({
  preset,
  storedRating,
  busy,
  error,
  onSubmit,
}: Options): UseHighlightFeedbackFormResult {
  const [rating, setRating] = React.useState<HighlightRating | null>(preset);
  const [chips, setChips] = React.useState<HighlightFeedbackChip[]>([]);
  const [text, setTextState] = React.useState("");

  const toggleRating = React.useCallback((value: HighlightRating) => {
    setRating((prev) => (prev === value ? null : value));
  }, []);

  const toggleChip = React.useCallback((code: HighlightFeedbackChip) => {
    setChips((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  const setText = React.useCallback((value: string) => {
    setTextState(value.slice(0, HIGHLIGHT_FREE_TEXT_MAX));
  }, []);

  const trimmed = text.trim();
  const hasFeedback =
    chips.length > 0 || trimmed.length > 0 || (rating !== null && rating !== storedRating);

  const payload = React.useCallback(
    (): FeedbackPayload => ({ rating, chips: ordered(chips), freeText: trimmed ? trimmed : null }),
    [rating, chips, trimmed],
  );

  const regenerate = React.useCallback(() => {
    if (!busy) onSubmit("regenerated", payload());
  }, [busy, onSubmit, payload]);
  const send = React.useCallback(() => {
    if (!busy && hasFeedback) onSubmit("sent", payload());
  }, [busy, hasFeedback, onSubmit, payload]);

  return { rating, toggleRating, chips, toggleChip, text, setText, busy, error, hasFeedback, regenerate, send };
}
