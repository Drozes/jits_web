import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Handshake } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useRecordResult } from "@/lib/match-flow/use-record-result";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import {
  OutcomeToggle,
  ResultParticipant,
  WinnerPicker,
} from "./result-step-fields";
import { SubmissionFields } from "./submission-fields";

interface ResultStepProps {
  matchId: string;
  participants: ResultParticipant[];
  submissionTypes: SubmissionType[];
  onRecorded: (result: BroadcastResult) => void;
}

/**
 * Step 6 -- record the match result. User picks Submission or Draw, then
 * (for submissions) winner + submission type + optional finish time.
 * The actual mutation + broadcast logic lives in `useRecordResult`.
 */
export function ResultStep({ matchId, participants, submissionTypes, onRecorded }: ResultStepProps) {
  const tokens = useThemedTokens();
  const [outcome, setOutcome] = React.useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = React.useState("");
  const [submissionCode, setSubmissionCode] = React.useState("");
  const [finishTimeStr, setFinishTimeStr] = React.useState("");
  const { loading, submit } = useRecordResult({ matchId, onRecorded });

  const canSubmit =
    outcome === "draw" || (outcome === "submission" && winnerId !== "" && submissionCode !== "");

  function handleSubmit() {
    if (!outcome || !canSubmit) return;
    void submit({ outcome, winnerId, submissionCode, finishTimeStr });
  }

  return (
    <View className="gap-5 px-1 py-4">
      <Text className="text-center text-lg font-heading text-foreground">Record Result</Text>
      <OutcomeToggle value={outcome} onChange={setOutcome} />
      {outcome === "submission" ? (
        <>
          <WinnerPicker participants={participants} winnerId={winnerId} onChange={setWinnerId} />
          {winnerId ? (
            <SubmissionFields
              submissionTypes={submissionTypes}
              submissionCode={submissionCode}
              finishTimeStr={finishTimeStr}
              onSubmissionChange={setSubmissionCode}
              onFinishTimeChange={setFinishTimeStr}
            />
          ) : null}
        </>
      ) : null}
      {outcome === "draw" ? (
        <View className="items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4">
          <Handshake size={24} color="#f59e0b" />
          <Text className="text-sm font-medium text-foreground">Match ends in a draw</Text>
        </View>
      ) : null}
      <Button onPress={handleSubmit} disabled={!canSubmit || loading} size="lg">
        {loading ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color={tokens.primaryForeground} size="small" />
            <Text className="text-base font-heading text-primary-foreground">Recording...</Text>
          </View>
        ) : (
          "Record Result"
        )}
      </Button>
    </View>
  );
}
