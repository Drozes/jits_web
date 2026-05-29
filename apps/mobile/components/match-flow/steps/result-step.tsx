import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Handshake } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
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
import { cn } from "@/lib/cn";

interface ResultStepProps {
  matchId: string;
  participants: ResultParticipant[];
  submissionTypes: SubmissionType[];
  onRecorded: (result: BroadcastResult) => void;
}

/**
 * Step 6: record the match result. User picks Submission or Draw, then
 * (for submissions) winner + submission type + optional finish time.
 * The actual mutation + broadcast logic lives in `useRecordResult`.
 *
 * ELO design system: meta heading, OutcomeToggle, WinnerPicker, Chip
 * grid of submission types (D8 wireframe lines 1239-1273), and a
 * Signal Red record-result cta.
 */
export function ResultStep({
  matchId,
  participants,
  submissionTypes,
  onRecorded,
}: ResultStepProps) {
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
      <View className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Match Ended
        </Text>
        <Text className="font-display text-[28px] text-ink tracking-mark text-center">
          RECORD RESULT
        </Text>
      </View>

      <OutcomeToggle value={outcome} onChange={setOutcome} />

      {outcome === "submission" ? (
        <>
          <WinnerPicker
            participants={participants}
            winnerId={winnerId}
            onChange={setWinnerId}
          />
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
        <Plate variant="loss" className="items-center gap-2">
          <Handshake size={24} color={tokens.stateNegative} />
          <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
            Match ends in a draw
          </Text>
          <Text className="font-body text-[12px] text-ink-2 text-center">
            Both athletes lose ELO on a draw.
          </Text>
        </Plate>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        className={cn(
          "bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover",
          (!canSubmit || loading) && "opacity-50",
        )}
      >
        {loading ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color={tokens.textOnAccent} size="small" />
            <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
              Recording...
            </Text>
          </View>
        ) : (
          <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
            Record Result
          </Text>
        )}
      </Pressable>
    </View>
  );
}
