import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { regenerateHelper, regenerateMode } from "@/lib/highlight/regenerate-mode";
import type { UseHighlightFeedbackFormResult } from "@/lib/highlight/use-highlight-feedback-form";
import { HighlightRegenerateButton } from "./highlight-regenerate-button";

interface Props {
  form: UseHighlightFeedbackFormResult;
  progress: Pick<HighlightProgress, "phase" | "canRegenerate" | "rendersRemaining" | "renderMax">;
}

/** Inline error, Regenerate (or its helper) and the secondary "Just send feedback". */
export function HighlightFormActions({ form, progress }: Props) {
  const mode = regenerateMode(progress);
  const helper = regenerateHelper(mode, progress.renderMax);
  const busy = form.busy !== null;
  const sendDisabled = !form.hasFeedback || busy;
  return (
    <View className="gap-2">
      {form.error ? (
        <Text testID="highlight-feedback-error" accessibilityRole="alert" className="font-body text-[12px] text-ink">
          {form.error}
        </Text>
      ) : null}
      {mode === "enabled" || mode === "exhausted" ? (
        <HighlightRegenerateButton
          rendersRemaining={progress.rendersRemaining}
          disabled={mode === "exhausted" || busy}
          working={form.busy === "regenerated"}
          onPress={form.regenerate}
        />
      ) : null}
      {helper ? (
        <Text testID="highlight-regenerate-helper" className="font-body text-[12px] text-ink-3">
          {helper}
        </Text>
      ) : null}
      <Pressable
        testID="highlight-send-feedback"
        accessibilityRole="button"
        accessibilityLabel={HIGHLIGHT_COPY.justSend}
        accessibilityState={{ disabled: sendDisabled }}
        disabled={sendDisabled}
        onPress={form.send}
        className={cn(
          "min-h-[44px] items-center justify-center rounded-sm border border-hairline-strong px-5",
          sendDisabled ? "opacity-60" : "active:bg-surface-4",
        )}
      >
        <Text className="font-heading text-[12px] uppercase tracking-caps text-ink">{HIGHLIGHT_COPY.justSend}</Text>
      </Pressable>
    </View>
  );
}
