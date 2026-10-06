import * as React from "react";
import { View } from "react-native";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";

/** Feed cards drawn while the first page loads (spec 6.4, AC 2.12). */
export const FEED_SKELETON_CARDS = 3;

/**
 * The cold-load feed placeholder: a month rule, then three feed cards (a
 * 16:9 block, a 24 pt avatar and two meta lines), on the registered skeleton
 * shimmer (Motion Rule registry, Ambient while loading; static under Reduce
 * Motion).
 */
export function MatchFeedSkeleton() {
  return (
    <View testID="matches-loading" accessibilityLabel="Loading your matches" style={{ marginTop: 22 }}>
      <SkeletonProvider>
        <SkeletonBlock height={10} width="40%" radius="xs" />
        {Array.from({ length: FEED_SKELETON_CARDS }, (_, i) => (
          <View key={i} testID="matches-skeleton-card" style={{ marginTop: 16 }}>
            <SkeletonBlock style={{ width: "100%", aspectRatio: 16 / 9 }} radius="xs" />
            <View className="flex-row" style={{ gap: 10, paddingTop: 12 }}>
              <SkeletonBlock width={24} height={24} radius="xs" />
              <View style={{ flex: 1, gap: 7, paddingTop: 2 }}>
                <SkeletonBlock height={10} width="50%" radius="xs" />
                <SkeletonBlock height={9} width="35%" radius="xs" />
              </View>
            </View>
          </View>
        ))}
      </SkeletonProvider>
    </View>
  );
}
