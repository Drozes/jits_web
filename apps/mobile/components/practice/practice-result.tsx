import * as React from "react";
import { Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { OutcomeToggle, WinnerPicker } from "@/components/match-flow/steps/result-step-fields";
import { SubmissionFields } from "@/components/match-flow/steps/submission-fields";
import { isFinishTimeValid, parseFinishTime } from "@/lib/match-flow/parse-finish-time";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import {
  PRACTICE_BOT_ID,
  PRACTICE_BOT_NAME,
  PRACTICE_DURATION_SECONDS,
} from "@/lib/practice/constants";
import { PracticeButton } from "./practice-steps";

/**
 * Record the practice result with the real result leaves and the real
 * validation rule (mirrors `ResultStep.canSubmit`). The result stays in
 * local state; nothing is written. With no submission list (the read
 * failed), only a draw can be recorded.
 */
export function PracticeResult({
  athleteId,
  submissionTypes,
  initialFinishSeconds,
  onSubmit,
}: {
  athleteId: string;
  submissionTypes: SubmissionType[];
  /** Practice clock at End Match; prefills the (still editable) finish time. */
  initialFinishSeconds?: number;
  onSubmit: (result: BroadcastResult) => void;
}) {
  const [outcome, setOutcome] = React.useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = React.useState("");
  const [submissionCode, setSubmissionCode] = React.useState("");
  const [finishTimeStr, setFinishTimeStr] = React.useState(() =>
    initialFinishSeconds != null ? formatElapsed(initialFinishSeconds) : "",
  );
  const [finishFromClock, setFinishFromClock] = React.useState(initialFinishSeconds != null);
  const onFinishTimeChange = React.useCallback((v: string) => {
    setFinishFromClock(false);
    setFinishTimeStr(v);
  }, []);

  const finishTimeValid = isFinishTimeValid(finishTimeStr, PRACTICE_DURATION_SECONDS);
  const canSubmit =
    outcome === "draw" ||
    (outcome === "submission" &&
      winnerId !== "" &&
      submissionCode !== "" &&
      finishTimeStr.trim() !== "" &&
      finishTimeValid);

  function submit() {
    if (!canSubmit) return;
    onSubmit(
      outcome === "draw"
        ? { result: "draw" }
        : {
            result: "submission",
            winnerId,
            submissionCode,
            finishTimeSeconds: parseFinishTime(finishTimeStr) ?? undefined,
          },
    );
  }

  return (
    <View className="gap-5 px-1 py-4">
      <View className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Match Ended
        </Text>
        <Text className="font-display text-[28px] text-ink tracking-mark text-center">
          RECORD RESULT
        </Text>
      </View>
      <OutcomeToggle value={outcome} onChange={setOutcome} />
      {outcome === "submission" && submissionTypes.length === 0 ? (
        <Text testID="practice-no-submissions" className="font-body text-[13px] text-ink-2">
          Submission list unavailable right now. Record a draw to continue.
        </Text>
      ) : null}
      {outcome === "submission" && submissionTypes.length > 0 ? (
        <>
          <WinnerPicker
            participants={[
              { id: athleteId, displayName: "You" },
              { id: PRACTICE_BOT_ID, displayName: PRACTICE_BOT_NAME },
            ]}
            winnerId={winnerId}
            onChange={setWinnerId}
          />
          {winnerId ? (
            <SubmissionFields
              submissionTypes={submissionTypes}
              submissionCode={submissionCode}
              finishTimeStr={finishTimeStr}
              durationSeconds={PRACTICE_DURATION_SECONDS}
              finishTimeInvalid={!finishTimeValid}
              finishTimeFromClock={finishFromClock}
              onSubmissionChange={setSubmissionCode}
              onFinishTimeChange={onFinishTimeChange}
            />
          ) : null}
        </>
      ) : null}
      {outcome === "draw" ? (
        <Plate testID="practice-draw-plate" className="items-center gap-2">
          <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
            Match ends in a draw
          </Text>
          <Text className="font-body text-[12px] text-ink-2 text-center">
            Practice: no rating change.
          </Text>
        </Plate>
      ) : null}
      <PracticeButton
        testID="result-record"
        label="Record Result"
        onPress={submit}
        disabled={!canSubmit}
      />
    </View>
  );
}
