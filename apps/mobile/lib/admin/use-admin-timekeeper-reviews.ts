import * as React from "react";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { parseFinishTime } from "@/lib/match-flow/parse-finish-time";
import type { ResultSubmission } from "@/lib/match-flow/use-result-form";
import { getSubmissionTypes } from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import {
  adminListTimekeeperReviews,
  adminResolveTimekeeperReview,
  type AdminResolveTimekeeperReviewParams,
  type TimekeeperReview,
} from "@jits/shared/api/timekeeper";
import { TIMEKEEPER_REVIEWS_COPY as C } from "./timekeeper-reviews-copy";

/**
 * How a Record result or Void ended: `resolved` (the review is closed),
 * `gone` (the server says it was no longer open: a late record by the
 * timekeeper or another admin got there first), `failed` (anything else; the
 * review is still open and the form may be fixed and sent again).
 */
export type ResolveOutcome = "resolved" | "gone" | "failed";

/**
 * Refusals that mean the review is no longer there to resolve
 * (`admin_resolve_timekeeper_review`, jr_be 024 4.8): no open stall flag,
 * the match no longer `in_progress` (HINT `invalid_status`), or not a
 * timekeeper-mode match.
 */
const REVIEW_GONE: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  "NO_OPEN_REVIEW",
  "MATCH_NOT_PENDING",
  "NOT_TIMEKEEPER_MODE",
]);

/** A recorded result as the admin RPC takes it (a draw sends no winner, finish or time). */
export function recordParams(matchId: string, v: ResultSubmission): AdminResolveTimekeeperReviewParams {
  const submission = v.outcome === "submission";
  return {
    matchId,
    action: "record",
    result: v.outcome,
    winnerId: submission ? v.winnerId : null,
    submissionTypeCode: submission ? v.submissionCode : null,
    finishTimeSeconds: submission ? parseFinishTime(v.finishTimeStr) : null,
  };
}

export interface UseAdminTimekeeperReviewsResult {
  /** The open result-stall reviews, oldest first. */
  reviews: TimekeeperReview[];
  /** The active submission types, for the record form. */
  submissionTypes: SubmissionType[];
  isLoading: boolean;
  /** The list read failed (the screen offers Retry). */
  loadFailed: boolean;
  /** The server refused the caller as not an admin (the screen redirects). */
  notAdmin: boolean;
  /** The match a Record result or Void is in flight for. */
  busyMatchId: string | null;
  reload: () => void;
  record: (matchId: string, value: ResultSubmission) => Promise<ResolveOutcome>;
  voidMatch: (matchId: string) => Promise<ResolveOutcome>;
}

/**
 * Admin > Timekeeper reviews (A27, spec 9.2): the open result stalls
 * (`admin_list_timekeeper_reviews`) and the two ways to close one
 * (`admin_resolve_timekeeper_review`): record (rating applied, never
 * editable by the timekeeper, PM19) or void (a no contest, `admin_void`).
 * Each resolve toasts its TK-AD6 line and re-reads the list. One resolve at a
 * time. Nothing is read until `enabled` (the screen passes its admin check),
 * so a non-admin never calls the admin RPCs. A server error's own text is
 * never shown (M-R4): only the deck's lines.
 */
export function useAdminTimekeeperReviews(enabled: boolean): UseAdminTimekeeperReviewsResult {
  const [reviews, setReviews] = React.useState<TimekeeperReview[]>([]);
  const [submissionTypes, setSubmissionTypes] = React.useState<SubmissionType[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [notAdmin, setNotAdmin] = React.useState(false);
  const [busyMatchId, setBusyMatchId] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const busyRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    (async () => {
      try {
        const [list, types] = await Promise.all([adminListTimekeeperReviews(supabase), getSubmissionTypes(supabase)]);
        if (cancelled) return;
        if (list.ok) {
          setReviews(list.data);
        } else {
          setReviews([]);
          setNotAdmin(list.error.code === "NOT_ADMIN");
          setLoadFailed(true);
        }
        setSubmissionTypes(types);
      } catch {
        if (cancelled) return;
        setReviews([]);
        setLoadFailed(true);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const reload = React.useCallback(() => setTick((n) => n + 1), []);

  const resolve = React.useCallback(
    async (params: AdminResolveTimekeeperReviewParams): Promise<ResolveOutcome> => {
      if (busyRef.current) return "failed";
      busyRef.current = true;
      setBusyMatchId(params.matchId);
      // A thrown call (no response at all) is a plain failure.
      const res = await adminResolveTimekeeperReview(supabase, params).catch(() => null);
      busyRef.current = false;
      if (!mountedRef.current) return res?.ok ? "resolved" : "failed";
      setBusyMatchId(null);
      if (res?.ok) {
        toast.success(params.action === "record" ? C["TK-AD6"].recorded : C["TK-AD6"].voided);
        reload();
        return "resolved";
      }
      toast.error(C["TK-AD6"].failed);
      if (!res) return "failed";
      if (res.error.code === "NOT_ADMIN") {
        setNotAdmin(true);
        return "failed";
      }
      if (REVIEW_GONE.has(res.error.code)) {
        reload();
        return "gone";
      }
      return "failed";
    },
    [reload],
  );

  const record = React.useCallback(
    (matchId: string, value: ResultSubmission) => resolve(recordParams(matchId, value)),
    [resolve],
  );
  const voidMatch = React.useCallback((matchId: string) => resolve({ matchId, action: "void" }), [resolve]);

  return { reviews, submissionTypes, isLoading, loadFailed, notAdmin, busyMatchId, reload, record, voidMatch };
}
