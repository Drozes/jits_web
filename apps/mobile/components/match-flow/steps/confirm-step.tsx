import * as React from "react";
import { Text, View } from "react-native";
import { Check, Flag } from "lucide-react-native";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { LEAVE_COUNTS_AS_CONFIRMING, disputeLockNote, isDisputeWindowClosed } from "@/lib/match-flow/match-extras";
import { useDisputeLocksAt } from "@/lib/match-flow/use-dispute-locks-at";
import { useConfirmResult } from "@/lib/match-flow/use-confirm-result";
import { useMatchSyncContext } from "@/lib/match-flow/match-sync-context";
import type { TimekeeperResult } from "@/lib/match-flow/result-confirm-inputs";
import { CONFIRM_COPY, timekeeperConfirmHeader } from "@/lib/match-flow/confirm-copy";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { FightButton, InitialsBlock, Mono, shortName } from "../fight/fight-ui";
import { DisputeForm } from "./dispute-form";
import { TapMarks } from "../verdict/rating-moment";
import type { MatchAthleteView } from "@/lib/match-flow/match-roles";

export type ConfirmAthlete = Pick<MatchAthleteView, "athleteId" | "displayName">;

interface ConfirmStepProps {
  matchId: string;
  me: ConfirmAthlete;
  opponent: ConfirmAthlete;
  /** This phone's copy of the result (the broadcast, or one rebuilt from the DB). */
  resultData: BroadcastResult | null;
  /** Athletes the DB has a confirmation for (from the wizard's reconciler). */
  confirmedAthleteIds: string[];
  /** Display name of the finish (B4 `submission_name`, else the catalogue). */
  submissionName: string | null;
  finishTimeSeconds: number | null;
  /** B3: completed_at + 24 h; null on an older backend. */
  disputeLocksAt: string | null;
  /** Lock-time fallback: completed_at + match_result_lock_seconds(). */
  completedAt?: string | null;
  /**
   * Who recorded the result, named in the kicker from the start (timekeeper
   * mode ARCHITECTURE 2.3; a blank name names nobody, never the opponent,
   * jits-o47s.27). Omitted: today's two-athlete reading, where the recorder
   * can only be the opponent and is named once their confirmation shows
   * (the server confirms the recorder's side with the result, B2).
   */
  recorderName?: string;
  /**
   * Timekeeper mode only (`confirmStepInputs`): the edit count confirmed at,
   * the admin flag and the result as the match has it now. Omitted: the
   * two-athlete confirm.
   */
  timekeeperResult?: TimekeeperResult;
  /**
   * The clock when the match ended (timekeeper mode `final_elapsed_s`, else
   * this phone's reading at the end): a draw's match length, and a
   * submission's when it has no finish time.
   */
  matchLengthSeconds?: number | null;
  onCompleted: () => void;
}

/** After this athlete confirms, how long the CONFIRMED row shows before the
 * step moves on to the verdict. */
export const ADVANCE_AFTER_CONFIRM_MS = 1_500;

/** "YOU WON" / "YOU LOST" / "DRAW" / "MATCH COMPLETE" (the harness reads it). */
export function confirmVerdict(resultData: BroadcastResult | null, meId: string): string {
  if (resultData?.result === "draw") return "DRAW";
  if (resultData?.result === "submission") return resultData.winnerId === meId ? "YOU WON" : "YOU LOST";
  return "MATCH COMPLETE";
}

/**
 * The confirm step, the opponent's side: confirm the recorded result with
 * one tap or dispute it. The recorder never lands here on a current backend:
 * the server confirms their side with the result (B2) and they go straight
 * to the verdict. A dispute is only possible for 24 h after the match (B3).
 *
 * It shows who won, how it ended and the match length, and no rating, in
 * both modes (timekeeper mode A25): the rating shows on the verdict, after
 * the confirm.
 *
 * Leaving counts as confirming (jits-02vo.7): the backend confirms an
 * undisputed result once its lock window passes (jr_be-ahn.5), so there is
 * no "continue without waiting" exit. Once this athlete has confirmed, the
 * step moves on to the verdict, which itself waits on (and polls for) an
 * opponent who has not confirmed yet.
 *
 * The confirm itself, the broadcasts and the move to the verdict live in
 * `useConfirmResult` (with timekeeper mode's edit count, stale-confirm
 * handling and TK-RC3); timekeeper mode shows the result as the match in
 * hand has it now, which an edit changes (A8). Timekeeper mode's press is
 * honest (PM29): Confirm is busy and Dispute disabled while the confirm is
 * out, the you row keeps WAITING ON YOU until the server has it, and after
 * a RESULT_CHANGED refusal both wait (disabled) until the newer result is on
 * screen. Flag OFF passes `busy={false}` and `disabled={false}`, which the
 * kit renders exactly as before.
 */
export function ConfirmStep(props: ConfirmStepProps) {
  const p = usePalette();
  const { matchId, me, opponent, confirmedAthleteIds, submissionName, finishTimeSeconds, disputeLocksAt: rawLocksAt, completedAt = null, recorderName, timekeeperResult, matchLengthSeconds = null, onCompleted } = props;
  const disputeLocksAt = useDisputeLocksAt(rawLocksAt, completedAt);
  const [showDispute, setShowDispute] = React.useState(false);
  const [windowClosed, setWindowClosed] = React.useState(() => isDisputeWindowClosed(disputeLocksAt));
  const editCount = timekeeperResult?.editCount ?? 0;
  const { reconcileNow } = useMatchSyncContext();
  const { myConfirmed, opponentConfirmed, canAdvance, sending, waitingForNewResult, advance, confirm, disputed } = useConfirmResult({
    matchId,
    me,
    opponent,
    confirmedAthleteIds,
    timekeeper: timekeeperResult ? { editCount, recorderName: recorderName ?? "" } : null,
    onCompleted,
  });
  // The result as the match in hand has it now (timekeeper mode), else this phone's copy.
  const resultData = timekeeperResult?.result ?? props.resultData;

  // Two-athlete: from the tap, as shipped. Timekeeper mode: once the server took the confirm.
  React.useEffect(() => {
    if (!canAdvance) return;
    const t = setTimeout(advance, ADVANCE_AFTER_CONFIRM_MS);
    return () => clearTimeout(t);
  }, [canAdvance, advance]);

  React.useEffect(() => {
    if (isDisputeWindowClosed(disputeLocksAt)) setWindowClosed(true);
  }, [disputeLocksAt]);

  if (showDispute) {
    return (
      <DisputeForm
        matchId={matchId}
        timekeeperMode={timekeeperResult ? { editCount, reread: reconcileNow } : undefined}
        onCancel={() => setShowDispute(false)}
        onSubmitted={() => void disputed()}
        onWindowClosed={() => {
          setWindowClosed(true);
          setShowDispute(false);
        }}
      />
    );
  }

  const isDraw = resultData?.result === "draw";
  const winner = resultData?.winnerId === me.athleteId ? me : resultData?.winnerId === opponent.athleteId ? opponent : null;
  const oppShort = shortName(opponent.displayName);
  const header =
    timekeeperResult != null || recorderName != null
      ? timekeeperConfirmHeader({
          recorderName: recorderName ?? "",
          recordedByAdmin: timekeeperResult?.recordedByAdmin === true,
          editCount,
        })
      : { kicker: opponentConfirmed ? `RESULT RECORDED BY ${oppShort.toUpperCase()}` : "RESULT RECORDED", line: null };
  const lockNote = windowClosed ? "The dispute window has closed." : disputeLockNote(disputeLocksAt);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Mono>{header.kicker}</Mono>
        <Text accessibilityRole="header" className="font-heading uppercase" style={[typeStep("headline-2xl"), { letterSpacing: TRACKING.loose, color: p.text }]}>
          Confirm result
        </Text>
        <Text testID="confirm-helper" className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
          {header.line ?? CONFIRM_COPY.helper}
        </Text>
      </View>

      <RecordedResultPlate
        result={{
          winnerName: winner?.displayName ?? null,
          isDraw,
          submissionName,
          // A submission's length is its finish time; a draw ran to the final clock.
          lengthSeconds: isDraw ? (matchLengthSeconds ?? finishTimeSeconds) : (finishTimeSeconds ?? matchLengthSeconds),
          // Beside the finish's name, as the shipped "by {finish}" line drew them.
          tap: resultData?.result === "submission" && winner != null && submissionName != null,
        }}
        tag={{ text: confirmVerdict(resultData, me.athleteId), testID: "confirm-verdict" }}
      />

      <View style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}>
        <StatusRow
          testID={`confirm-panel-opponent-${opponentConfirmed ? "confirmed" : "confirming"}`}
          name={oppShort}
          status={opponentConfirmed ? `${oppShort.toUpperCase()} CONFIRMED ✓` : "WAITING"}
          done={opponentConfirmed}
          divider
        />
        <StatusRow
          testID={`confirm-panel-you-${myConfirmed ? "confirmed" : "your-call"}`}
          name={`${shortName(me.displayName)} (you)`}
          status={myConfirmed ? "CONFIRMED ✓" : "WAITING ON YOU"}
          done={myConfirmed}
        />
      </View>

      {!myConfirmed ? (
        <View style={{ gap: 12 }}>
          <FightButton
            testID="confirm-result"
            label="Confirm result"
            sheen
            busy={sending}
            disabled={waitingForNewResult}
            onPress={() => void confirm()}
            icon={(c) => <Check size={16} color={c} />}
          />
          {windowClosed ? null : (
            <FightButton
              testID="confirm-dispute"
              variant="secondary"
              label="Dispute result"
              disabled={sending || waitingForNewResult}
              onPress={() => setShowDispute(true)}
              icon={(c) => <Flag size={16} color={c} />}
            />
          )}
          <View testID="confirm-lock-notes" style={{ gap: 6, alignItems: "center" }}>
            {windowClosed ? null : (
              <Text className="font-mono-bold" style={[typeStep("caption"), { textAlign: "center", letterSpacing: TRACKING.loose, color: p.text }, TABULAR]}>
                {LEAVE_COUNTS_AS_CONFIRMING}
              </Text>
            )}
            {lockNote ? (
              <Text className="font-mono" style={[typeStep("caption"), { textAlign: "center", letterSpacing: TRACKING.loose, color: p.text2 }, TABULAR]}>
                {lockNote}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A recorded result as the confirm step and the timekeeper's done screen show it. */
export interface RecordedResultView {
  /** The winner's display name; null for a draw or a result not read yet. */
  winnerName: string | null;
  isDraw: boolean;
  /** The finish's name (HOW IT ENDED); a draw reads DRAW. */
  submissionName: string | null;
  /** MATCH LENGTH in seconds; null when unknown. */
  lengthSeconds: number | null;
  /** Draw the tap marks, still and silent (the moment plays on the verdict). */
  tap: boolean;
}

/**
 * The recorded result: the winner (or the draw), how it ended (TK-R6) and
 * the match length (TK-R7). No rating (A25). `tag` is the line at the top
 * right: the viewer's verdict on the confirm step (the harness reads it),
 * the result's state on the done screen.
 */
export function RecordedResultPlate({
  result,
  tag,
}: {
  result: RecordedResultView;
  tag?: { text: string; testID: string; color?: string };
}) {
  const p = usePalette();
  const cell = { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 8 } as const;
  const w = CONFIRM_COPY.plate;
  return (
    <View style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}>
      <View style={{ paddingVertical: 20, paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {result.winnerName ? <InitialsBlock name={result.winnerName} size={40} fontSize="callout" /> : null}
          <View style={{ flex: 1 }}>
            <Mono color={p.text3}>{result.isDraw ? w.result : w.winner}</Mono>
          </View>
          {tag ? (
            <Text testID={tag.testID} className="font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING["caps-l"], color: tag.color ?? p.text2 }, TABULAR]}>
              {tag.text}
            </Text>
          ) : null}
        </View>
        <Text className="font-display" style={[typeStep("display-60"), { lineHeight: 56, color: p.text }]}>
          {result.isDraw ? w.draw : result.winnerName ? w.won(shortName(result.winnerName)) : w.resultIn}
        </Text>
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: p.hairline }}>
        <View style={cell}>
          <Mono color={p.text3}>{CONFIRM_COPY.howItEnded}</Mono>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text testID="result-how-it-ended" numberOfLines={2} className="font-heading uppercase" style={[typeStep("subhead"), { flexShrink: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
              {result.isDraw ? w.drawValue : (result.submissionName ?? w.noValue)}
            </Text>
            {result.tap ? <TapMarks play={false} /> : null}
          </View>
        </View>
        <View style={[cell, { borderLeftWidth: 1, borderColor: p.hairline }]}>
          <Mono color={p.text3}>{CONFIRM_COPY.matchLength}</Mono>
          <Text testID="result-match-length" className="font-mono-bold" style={[typeStep("title"), { color: p.text }, TABULAR]}>
            {result.lengthSeconds != null ? formatElapsed(result.lengthSeconds) : w.noClock}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** One athlete's line in a confirm-progress plate: the name and where they stand. */
export function StatusRow({ name, status, done, divider = false, testID }: { name: string; status: string; done: boolean; divider?: boolean; testID?: string }) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      style={{ height: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: divider ? 1 : 0, borderColor: p.hairline }}
    >
      <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("body"), { flex: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
        {name}
      </Text>
      <Mono bold size="caption" spacing="caps-l" color={done ? p.text : p.amber}>
        {status}
      </Mono>
    </View>
  );
}
