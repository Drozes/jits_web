import * as React from "react";
import { Text, View } from "react-native";
import { Handshake } from "lucide-react-native";
import { useRecordResult, type RecordedMeta } from "@/lib/match-flow/use-record-result";
import { useResultClaim } from "@/lib/match-flow/use-result-claim";
import { isFinishTimeValid } from "@/lib/match-flow/parse-finish-time";
import { useFinishTimeField } from "@/lib/match-flow/use-finish-time-field";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import { usePalette } from "@/lib/theme/palette";
import { FightButton, KindTag, Mono, shortName } from "../fight/fight-ui";
import {
  DrawPlate,
  FinishTimeField,
  SubmissionGrid,
  WinnerChip,
  WinnerTiles,
  type ResultAthlete,
} from "./result-form";
import { ResultWaiting } from "./result-waiting";

interface ResultStepProps {
  matchId: string;
  /** Match length in seconds; finish time can't exceed it. */
  durationSeconds: number;
  /** Match clock at End Match; prefills the (still editable) finish time. */
  initialFinishSeconds?: number;
  me: ResultAthlete;
  opponent: ResultAthlete;
  submissionTypes: SubmissionType[];
  onRecorded: (result: BroadcastResult, meta: RecordedMeta) => void;
}

/**
 * Step 6: record the result, claim-first. The first athlete to start (tap a
 * winner or Draw) claims the form; the other phone shows a live "recording
 * the result" view and cannot open it, until a result lands (they move on
 * to confirm) or the claim goes quiet for 20 s (the form unlocks).
 *
 * Winner = two big tiles plus Draw; then eight one-tap finishes with the
 * full catalogue search, and the finish time prefilled from the clock.
 */
export function ResultStep(props: ResultStepProps) {
  const p = usePalette();
  const { matchId, durationSeconds, initialFinishSeconds, me, opponent, submissionTypes, onRecorded } = props;
  const [outcome, setOutcome] = React.useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = React.useState("");
  const [submissionCode, setSubmissionCode] = React.useState("");
  const finish = useFinishTimeField(initialFinishSeconds);

  const remoteClaimRef = React.useRef<((athleteId: string, at: number, supersedes: number | null) => void) | null>(null);
  const { loading, submit, broadcastResultClaimed } = useRecordResult({
    matchId,
    onRecorded,
    currentAthleteId: me.id,
    onResultClaimed: (athleteId, at, supersedes) => remoteClaimRef.current?.(athleteId, at, supersedes),
  });
  const claim = useResultClaim({ meId: me.id, broadcast: broadcastResultClaimed });
  remoteClaimRef.current = claim.onRemoteClaim;

  const finishValid = isFinishTimeValid(finish.finishTimeStr, durationSeconds);
  const finishProvided = finish.finishTimeStr.trim() !== "";
  // The practice match (components/practice/practice-result.tsx) mirrors this rule; keep them in step.
  const canSubmit =
    outcome === "draw" ||
    (outcome === "submission" && winnerId !== "" && submissionCode !== "" && finishProvided && finishValid);

  if (claim.state === "theirs") {
    const claimer = claim.claimerId === opponent.id ? opponent : me;
    return (
      <ResultWaiting
        claimer={claimer}
        me={me}
        opponent={opponent}
        durationSeconds={durationSeconds}
        endedAtSeconds={initialFinishSeconds}
        onTakeOver={claim.canTakeOver ? claim.takeOver : undefined}
      />
    );
  }

  function pickWinner(id: string) {
    if (!claim.claimNow()) return;
    setOutcome("submission");
    setWinnerId(id);
  }
  function pickDraw() {
    if (!claim.claimNow()) return;
    setOutcome("draw");
    setWinnerId("");
  }
  function reset() {
    setOutcome(null);
    setWinnerId("");
  }
  function handleSubmit() {
    if (!outcome || !canSubmit) return;
    void submit({ outcome, winnerId, submissionCode, finishTimeStr: finish.finishTimeStr });
  }

  const winner = winnerId === me.id ? me : winnerId === opponent.id ? opponent : null;
  const endedAt = initialFinishSeconds != null ? `ENDED AT ${formatElapsed(initialFinishSeconds)}` : null;

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <KindTag />
          {endedAt ? <Mono>{endedAt}</Mono> : null}
        </View>
        {/* A plain text element on purpose: the match-loop harness taps the
            StaticText "Record result" to drop the numeric keyboard. */}
        <Text className="font-heading uppercase" style={{ fontSize: 30, letterSpacing: 0.6, color: p.text }}>
          Record result
        </Text>
      </View>

      {outcome === null ? (
        <>
          <Mono bold size={11}>
            TAP THE WINNER
          </Mono>
          <WinnerTiles me={me} opponent={opponent} onPick={pickWinner} />
          <FightButton
            testID="result-outcome-draw"
            variant="secondary"
            label="Draw"
            onPress={pickDraw}
            icon={(c) => <Handshake size={18} color={c} />}
          />
        </>
      ) : outcome === "draw" ? (
        <DrawPlate onChange={reset} />
      ) : winner ? (
        <>
          <WinnerChip winner={winner} onChange={reset} />
          <SubmissionGrid submissionTypes={submissionTypes} value={submissionCode} onChange={setSubmissionCode} />
          <FinishTimeField
            value={finish.finishTimeStr}
            onChange={finish.onChange}
            fromClock={finish.fromClock}
            invalid={finishProvided && !finishValid}
            durationSeconds={durationSeconds}
          />
        </>
      ) : null}

      {outcome !== null ? (
        <FightButton testID="result-record" label={loading ? "Recording..." : "Record result"} onPress={handleSubmit} disabled={!canSubmit} busy={loading} />
      ) : null}

      {claim.state === "mine" ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.win }} />
          <Mono size={11} spacing={0.4}>
            {`You're recording for both of you. ${shortName(opponent.displayName)} sees this live.`}
          </Mono>
        </View>
      ) : null}
    </View>
  );
}
