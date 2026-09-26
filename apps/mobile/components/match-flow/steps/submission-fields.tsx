import * as React from "react";
import { Text, TextInput, View } from "react-native";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import {
  OTHER_SUBMISSION_CODE,
  filterSubmissionTypes,
} from "@/lib/match-flow/filter-submissions";
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
  /** True while the finish time is the untouched match-clock prefill. */
  finishTimeFromClock?: boolean;
  onSubmissionChange: (v: string) => void;
  onFinishTimeChange: (v: string) => void;
}

const toOption = (t: SubmissionType): SearchSelectOption => ({
  label: t.display_name,
  value: t.code,
});

/**
 * Submission select + Finish Time input. Used by the result step (and the
 * practice match) when the outcome is "submission". The submission list is
 * long, so instead of a chip grid it is a single field that opens the shared
 * full-screen {@link SearchSelect} autocomplete; search is case-, punctuation-
 * and spacing-insensitive and also matches codes and initials (see
 * `filterSubmissionTypes`). The value submitted is still the type's `code`.
 */
export function SubmissionFields({
  submissionTypes,
  submissionCode,
  finishTimeStr,
  durationSeconds,
  finishTimeInvalid,
  finishTimeFromClock = false,
  onSubmissionChange,
  onFinishTimeChange,
}: SubmissionFieldsProps) {
  const tokens = useThemedTokens();
  const getOptions = React.useCallback(
    (q: string) => filterSubmissionTypes(submissionTypes, q).map(toOption),
    [submissionTypes],
  );
  const other = submissionTypes.find((t) => t.code === OTHER_SUBMISSION_CODE);
  const noMatchesOptions = React.useMemo(
    () => (other ? [toOption(other)] : undefined),
    [other],
  );
  const selectedLabel = submissionTypes.find((t) => t.code === submissionCode)?.display_name;

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Submission
        </Text>
        <SearchSelect
          testID="result-submission"
          value={submissionCode}
          displayLabel={selectedLabel}
          onSelect={onSubmissionChange}
          title="Submission"
          accessibilityLabel="Submission"
          placeholder="Select submission"
          searchPlaceholder="Search submissions"
          getOptions={getOptions}
          emptyHint="No submissions available."
          noMatchesText="No submissions match"
          noMatchesOptions={noMatchesOptions}
        />
      </View>

      <View className="gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Finish Time
        </Text>
        <TextInput
          testID="result-finish-time"
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
        ) : finishTimeFromClock ? (
          <Text
            testID="result-finish-time-hint"
            className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l"
          >
            From match clock
          </Text>
        ) : null}
      </View>
    </View>
  );
}
