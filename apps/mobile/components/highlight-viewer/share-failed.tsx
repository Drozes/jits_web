import * as React from "react";
import { Text, View } from "react-native";
import type { ShareError } from "@/lib/highlight-share";
import { VIEWER_COPY } from "./viewer-copy";
import { ViewerButton } from "./viewer-button";

interface ShareFailedProps {
  error: ShareError;
  onRetry: () => void;
  onFallback: () => void;
}

/** Kinds whose failure a retry can fix; `disabled` (kill switch) never offers one. */
const RETRYABLE: ReadonlySet<ShareError["kind"]> = new Set(["download", "reels", "share_sheet"]);

/**
 * A failed share step: the hook's message (spec copy), "Try again" as the
 * sheet's one red CTA when a retry can help, and "Use the share sheet" when a
 * Reels failure can fall back.
 */
export function ShareFailed({ error, onRetry, onFallback }: ShareFailedProps) {
  return (
    <View testID={`share-failed-${error.kind}`} className="gap-3">
      <Text testID="share-error" className="font-body text-[13px] text-ink">
        {error.message}
      </Text>
      {RETRYABLE.has(error.kind) ? (
        <ViewerButton testID="share-retry" label={VIEWER_COPY.tryAgain} variant="primary" onPress={onRetry} />
      ) : null}
      {error.kind === "reels" && error.canFallBack ? (
        <ViewerButton testID="share-fallback" label={VIEWER_COPY.useShareSheet} variant="text" onPress={onFallback} />
      ) : null}
    </View>
  );
}
