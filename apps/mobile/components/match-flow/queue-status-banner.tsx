import * as React from "react";
import { Text, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { mutationQueue } from "@/lib/network/mutation-queue";

/**
 * Tiny status banner that surfaces when one or more critical match
 * writes (record / confirm) have been queued by `mutationQueue` while
 * offline. Auto-dismisses when the queue drains -- which happens
 * automatically on reconnect since the queue subscribes to NetInfo.
 *
 * Color scheme: warning amber (not destructive). The user's data is
 * safe -- just not yet synced.
 */
export function QueueStatusBanner() {
  const [size, setSize] = React.useState<number>(() => mutationQueue.size());

  React.useEffect(() => {
    const update = () => setSize(mutationQueue.size());
    // Sync once on mount in case an entry was queued before this banner
    // mounted (e.g., user navigated mid-queue).
    update();
    return mutationQueue.subscribe(update);
  }, []);

  if (size === 0) return null;

  const label =
    size === 1
      ? "Saved locally. Will sync when you're back online."
      : `${size} updates saved locally. Will sync when you're back online.`;

  return (
    <View className="flex-row items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2">
      <CloudOff size={14} color="#d97706" />
      <Text className="flex-1 text-xs text-amber-700" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
