import * as React from "react";
import { Text, View } from "react-native";
import { Check, Flag } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { confirmMatchResult } from "@jits/shared/api/mutations";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { settleWithin } from "@jits/shared/hooks/session-match-channel";
import { SEND_GRACE_MS, useMatchSyncContext, useStepMatchSync } from "@/lib/match-flow/match-sync-context";
import { mutationQueue, isQueuedResult } from "@/lib/network/mutation-queue";
import { matchHaptics } from "@/lib/match-flow/use-haptics";
import { haptics } from "@/lib/motion";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { LEAVE_COUNTS_AS_CONFIRMING, disputeLockNote, isDisputeWindowClosed } from "@/lib/match-flow/match-extras";
import { useDisputeLocksAt } from "@/lib/match-flow/use-dispute-locks-at";
import { usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { FightButton, InitialsBlock, Mono, RatingBlock, shortName } from "../fight/fight-ui";
import { DisputeForm } from "./dispute-form";
import { TapMarks } from "../verdict/rating-moment";
import { markResultFresh } from "@/components/ui/elo-system/play-once";

export interface ConfirmAthlete {
  athlete_id: string;
  display_name: string;
  elo_before?: number | null;
  elo_after?: number | null;
  elo_delta?: number | null;
}

interface ConfirmStepProps {
  matchId: string;
  me: ConfirmAthlete;
  opponent: ConfirmAthlete;
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
  onCompleted: () => void;
}

/** After this athlete confirms, how long the CONFIRMED row shows before the
 * step moves on to the verdict. */
const ADVANCE_AFTER_CONFIRM_MS = 1_500;

/** "YOU WON" / "YOU LOST" / "DRAW" / "MATCH COMPLETE" (the harness reads it). */
export function confirmVerdict(resultData: BroadcastResult | null, meId: string): string {
  if (resultData?.result === "draw") return "DRAW";
  if (resultData?.result === "submission") return resultData.winnerId === meId ? "YOU WON" : "YOU LOST";
  return "MATCH COMPLETE";
}

/**
 * Step 7, the opponent's side: confirm the recorded result with one tap or
 * dispute it. The recorder never lands here on a current backend: the server
 * confirms their side with the result (B2) and they go straight to the
 * verdict. A dispute is only possible for 24 h after the match (B3).
 *
 * Leaving counts as confirming (jits-02vo.7): the backend confirms an
 * undisputed result once its lock window passes (jr_be-ahn.5), so there is
 * no "continue without waiting" exit. Once this athlete has confirmed, the
 * step moves on to the verdict, which itself waits on (and polls for) an
 * opponent who has not confirmed yet.
 *
 * Signals, fastest first: result_confirmed / match_disputed broadcasts, then
 * the wizard's reconciler (confirmations from the DB), which also moves the
 * wizard to the verdict once both rows exist or the match is disputed.
 */
export function ConfirmStep(props: ConfirmStepProps) {
  const p = usePalette();
  const { matchId, me, opponent, resultData, confirmedAthleteIds, submissionName, finishTimeSeconds, disputeLocksAt: rawLocksAt, completedAt = null, onCompleted } = props;
  const disputeLocksAt = useDisputeLocksAt(rawLocksAt, completedAt);
  const [myConfirmedLocal, setMyConfirmed] = React.useState(false);
  const [opponentConfirmedLocal, setOpponentConfirmed] = React.useState(false);
  const [showDispute, setShowDispute] = React.useState(false);
  const [windowClosed, setWindowClosed] = React.useState(() => isDisputeWindowClosed(disputeLocksAt));
  const { reconcileNow } = useMatchSyncContext();
  const myConfirmed = myConfirmedLocal || confirmedAthleteIds.includes(me.athlete_id);
  const opponentConfirmed = opponentConfirmedLocal || confirmedAthleteIds.includes(opponent.athlete_id);

  const advancedRef = React.useRef(false);
  const onCompletedRef = React.useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const advance = React.useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onCompletedRef.current();
  }, []);

  const sync = useStepMatchSync({
    matchId,
    onResultConfirmed: (athleteId) => {
      if (athleteId === opponent.athlete_id) setOpponentConfirmed(true);
    },
    onMatchDisputed: (athleteId) => {
      if (athleteId === me.athlete_id) return;
      toast.info({ text1: "Result disputed", description: `${opponent.display_name} disputed the result. An admin will review it.` });
      advance();
    },
  });

  React.useEffect(() => {
    if (!myConfirmed) return;
    const t = setTimeout(advance, ADVANCE_AFTER_CONFIRM_MS);
    return () => clearTimeout(t);
  }, [myConfirmed, advance]);

  React.useEffect(() => {
    if (isDisputeWindowClosed(disputeLocksAt)) setWindowClosed(true);
  }, [disputeLocksAt]);

  async function handleConfirm() {
    if (myConfirmed) return;
    setMyConfirmed(true);
    const res = await mutationQueue.enqueue(`confirm-result:${matchId}:${me.athlete_id}`, () =>
      confirmMatchResult(supabase, matchId),
    );
    if (!res.ok) {
      setMyConfirmed(false);
      void matchHaptics.error();
      toast.error({ text1: "Couldn't confirm", description: res.error.message });
      reconcileNow();
      return;
    }
    // The one haptic for confirming (a commit action, Light). If the Confirm
    // button ever gains a `press` haptic of its own, drop this call: one
    // haptic per event. The verdict's `ratingGain` is a later, separate moment.
    void haptics.press();
    // The verdict that follows is fresh even if the match completed long ago.
    markResultFresh(matchId);
    if (isQueuedResult(res.data)) {
      toast.success({ text1: "Saved locally", description: "Confirmation will sync when you're back online." });
    }
    void sync.broadcastResultConfirmed(me.athlete_id);
  }

  async function handleDisputed() {
    await settleWithin(sync.broadcastMatchDisputed(me.athlete_id), SEND_GRACE_MS);
    advance();
  }

  if (showDispute) {
    return (
      <DisputeForm
        matchId={matchId}
        onCancel={() => setShowDispute(false)}
        onSubmitted={() => void handleDisputed()}
        onWindowClosed={() => {
          setWindowClosed(true);
          setShowDispute(false);
        }}
      />
    );
  }

  const isDraw = resultData?.result === "draw";
  const winner = resultData?.winnerId === me.athlete_id ? me : resultData?.winnerId === opponent.athlete_id ? opponent : null;
  const how = [submissionName ? `by ${submissionName}` : null, finishTimeSeconds != null ? formatElapsed(finishTimeSeconds) : null]
    .filter(Boolean)
    .join(" · ");
  const oppShort = shortName(opponent.display_name);
  const lockNote = windowClosed ? "The dispute window has closed." : disputeLockNote(disputeLocksAt);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Mono>{opponentConfirmed ? `RESULT RECORDED BY ${oppShort.toUpperCase()}` : "RESULT RECORDED"}</Mono>
        <Text accessibilityRole="header" className="font-heading uppercase" style={{ fontSize: 30, letterSpacing: 0.6, color: p.text }}>
          Confirm result
        </Text>
      </View>

      <View style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate }}>
        <View style={{ paddingVertical: 20, paddingHorizontal: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {winner ? <InitialsBlock name={winner.display_name} size={40} fontSize={14} /> : null}
            <View style={{ flex: 1 }}>
              <Mono color={p.text3}>{isDraw ? "RESULT" : "WINNER"}</Mono>
            </View>
            <Text testID="confirm-verdict" className="font-mono-bold" style={{ fontSize: 11, letterSpacing: 1.68, color: p.text2 }}>
              {confirmVerdict(resultData, me.athlete_id)}
            </Text>
          </View>
          <Text className="font-display" style={{ fontSize: 60, lineHeight: 56, color: p.text }}>
            {isDraw ? "Draw" : winner ? `${shortName(winner.display_name)} won` : "Result in"}
          </Text>
          {how ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text className="font-body" style={{ fontSize: 16, color: p.text2 }}>
                {how}
              </Text>
              {/* "The tap", drawn still and silent here: the moment itself
                  plays once, on the verdict, for the winner. */}
              {resultData?.result === "submission" && winner ? <TapMarks play={false} /> : null}
            </View>
          ) : null}
        </View>
        {me.elo_after != null ? (
          <View style={{ borderTopWidth: 1, borderColor: p.hairline, padding: 12 }}>
            <RatingBlock label="YOUR RATING" before={me.elo_before ?? null} after={me.elo_after} delta={me.elo_delta ?? null} />
          </View>
        ) : null}
      </View>

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
          name={`${shortName(me.display_name)} (you)`}
          status={myConfirmed ? "CONFIRMED ✓" : "WAITING ON YOU"}
          done={myConfirmed}
        />
      </View>

      {!myConfirmed ? (
        <View style={{ gap: 12 }}>
          <FightButton testID="confirm-result" label="Confirm result" onPress={() => void handleConfirm()} icon={(c) => <Check size={16} color={c} />} />
          {windowClosed ? null : (
            <FightButton
              testID="confirm-dispute"
              variant="secondary"
              label="Dispute result"
              onPress={() => setShowDispute(true)}
              icon={(c) => <Flag size={16} color={c} />}
            />
          )}
          <View testID="confirm-lock-notes" style={{ gap: 6, alignItems: "center" }}>
            {windowClosed ? null : (
              <Text className="font-mono-bold" style={{ textAlign: "center", fontSize: 11, letterSpacing: 0.4, color: p.text }}>
                {LEAVE_COUNTS_AS_CONFIRMING}
              </Text>
            )}
            {lockNote ? (
              <Text className="font-mono" style={{ textAlign: "center", fontSize: 11, letterSpacing: 0.4, color: p.text2 }}>
                {lockNote}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StatusRow({ name, status, done, divider = false, testID }: { name: string; status: string; done: boolean; divider?: boolean; testID?: string }) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      style={{ height: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: divider ? 1 : 0, borderColor: p.hairline }}
    >
      <Text numberOfLines={1} className="font-heading uppercase" style={{ flex: 1, fontSize: 13, letterSpacing: 0.52, color: p.text }}>
        {name}
      </Text>
      <Mono bold size={11} spacing={1.68} color={done ? p.win : p.amber}>
        {status}
      </Mono>
    </View>
  );
}
