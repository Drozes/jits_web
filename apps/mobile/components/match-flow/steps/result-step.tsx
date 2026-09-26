import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Handshake } from "lucide-react-native";
import { Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAmber } from "@/components/match-detail/use-amber";
import { useRecordResult } from "@/lib/match-flow/use-record-result";
import { isFinishTimeValid } from "@/lib/match-flow/parse-finish-time";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
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
  /** Only a ranked draw moves rating; casual matches never do. */
  matchType: "ranked" | "casual";
  /** Match length in seconds; finish time can't exceed it. */
  durationSeconds: number;
  /** Match clock at End Match; prefills the (still editable) finish time. */
  initialFinishSeconds?: number;
  participants: ResultParticipant[];
  submissionTypes: SubmissionType[];
  onRecorded: (result: BroadcastResult) => void;
}

/**
 * Step 6: record the match result. User picks Submission or Draw, then
 * (for submissions) winner + submission type + optional finish time.
 * The actual mutation + broadcast logic lives in `useRecordResult`.
 *
 * ELO design system: meta heading, OutcomeToggle, WinnerPicker, a
 * full-screen autocomplete submission select (SubmissionFields), and a
 * Signal Red record-result cta.
 */
export function ResultStep({
  matchId,
  matchType,
  durationSeconds,
  initialFinishSeconds,
  participants,
  submissionTypes,
  onRecorded,
}: ResultStepProps) {
  const tokens = useThemedTokens();
  // Amber for draws (Pressure Score).
  const amberIcon = useAmber().icon;
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
  const { loading, submit } = useRecordResult({ matchId, onRecorded });

  // Finish time is REQUIRED for submissions: the BE `record_match_result`
  // rejects a submission without `finish_time_seconds` (`missing_fields`),
  // so allowing an empty value here produced a silent "couldn't record"
  // failure (jits-ait follow-up). When present it must also parse and fall
  // within the match length (a submission can't land after the bout ended).
  const finishTimeValid = isFinishTimeValid(finishTimeStr, durationSeconds);
  const finishTimeProvided = finishTimeStr.trim() !== "";

  // The practice match (components/practice/practice-result.tsx) mirrors this rule; keep them in step.
  const canSubmit =
    outcome === "draw" ||
    (outcome === "submission" &&
      winnerId !== "" &&
      submissionCode !== "" &&
      finishTimeProvided &&
      finishTimeValid);

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
              durationSeconds={durationSeconds}
              finishTimeInvalid={!finishTimeValid}
              finishTimeFromClock={finishFromClock}
              onSubmissionChange={setSubmissionCode}
              onFinishTimeChange={onFinishTimeChange}
            />
          ) : null}
        </>
      ) : null}

      {outcome === "draw" ? (
        // A draw is pressure, not a loss: default plate, amber glyph.
        <Plate className="items-center gap-2">
          <Handshake size={24} color={amberIcon} />
          <Text className="font-heading text-[13px] text-ink uppercase tracking-caps">
            Match ends in a draw
          </Text>
          <Text className="font-body text-[12px] text-ink-2 text-center">
            {matchType === "ranked"
              ? "Draws cost both athletes rating."
              : "Casual match: no rating change."}
          </Text>
        </Plate>
      ) : null}

      <Pressable
        testID="result-record"
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
