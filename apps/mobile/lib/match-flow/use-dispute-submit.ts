import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { disputeMatchResult } from "@jits/shared/api/mutations";
import { CONFIRM_COPY } from "./confirm-copy";
import { useSendCeiling } from "./send-timing";
import { matchHaptics } from "./use-haptics";

/** Timekeeper mode only (PM29; the confirm step passes it): the edit count of the result on screen, and a re-read of the match. */
export interface DisputeTimekeeperMode {
  editCount: number;
  reread: () => void;
}

interface UseDisputeSubmitParams {
  matchId: string;
  /** Omitted: the shipped submit, exactly. */
  timekeeperMode?: DisputeTimekeeperMode;
  onCancel: () => void;
  onSubmitted: () => void;
  /** The 24 h dispute window had already closed (hint dispute_window_closed). */
  onWindowClosed?: () => void;
}

/**
 * The dispute form's submit (`components/match-flow/steps/dispute-form.tsx`,
 * which keeps only the view and the typed reason): send the dispute, then
 * leave for the verdict, or say why it did not go through. The two-athlete
 * submit is the shipped one: unbounded, and its toasts keep the DomainError
 * message.
 *
 * Timekeeper mode (`timekeeperMode`, PM29 audit 5.1):
 *  - the submit is bounded (`SEND_CEILING_MS`): the confirm step has no exit;
 *  - a failure shows the shipped title with `Check your connection and try
 *    again.` and never a DomainError message (M-R4); a closed window shows
 *    its title alone, and the confirm step then says why;
 *  - a refusal that means the match moved on (ALREADY_DISPUTED: the opponent
 *    disputed first; MATCH_NOT_PENDING: it was voided) closes the form with
 *    no toast and re-reads, so the DISPUTED verdict follows;
 *  - an edit the timekeeper saves while the form is open says TK-RC4 once
 *    per edit (the form stays with the typed reason; Back shows the new
 *    result). One that lands while the dispute is out waits for the reply:
 *    a success leaves (the verdict shows the result), and a failure shows
 *    TK-RC4 alone, in place of the failure toast (one toast at a time): the
 *    athlete checks the new result before disputing again, since a dispute
 *    carries no edit count (R19) and closes the edit window (R17), and the
 *    form staying open with Submit back says it did not go through.
 */
export function useDisputeSubmit({ matchId, timekeeperMode, onCancel, onSubmitted, onWindowClosed }: UseDisputeSubmitParams) {
  const [submitting, setSubmitting] = React.useState(false);
  const ceiling = useSendCeiling();

  // Timekeeper mode: the result changed under the open form (once per edit).
  const editCount = timekeeperMode?.editCount ?? null;
  /** The count on screen now, read when the reply lands. */
  const countRef = React.useRef(editCount);
  countRef.current = editCount;
  /** The count TK-RC4 last spoke for (or the form opened on). */
  const seenCountRef = React.useRef(editCount);
  React.useEffect(() => {
    if (editCount == null || submitting) return;
    if (seenCountRef.current != null && editCount > seenCountRef.current) {
      toast.info({ text1: CONFIRM_COPY.resultChanged.title, description: CONFIRM_COPY.resultChanged.description });
    }
    seenCountRef.current = editCount;
  }, [editCount, submitting]);

  async function submit(reason: string) {
    if (submitting) return;
    setSubmitting(true);
    const call = disputeMatchResult(supabase, matchId, reason || undefined);
    // Timekeeper mode: bounded by the ceiling, and silent once the form has gone (PM29).
    const res = timekeeperMode ? await ceiling.within(call) : await call;
    if (!res.ok) {
      setSubmitting(false);
      const code = res.error.code;
      if (timekeeperMode && (code === "ALREADY_DISPUTED" || code === "MATCH_NOT_PENDING")) {
        // Moved on: the opponent disputed first, or the match was voided. The read moves the step.
        onCancel();
        timekeeperMode.reread();
        return;
      }
      if (code === "DISPUTE_WINDOW_CLOSED") {
        // No dispute is possible any more: this toast, not TK-RC4, has the last word.
        seenCountRef.current = countRef.current;
        void matchHaptics.error();
        toast.error(timekeeperMode ? { text1: "Dispute window closed" } : { text1: "Dispute window closed", description: res.error.message });
        onWindowClosed?.();
        return;
      }
      if (timekeeperMode && countRef.current != null && seenCountRef.current != null && countRef.current > seenCountRef.current) {
        // An edit landed while the dispute was out: TK-RC4 alone says it (the
        // effect, once nothing is in flight), so the athlete checks the new
        // result before disputing again.
        timekeeperMode.reread();
        return;
      }
      void matchHaptics.error();
      toast.error(timekeeperMode ? { text1: "Couldn't dispute", description: CONFIRM_COPY.checkConnection } : { text1: "Couldn't dispute", description: res.error.message });
      timekeeperMode?.reread();
      return;
    }
    onSubmitted();
  }

  return { submitting, submit };
}
