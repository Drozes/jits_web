import { Text, TextInput, View } from "react-native";
import { Chip } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { cn } from "@/lib/cn";
import type { SubmissionType } from "@jits/shared/types/submission-type";

interface SubmissionFieldsProps {
  submissionTypes: SubmissionType[];
  submissionCode: string;
  finishTimeStr: string;
  /** Match length in seconds; finish time can't exceed it. */
  durationSeconds: number;
  /** True when the entered finish time is malformed or past the duration. */
  finishTimeInvalid: boolean;
  onSubmissionChange: (v: string) => void;
  onFinishTimeChange: (v: string) => void;
}

/**
 * Submission-type chip grid + Finish Time input. Used by the result
 * step when the outcome is "submission". Mirrors D8 wireframe (lines
 * 1255-1268): two-column grid of selectable Chip cells.
 */
export function SubmissionFields({
  submissionTypes,
  submissionCode,
  finishTimeStr,
  durationSeconds,
  finishTimeInvalid,
  onSubmissionChange,
  onFinishTimeChange,
}: SubmissionFieldsProps) {
  const tokens = useThemedTokens();
  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Submission
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {submissionTypes.map((st) => {
            const active = submissionCode === st.code;
            return (
              <Chip
                key={st.code}
                active={active}
                onPress={() => onSubmissionChange(st.code)}
                className="min-w-[46%] flex-grow justify-center"
              >
                {st.display_name}
              </Chip>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Finish Time
        </Text>
        <TextInput
          placeholder="mm:ss or seconds"
          placeholderTextColor={tokens.textTertiary}
          value={finishTimeStr}
          onChangeText={onFinishTimeChange}
          keyboardType="numeric"
          maxLength={5}
          className={cn(
            "h-11 rounded-sm border bg-surface-3 px-3 font-mono text-[14px] text-ink",
            finishTimeInvalid ? "border-negative" : "border-hairline-strong",
          )}
        />
        {finishTimeInvalid ? (
          <Text className="font-mono text-[10px] text-negative uppercase tracking-caps-l">
            Must be within match length (
            <Text className="tabular-nums">{formatElapsed(durationSeconds)}</Text>)
          </Text>
        ) : null}
      </View>
    </View>
  );
}
