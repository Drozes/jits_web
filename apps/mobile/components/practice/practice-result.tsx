import * as React from "react";
import { Text, View } from "react-native";
import { OutcomeToggle, WinnerPicker } from "@/components/match-flow/steps/result-step-fields";
import { SubmissionFields } from "@/components/match-flow/steps/submission-fields";
import { isFinishTimeValid, parseFinishTime } from "@/lib/match-flow/parse-finish-time";
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
  onSubmit,
}: {
  athleteId: string;
  submissionTypes: SubmissionType[];
  onSubmit: (result: BroadcastResult) => void;
}) {
  const [outcome, setOutcome] = React.useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = React.useState("");
  const [submissionCode, setSubmissionCode] = React.useState("");
  const [finishTimeStr, setFinishTimeStr] = React.useState("");

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
              onSubmissionChange={setSubmissionCode}
              onFinishTimeChange={setFinishTimeStr}
            />
          ) : null}
        </>
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
