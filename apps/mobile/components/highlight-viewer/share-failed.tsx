import * as React from "react";
import { Text, View } from "react-native";
import { SHARE_COPY, type ShareError } from "@/lib/highlight-share";
import { ViewerButton } from "./viewer-button";

interface ShareFailedProps {
  error: ShareError;
  onRetry: () => void;
  onFallback: () => void;
}

/**
 * A failed share step: the hook's message (spec copy / the Reels module's
 * failure message), "Try again" as the sheet's one red CTA only when the hook
 * says the step is `retryable`, and "Use the share sheet" when it `canFallBack`.
 * The kill switch (`disabled`) is neither: the message alone.
 */
export function ShareFailed({ error, onRetry, onFallback }: ShareFailedProps) {
  return (
    <View testID={`share-failed-${error.kind}`} className="gap-3">
      <Text testID="share-error" className="font-body text-[13px] text-ink">
        {error.message}
      </Text>
      {error.retryable ? (
        <ViewerButton testID="share-retry" label={SHARE_COPY.tryAgain} variant="primary" onPress={onRetry} />
      ) : null}
      {error.canFallBack ? (
        <ViewerButton testID="share-fallback" label={SHARE_COPY.useShareSheet} variant="text" onPress={onFallback} />
      ) : null}
    </View>
  );
}
