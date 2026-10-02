import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";

/** A muted one-liner (waiting, none, invalidated, notes). */
export function HighlightNote({ testID, children }: { testID?: string; children: string }) {
  return (
    <Text testID={testID} className="font-body text-[12px] text-ink-3">
      {children}
    </Text>
  );
}

interface FailedProps {
  errorMessage: string | null;
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
}

/**
 * No playable version and the last render failed. "Try again" is a
 * SECONDARY (outline) button: match detail's one Signal Red CTA is the match
 * video's Watch. A NULL reason renders nothing (never an error string).
 */
export function HighlightFailed({ errorMessage, canRetry, busy, onRetry }: FailedProps) {
  return (
    <View testID="highlight-failed" className="gap-3">
      <Text className="font-body text-[13px] text-ink">{HIGHLIGHT_COPY.failed}</Text>
      {errorMessage ? <HighlightNote testID="highlight-error-reason">{errorMessage}</HighlightNote> : null}
      {canRetry ? (
        <Pressable
          testID="highlight-retry"
          accessibilityRole="button"
          accessibilityLabel={HIGHLIGHT_COPY.tryAgain}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onRetry}
          className={cn(
            "items-center justify-center rounded-sm px-5 py-3 border border-hairline-strong active:bg-surface-4",
            busy && "opacity-50",
          )}
        >
          <Text className="font-heading text-[12px] uppercase tracking-caps text-ink">
            {HIGHLIGHT_COPY.tryAgain}
          </Text>
        </Pressable>
      ) : (
        <HighlightNote testID="highlight-no-retries">{HIGHLIGHT_COPY.noRetries}</HighlightNote>
      )}
    </View>
  );
}
