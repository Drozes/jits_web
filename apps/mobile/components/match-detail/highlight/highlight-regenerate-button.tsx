import * as React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { cn } from "@/lib/cn";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { HIGHLIGHT_COPY, regenerateLabel } from "@/lib/highlight/highlight-copy";
import { MonoNumbers } from "./mono-numbers";

interface Props {
  rendersRemaining: number;
  disabled: boolean;
  working: boolean;
  onPress: () => void;
}

/** The sheet's ONE Signal Red CTA, with a spinner while the AI works (~30 s). */
export function HighlightRegenerateButton({ rendersRemaining, disabled, working, onPress }: Props) {
  const tokens = useThemedTokens();
  const label = regenerateLabel(rendersRemaining);
  return (
    <Pressable
      testID="highlight-regenerate"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: working }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-[44px] flex-row items-center justify-center gap-2 rounded-sm px-5 bg-cta active:opacity-70",
        disabled && "opacity-60",
      )}
    >
      {working ? <ActivityIndicator size="small" color={tokens.textOnAccent} /> : null}
      <Text className="font-heading text-[12px] uppercase tracking-caps text-ink-on-cta">
        {working ? HIGHLIGHT_COPY.working : <MonoNumbers text={label} />}
      </Text>
    </Pressable>
  );
}
