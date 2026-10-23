/**
 * The confirm step's words from the copy deck (timekeeper mode spec 2.3 item
 * 2, A25; COPY-DECK Current flow A4, Rounds 4, 6 and 7), taken from
 * `timekeeper-copy.ts` (the one module of timekeeper-mode strings, M-R4) and
 * shaped for the step.
 *
 *  - Both modes: the confirm step shows the winner, how it ended (TK-R6) and
 *    the match length (TK-R7) and no rating; its helper is TK-R8. The result
 *    plate's shipped words (A4) are `SHIPPED_COPY`'s; the timekeeper's done
 *    screen shows the same plate.
 *  - Timekeeper mode: the header names who recorded the result (TK-R5, or
 *    TK-R5b when an admin did) and, once the timekeeper has edited it, says
 *    so (TK-RC1) with TK-RC2 in place of the helper; a confirm that met a
 *    newer result says TK-RC4.
 *  - Timekeeper mode, PM29 (COPY-DECK Round 9): a press that failed for a
 *    reason the screen cannot show (a network error, an unknown refusal, no
 *    reply within `SEND_CEILING_MS`) adds `checkConnection` under its shipped
 *    title. The result step's `useRecordResult` and the dispute form's
 *    `useDisputeSubmit` read that line here too; the other shared hooks
 *    (the face-off's and the live step's) read it through `press-copy.ts`.
 *
 * Pure. The step itself keeps the two-athlete header it always had.
 *
 * An adapter over `timekeeper-copy.ts`, not a copy module of its own: every
 * string here is a deck id or a `SHIPPED_COPY` entry from that module.
 * Because the shared files above import this file and not
 * `timekeeper-copy.ts`, the import-based M-R4 surface rule does not see them
 * (importing it would make their two-athlete arms, which keep the shipped
 * DomainError message, a timekeeper-mode surface);
 * `shared-step-message-guard.test.ts` guards the confirm step, its hook,
 * `useRecordResult`, the dispute form and `useDisputeSubmit`.
 */
import { SHIPPED_COPY, TIMEKEEPER_COPY, type TimekeeperToast } from "./timekeeper-copy";
import { shortName } from "./short-name";

export const CONFIRM_COPY = {
  howItEnded: TIMEKEEPER_COPY["TK-R6"],
  matchLength: TIMEKEEPER_COPY["TK-R7"],
  helper: TIMEKEEPER_COPY["TK-R8"],
  /** The toast when a confirm met a result the timekeeper had since edited. */
  resultChanged: TIMEKEEPER_COPY["TK-RC4"] as TimekeeperToast,
  /** The toast title when a confirm failed, both modes (the two-athlete toast adds the error's message). */
  couldNotConfirm: SHIPPED_COPY.couldNotConfirm,
  /** PM29: the description under a timekeeper-mode press's failure title (the two-athlete toasts keep the error's message). */
  checkConnection: SHIPPED_COPY.checkConnection,
  /** The recorded-result plate (A4), both modes. */
  plate: {
    winner: SHIPPED_COPY.winner,
    result: SHIPPED_COPY.result,
    draw: SHIPPED_COPY.draw,
    won: SHIPPED_COPY.won,
    resultIn: SHIPPED_COPY.resultIn,
    drawValue: SHIPPED_COPY.drawValue,
    noValue: SHIPPED_COPY.noValue,
    noClock: SHIPPED_COPY.noClock,
  },
} as const;

export interface TimekeeperConfirmHeader {
  kicker: string;
  /** Replaces the helper (TK-R8) after an edit; null keeps it. */
  line: string | null;
}

/**
 * The confirm header in timekeeper mode: who recorded the result, from the
 * start (not once a confirmation shows, as in the two-athlete flow). A blank
 * name names nobody (the shipped `RESULT RECORDED`), never the opponent
 * (jits-o47s.27).
 */
export function timekeeperConfirmHeader({
  recorderName,
  recordedByAdmin,
  editCount,
}: {
  recorderName: string;
  recordedByAdmin: boolean;
  editCount: number;
}): TimekeeperConfirmHeader {
  if (recordedByAdmin) return { kicker: TIMEKEEPER_COPY["TK-R5b"], line: null };
  const name = recorderName.trim() ? shortName(recorderName) : null;
  if (editCount > 0) {
    return { kicker: name ? TIMEKEEPER_COPY["TK-RC1"](name) : SHIPPED_COPY.resultRecorded, line: TIMEKEEPER_COPY["TK-RC2"] };
  }
  return { kicker: name ? TIMEKEEPER_COPY["TK-R5"](name) : SHIPPED_COPY.resultRecorded, line: null };
}
