import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import {
  regenerateHighlight,
  submitHighlightFeedback,
  type HighlightFeedbackChip,
} from "@jits/shared/api/highlights";
import {
  HIGHLIGHT_FEEDBACK_CHIPS,
  HIGHLIGHT_FREE_TEXT_MAX,
} from "@jits/shared/constants/highlights";
import { highlightErrorCopy } from "./highlight-copy";
import type { HighlightRating } from "./use-highlight-rating";

export type FeedbackSubmitKind = "regenerated" | "sent";

export interface UseHighlightFeedbackFormResult {
  rating: HighlightRating | null;
  setRating: (value: HighlightRating) => void;
  chips: HighlightFeedbackChip[];
  toggleChip: (code: HighlightFeedbackChip) => void;
  text: string;
  setText: (value: string) => void;
  busy: FeedbackSubmitKind | null;
  /** Inline error copy (never a raw server message). */
  error: string | null;
  /** Something is selected or typed: "Just send feedback" is enabled. */
  hasFeedback: boolean;
  regenerate: () => void;
  send: () => void;
}

interface Options {
  highlightId: string;
  preset: HighlightRating | null;
  /** Feedback was stored server-side (send, regenerate, or a regenerate the AI failed). */
  onStored: (rating: HighlightRating | null) => void;
  onDone: (kind: FeedbackSubmitKind) => void;
}

/** Chip codes in canonical (render) order, so payloads are deterministic. */
function ordered(selected: HighlightFeedbackChip[]): HighlightFeedbackChip[] {
  return HIGHLIGHT_FEEDBACK_CHIPS.map((c) => c.code).filter((code) => selected.includes(code));
}

/**
 * The "Improve your reel" sheet's form (jr_be spec 014 section 10).
 * `regenerate` goes through the edge function (can take ~30 s), `send` stores
 * feedback only. Both stay on the sheet with inline error copy on failure.
 * A regenerate the AI could not satisfy has still stored the feedback row
 * (outcome ai_failed), so it reports `onStored` to stop a duplicate -1 write
 * when the athlete then closes the sheet.
 */
export function useHighlightFeedbackForm({
  highlightId,
  preset,
  onStored,
  onDone,
}: Options): UseHighlightFeedbackFormResult {
  const [rating, setRatingState] = React.useState<HighlightRating | null>(preset);
  const [chips, setChips] = React.useState<HighlightFeedbackChip[]>([]);
  const [text, setTextState] = React.useState("");
  const [busy, setBusy] = React.useState<FeedbackSubmitKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toggleChip = React.useCallback((code: HighlightFeedbackChip) => {
    setChips((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  const setText = React.useCallback((value: string) => {
    setTextState(value.slice(0, HIGHLIGHT_FREE_TEXT_MAX));
  }, []);

  const setRating = React.useCallback((value: HighlightRating) => setRatingState(value), []);

  const trimmed = text.trim();
  const hasFeedback = rating !== null || chips.length > 0 || trimmed.length > 0;

  const submit = React.useCallback(
    async (kind: FeedbackSubmitKind) => {
      if (busy) return;
      setBusy(kind);
      setError(null);
      const params = {
        highlightId,
        rating,
        chips: ordered(chips),
        freeText: trimmed ? trimmed : null,
      };
      const result =
        kind === "regenerated"
          ? await regenerateHighlight(supabase, params)
          : await submitHighlightFeedback(supabase, params);
      if (!mountedRef.current) return;
      setBusy(null);
      if (result.ok) {
        onStored(rating);
        onDone(kind);
        return;
      }
      if (result.error.code === "HIGHLIGHT_REGEN_FAILED") onStored(rating);
      setError(highlightErrorCopy(result.error));
    },
    [busy, highlightId, rating, chips, trimmed, onStored, onDone],
  );

  const regenerate = React.useCallback(() => void submit("regenerated"), [submit]);
  const send = React.useCallback(() => {
    if (hasFeedback) void submit("sent");
  }, [hasFeedback, submit]);

  return { rating, setRating, chips, toggleChip, text, setText, busy, error, hasFeedback, regenerate, send };
}
