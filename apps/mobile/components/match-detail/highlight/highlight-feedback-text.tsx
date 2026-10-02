import * as React from "react";
import { Text, View } from "react-native";
import { typeSize } from "@/lib/typography";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { HIGHLIGHT_FREE_TEXT_MAX } from "@jits/shared/constants/highlights";
import { counterLabel, HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";

/** Free text (280 max) with a mono tabular-nums counter; keyboard-aware in the sheet. */
export function HighlightFeedbackText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tokens = useThemedTokens();
  return (
    <View className="gap-1">
      <BottomSheetTextInput
        testID="highlight-feedback-text"
        value={value}
        onChangeText={onChange}
        maxLength={HIGHLIGHT_FREE_TEXT_MAX}
        multiline
        placeholder={HIGHLIGHT_COPY.placeholder}
        placeholderTextColor={tokens.textTertiary}
        accessibilityLabel={HIGHLIGHT_COPY.placeholder}
        className="min-h-[72px] rounded-md border border-hairline-strong bg-surface-3 px-3 py-2 font-body text-ink"
        style={[typeSize("body"), { textAlignVertical: "top" }]}
      />
      <Text
        testID="highlight-feedback-counter"
        className="self-end font-mono text-caption text-ink-3"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {counterLabel(value.length, HIGHLIGHT_FREE_TEXT_MAX)}
      </Text>
    </View>
  );
}
