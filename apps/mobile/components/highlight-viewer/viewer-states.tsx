import * as React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Button } from "@/components/ui/elo-system/button";

/** Loading: an empty 9:16 poster frame (static; minimal motion). */
export function ViewerSkeleton({ frameStyle }: { frameStyle: ViewStyle }) {
  return <View testID="viewer-skeleton" className="bg-surface-4 rounded-md self-center" style={frameStyle} />;
}

interface ViewerMessageProps {
  testID: string;
  message: string;
  /** Optional recovery action; the message alone when absent. */
  action?: { testID: string; label: string; variant: "primary" | "secondary"; onPress: () => void };
}

/** A centred state message (not found, replaced, paused, error). */
export function ViewerMessage({ testID, message, action }: ViewerMessageProps) {
  return (
    <View testID={testID} className="flex-1 items-center justify-center gap-4 px-6">
      <Text className="font-body text-[14px] text-ink text-center">{message}</Text>
      {action ? (
        <Button height={44} testID={action.testID} label={action.label} variant={action.variant} onPress={action.onPress} />
      ) : null}
    </View>
  );
}
