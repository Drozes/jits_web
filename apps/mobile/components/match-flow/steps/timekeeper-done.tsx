import { View } from "react-native";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { MatchExtras } from "@/lib/match-flow/match-extras";

export interface TimekeeperDoneProps {
  matchId: string;
  /** Where `Done` (TK-R4, its label) exits to: Home (spec 4.2 Final), through `exitMatchTo`. */
  exitHref: string;
  durationSeconds: number;
  /** For the edit form (TK-ED2). */
  submissionTypes: SubmissionType[];
  /**
   * The athletes the DB has a positive confirmation for (the progress rows),
   * re-read on the done screen's 4 s poll. They come from `get_match_details`
   * (the reconciler's `readSnapshot`): the `match_confirmations` RLS admits
   * participants only, and the timekeeper is never one.
   */
  confirmedAthleteIds: string[];
  /** The recorded result as this phone knows it. */
  resultData: BroadcastResult | null;
  /** The recorded result read from the match (winner, finish, lock time). */
  extras: MatchExtras;
}

/**
 * The timekeeper's done screen, its `summary` step (timekeeper mode spec 4.2
 * Confirm and Result edit; TK-R2 to TK-R4, TK-ED1 to TK-ED8, TK-D10): the
 * athletes' confirm progress, the upload line, `Edit result` while the
 * 30-minute window is open (`tkState.editOpen`), `Done`.
 *
 * Stub with its final name and props (timekeeper mode PLAN 3.2, slice M1):
 * the screen is slice M5 (jits-o47s.7). A two-athlete match never renders it.
 */
export function TimekeeperDone(_props: TimekeeperDoneProps) {
  return <View testID="timekeeper-done" />;
}
