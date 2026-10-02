import * as React from "react";
import { Text, View } from "react-native";
import { Chip } from "@/components/ui/elo-system/chip";
import { HIGHLIGHT_FEEDBACK_CHIPS } from "@jits/shared/constants/highlights";
import type { HighlightProgress } from "@jits/shared/api/highlights";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { useHighlightFeedbackForm } from "@/lib/highlight/use-highlight-feedback-form";
import type {
  FeedbackPayload,
  FeedbackSubmitKind,
  HighlightRating,
} from "@/lib/highlight/use-highlight-rating";
import { HighlightThumb } from "./highlight-thumbs";
import { HighlightFormActions } from "./highlight-form-actions";
import { HighlightFeedbackText } from "./highlight-feedback-text";

export interface HighlightFeedbackFormProps {
  preset: HighlightRating | null;
  storedRating: HighlightRating | null;
  busy: FeedbackSubmitKind | null;
  error: string | null;
  progress: Pick<HighlightProgress, "phase" | "canRegenerate" | "rendersRemaining" | "renderMax">;
  onSubmit: (kind: FeedbackSubmitKind, payload: FeedbackPayload) => void;
}

function Label({ children }: { children: string }) {
  return (
    <Text className="font-mono-bold text-micro text-ink-3 uppercase tracking-caps-xl tabular-nums">
      {children}
    </Text>
  );
}

/** "Improve your reel": rating, chips, free text, then the actions. */
export function HighlightFeedbackForm(props: HighlightFeedbackFormProps) {
  const form = useHighlightFeedbackForm(props);
  return (
    <View testID="highlight-feedback-form" className="px-4 pb-8 pt-2 gap-4">
      <Text className="font-heading text-title-l text-ink">{HIGHLIGHT_COPY.sheetTitle}</Text>
      <View className="gap-2">
        <Label>{HIGHLIGHT_COPY.howWasIt}</Label>
        <View className="flex-row gap-2">
          <HighlightThumb kind="up" testIDPrefix="highlight-sheet-thumb" selected={form.rating === 1} onPress={() => form.toggleRating(1)} />
          <HighlightThumb kind="down" testIDPrefix="highlight-sheet-thumb" selected={form.rating === -1} onPress={() => form.toggleRating(-1)} />
        </View>
      </View>
      <View className="gap-2">
        <Label>{HIGHLIGHT_COPY.whatsOff}</Label>
        <View className="flex-row flex-wrap gap-2">
          {HIGHLIGHT_FEEDBACK_CHIPS.map(({ code, label }) => (
            <Chip
              key={code}
              testID={`highlight-chip-${code}`}
              active={form.chips.includes(code)}
              onPress={() => form.toggleChip(code)}
            >
              {label}
            </Chip>
          ))}
        </View>
      </View>
      <HighlightFeedbackText value={form.text} onChange={form.setText} />
      <HighlightFormActions form={form} progress={props.progress} />
    </View>
  );
}
