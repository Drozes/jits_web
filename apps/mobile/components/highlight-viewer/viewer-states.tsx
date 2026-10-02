import * as React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";
import { ViewerButton } from "./viewer-button";

/**
 * Loading: an empty 9:16 poster frame, one skeleton bar with the registered
 * shimmer (Motion Rule registry, Ambient, while loading); a plain static
 * frame under Reduce Motion.
 */
export function ViewerSkeleton({ frameStyle }: { frameStyle: ViewStyle }) {
  return (
    <View testID="viewer-skeleton" className="self-center" style={frameStyle}>
      <SkeletonProvider>
        <SkeletonBlock testID="viewer-skeleton-frame" radius="md" style={{ width: frameStyle.width, height: frameStyle.height }} />
      </SkeletonProvider>
    </View>
  );
}

interface ViewerMessageProps {
  testID: string;
  message: string;
  /** Optional recovery action; the message alone when absent. */
  action?: { testID: string; label: string; variant: "primary" | "outline"; onPress: () => void };
}

/** A centred state message (not found, replaced, paused, error). */
export function ViewerMessage({ testID, message, action }: ViewerMessageProps) {
  return (
    <View testID={testID} className="flex-1 items-center justify-center gap-4 px-6">
      <Text className="font-body text-[14px] text-ink text-center">{message}</Text>
      {action ? (
        <ViewerButton testID={action.testID} label={action.label} variant={action.variant} onPress={action.onPress} />
      ) : null}
    </View>
  );
}
