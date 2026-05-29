import * as React from "react";
import { Text, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { mutationQueue } from "@/lib/network/mutation-queue";

/**
 * Tiny status banner that surfaces when one or more critical match
 * writes (record / confirm) have been queued by `mutationQueue` while
 * offline. Auto-dismisses when the queue drains, which happens
 * automatically on reconnect since the queue subscribes to NetInfo.
 *
 * ELO design system: hairline-bordered plate with mono caps copy. We
 * keep amber semantics (warning, not destructive) by routing the icon
 * through the themed tertiary ink, since the ELO palette doesn't
 * define a discrete warning token.
 */
export function QueueStatusBanner() {
  const tokens = useThemedTokens();
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
    <View className="flex-row items-center gap-2 rounded-xs bg-surface-3 border border-hairline-strong px-3 py-2">
      <CloudOff size={14} color={tokens.textSecondary} />
      <Text
        className="flex-1 font-mono text-[10px] text-ink-2 uppercase tracking-caps-l"
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}
