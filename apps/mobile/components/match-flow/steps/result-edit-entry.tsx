import * as React from "react";
import { Text } from "react-native";
import { Pencil } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { editMatchResult, type TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { useMatchSyncContext, useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { SHIPPED_COPY, TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { parseFinishTime } from "@/lib/match-flow/parse-finish-time";
import { useSendCeiling } from "@/lib/match-flow/send-timing";
import type { MatchAthleteView } from "@/lib/match-flow/match-roles";
import type { ResultFormInitial, ResultSubmission } from "@/lib/match-flow/use-result-form";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { FightButton } from "../fight/fight-ui";
import { ResultForm, type SubmissionLayout } from "./result-form";

/**
 * Where the timekeeper's result edit stands on the done screen (timekeeper
 * mode A8, A24, PM19; spec 11): `open` offers Edit result (TK-ED1); `closed`
 * says why it is closed (TK-ED5, TK-ED6, TK-ED8; a dispute whose athlete is
 * not known yet shows no line, the DISPUTED state says it, and so does a
 * close whose reason this phone has not read yet); `hidden` offers
 * nothing (this viewer may not edit, an admin recorded it, the match is not
 * a completed result, or the timekeeper-mode state has not been read yet).
 */
export type EditEntry = { kind: "open" } | { kind: "closed"; line: string | null } | { kind: "hidden" };

export interface EditEntryInput {
  /** `roles.caps.canEditResult`: only the timekeeper edits (A8, M-R3). */
  canEdit: boolean;
  /** `matches.status`. */
  status: string;
  /** `matches.result_recorded_by_admin`. */
  recordedByAdmin: boolean;
  /** `get_timekeeper_match_state.edit_open`; null until the state is read. */
  editOpen: boolean | null;
  /** When the window closes (`edit_closes_at`, kept from the last read that had it). */
  closesAt: string | null;
  /** Both athletes have confirmed (the done screen's progress rows). */
  bothConfirmed: boolean;
  /** The athlete who disputed, when a `match_disputed` broadcast named them; the timekeeper cannot read disputes. */
  disputerName: string | null;
  now: number;
}

/**
 * The edit entry, mirroring `edit_match_result`'s refusals in their order
 * (jr_be 024 4.6): not the timekeeper (the viewer's capability), a dispute,
 * then not a completed result or an admin's record, then the 30-minute
 * window (the server's own `edit_closes_at`, closed the moment it passes,
 * before the next read says so), then both confirmations. The server stays
 * the authority (`edit_open`); this only closes the entry as soon as the
 * server would refuse.
 */
export function editEntryFor(i: EditEntryInput): EditEntry {
  if (!i.canEdit) return { kind: "hidden" };
  if (i.status === "disputed") {
    return { kind: "closed", line: i.disputerName ? TIMEKEEPER_COPY["TK-ED5"](i.disputerName) : null };
  }
  if (i.status !== "completed" || i.recordedByAdmin || i.editOpen == null) return { kind: "hidden" };
  const closesAt = i.closesAt != null ? Date.parse(i.closesAt) : NaN;
  if (Number.isFinite(closesAt) && i.now > closesAt) return { kind: "closed", line: TIMEKEEPER_COPY["TK-ED8"] };
  if (i.bothConfirmed) return { kind: "closed", line: TIMEKEEPER_COPY["TK-ED6"] };
  if (i.editOpen) return { kind: "open" };
  // The server closed it inside a window this phone knows is still running:
  // not the window, and the reason (both confirmations, a dispute) is not
  // read yet. No line until it is, rather than the wrong one.
  if (Number.isFinite(closesAt)) return { kind: "closed", line: null };
  // Closed with no other reason in sight: the window.
  return { kind: "closed", line: TIMEKEEPER_COPY["TK-ED8"] };
}

interface UseEditEntryParams {
  matchId: string;
  /** `roles.caps.canEditResult`. */
  canEdit: boolean;
  status: string;
  recordedByAdmin: boolean;
  tkState: TimekeeperMatchState | null;
  athletes: readonly [MatchAthleteView, MatchAthleteView];
  confirmedAthleteIds: string[];
}

/**
 * `editEntryFor` on the done screen: re-evaluated the moment the window
 * passes, with the last `edit_closes_at` the state had (it reads null once
 * closed), and the disputing athlete named by their `match_disputed`
 * broadcast, which also re-reads the match. A named M-R8 exception
 * (jits-o47s.33): no read gives the timekeeper the disputer, so the
 * broadcast only names who, one of the two athletes, and only once a read
 * says the match is disputed; it moves no state, and a missed one shows no
 * line (the DISPUTED tag says it).
 */
export function useEditEntry({ matchId, canEdit, status, recordedByAdmin, tkState, athletes, confirmedAthleteIds }: UseEditEntryParams): EditEntry {
  const { reconcileNow } = useMatchSyncContext();
  const [disputerId, setDisputerId] = React.useState<string | null>(null);
  useStepMatchSync({
    matchId,
    onMatchDisputed: (athleteId) => {
      setDisputerId(athleteId);
      reconcileNow();
    },
  });
  const [lastClosesAt, setLastClosesAt] = React.useState<string | null>(null);
  const liveClosesAt = tkState?.editClosesAt ?? null;
  React.useEffect(() => {
    if (liveClosesAt) setLastClosesAt(liveClosesAt);
  }, [liveClosesAt]);
  const closesAt = liveClosesAt ?? lastClosesAt;
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const ms = closesAt != null ? Date.parse(closesAt) - Date.now() : NaN;
    if (!Number.isFinite(ms) || ms < 0) return;
    const t = setTimeout(tick, ms + 50);
    return () => clearTimeout(t);
  }, [closesAt]);
  const disputer = athletes.find((a) => a.athleteId === disputerId) ?? null;
  return editEntryFor({
    canEdit,
    status,
    recordedByAdmin,
    editOpen: tkState ? tkState.editOpen : null,
    closesAt,
    bothConfirmed: athletes.every((a) => confirmedAthleteIds.includes(a.athleteId)),
    disputerName: disputer?.shortName ?? null,
    now: Date.now(),
  });
}

/**
 * Edit result while the window is open; else why it closed (or nothing).
 * `waiting`: a saved edit's read has not landed yet, so the match in hand
 * still holds the result before it; the button waits for it rather than
 * open the form on that result at its old count (which the server would
 * refuse, RESULT_CHANGED).
 */
export function ResultEditEntry({ entry, onEdit, waiting = false }: { entry: EditEntry; onEdit: () => void; waiting?: boolean }) {
  const p = usePalette();
  if (entry.kind === "open") {
    return (
      <FightButton
        testID="result-edit-open"
        variant="secondary"
        label={TIMEKEEPER_COPY["TK-ED1"]}
        onPress={onEdit}
        disabled={waiting}
        icon={(c) => <Pencil size={16} color={c} />}
      />
    );
  }
  if (entry.kind === "closed" && entry.line) {
    return (
      <Text testID="result-edit-closed" className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
        {entry.line}
      </Text>
    );
  }
  return null;
}

/**
 * Refusals that close the form: the edit can no longer succeed as it
 * stands (the window, a dispute, both confirmations, an admin's record, a
 * newer result, or the match is no longer a completed result).
 */
const CLOSES_FORM: ReadonlySet<DomainErrorCode> = new Set<DomainErrorCode>([
  "EDIT_WINDOW_CLOSED",
  "EDIT_CLOSED_DISPUTED",
  "EDIT_CLOSED_CONFIRMED",
  "EDIT_CLOSED_ADMIN",
  "RESULT_CHANGED",
  "MATCH_NOT_PENDING",
  "NOT_TIMEKEEPER",
  "NOT_TIMEKEEPER_MODE",
]);

/** The recorded result the edit form opens on, from the match in hand; null when it is not a result. */
export function recordedResultOf(
  match: Pick<MatchDetails, "result">,
  athletes: readonly [MatchAthleteView, MatchAthleteView],
): ResultFormInitial | null {
  // The recorded result's fields `get_match_details` returns but `MatchDetails` does not declare (as `readMatchExtras`).
  const m = match as unknown as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (match.result === "draw") return { outcome: "draw", winnerId: "", submissionCode: "", finishTimeSeconds: null };
  if (match.result !== "submission") return null;
  const winnerId = athletes.find((a) => a.outcome === "win")?.athleteId ?? str(m.winner_id);
  if (!winnerId) return null;
  return {
    outcome: "submission",
    winnerId,
    submissionCode: str(m.submission_type_code) ?? "",
    finishTimeSeconds: num(m.finish_time_seconds),
  };
}

export interface ResultEditFormProps {
  matchId: string;
  /** Challenger first. */
  athletes: readonly [MatchAthleteView, MatchAthleteView];
  clock: { durationSeconds: number; finalElapsedS: number | null };
  submissionTypes: SubmissionType[];
  submissionLayout?: SubmissionLayout;
  /**
   * The result on record and its `result_edit_count` (the edit must carry
   * it). Read once, when the form opens: a later value is ignored.
   */
  recorded: { initial: ResultFormInitial | null; editCount: number };
  /** Saved: the result's new `result_edit_count` (before `onClose`). */
  onSaved?: (resultEditCount: number) => void;
  /** Back to the done screen. */
  onClose: () => void;
}

/**
 * The timekeeper's edit (A8, A24): the result form prefilled with the result
 * on record (TK-ED2 under it, Save changes, TK-ED3), saved with
 * `edit_match_result` at the edit count it opened on. Save changes stays off
 * until the result differs from the one on record: the server would take an
 * unchanged save as an edit (a new count, both confirmations deleted, TK-N9
 * and TK-RC1 sending both athletes back to confirm) with nothing changed.
 * Saved: TK-ED4 and back to the done screen; the athletes are back on
 * confirm. Refused: TK-ED7, and back when the edit can no longer succeed;
 * a failure that leaves the form open (a network error, an unknown refusal)
 * adds `Check your connection and try again.` (PM29). The save is bounded
 * (`SEND_CEILING_MS`, PM29): Back is disabled while it is out, so a dead
 * socket would strand the timekeeper on the form; at the ceiling it ends as
 * that failure, with Back and Save back and the form still open (a reply
 * after that, or after the form closed, is dropped; the done screen's reads
 * show a late landing). Back (the shipped dispute form's, deck Current flow
 * A4) leaves without saving.
 *
 * The count is the one the form opened on, never a newer one read while it
 * is open: the form still shows the values it opened with, and saving them
 * at a newer count would overwrite that newer result unseen. The server's
 * `result_changed` refusal (R17) is what catches it.
 */
export function ResultEditForm({ matchId, athletes, clock, submissionTypes, submissionLayout, recorded, onSaved, onClose }: ResultEditFormProps) {
  const { reconcileNow } = useMatchSyncContext();
  const [openedOn] = React.useState(recorded);
  const [busy, setBusy] = React.useState(false);
  const ceiling = useSendCeiling();
  const pair = { a: athletes[0].shortName, b: athletes[1].shortName };

  async function save(v: ResultSubmission) {
    if (busy) return;
    setBusy(true);
    const submission = v.outcome === "submission";
    const res = await ceiling.within(
      editMatchResult(supabase, {
        matchId,
        result: v.outcome,
        winnerId: submission ? v.winnerId : null,
        submissionTypeCode: submission ? v.submissionCode : null,
        finishTimeSeconds: submission ? parseFinishTime(v.finishTimeStr) : null,
        expectedEditCount: openedOn.editCount,
      }),
    );
    setBusy(false);
    reconcileNow();
    if (res.ok) {
      const done = TIMEKEEPER_COPY["TK-ED4"](pair);
      toast.success({ text1: done.title, description: done.description });
      onSaved?.(res.data.resultEditCount);
      onClose();
      return;
    }
    // A refusal that closes the form: the done screen says why (TK-ED5, TK-ED6, TK-ED8).
    if (CLOSES_FORM.has(res.error.code)) {
      toast.error({ text1: TIMEKEEPER_COPY["TK-ED7"] });
      onClose();
      return;
    }
    toast.error({ text1: TIMEKEEPER_COPY["TK-ED7"], description: SHIPPED_COPY.checkConnection });
  }

  return (
    <>
      <ResultForm
        athletes={athletes}
        durationSeconds={clock.durationSeconds}
        finalElapsedS={clock.finalElapsedS}
        submissionTypes={submissionTypes}
        submissionLayout={submissionLayout}
        initial={openedOn.initial}
        requireChange
        busy={busy}
        onSubmit={(v) => void save(v)}
        kicker={TIMEKEEPER_COPY["TK-ED2"](pair)}
        copy={{ title: TIMEKEEPER_COPY["TK-ED1"], submit: TIMEKEEPER_COPY["TK-ED3"] }}
      />
      <FightButton testID="result-edit-back" variant="ghost" label={SHIPPED_COPY.back} onPress={onClose} disabled={busy} />
    </>
  );
}
