/**
 * First-paint Arena. Mirrors the real layout's geometry (CTA plate, then the
 * two labelled sections) so the screen does not jump when the roster lands,
 * and so the split is legible before there is any data to split.
 */
import * as React from "react";
import { View } from "react-native";
import {
  SkeletonProvider,
  SkeletonBlock,
  SkeletonPlate,
} from "@/components/ui/skeleton";

function RowSkeleton() {
  return (
    <SkeletonPlate>
      <View className="flex-row items-center gap-3">
        <SkeletonBlock width={32} height={32} radius="xs" />
        <View className="flex-1 gap-1">
          <SkeletonBlock width="55%" height={13} radius="xs" />
          <SkeletonBlock width="35%" height={11} radius="xs" />
        </View>
        <SkeletonBlock width={84} height={36} radius="xs" />
      </View>
    </SkeletonPlate>
  );
}

export function ArenaSkeleton() {
  return (
    <SkeletonProvider>
      <View className="gap-6" accessibilityLabel="Loading the Arena">
        <SkeletonPlate>
          <SkeletonBlock width="45%" height={16} radius="xs" />
          <View className="mt-2">
            <SkeletonBlock width="80%" height={12} radius="xs" />
          </View>
          <View className="mt-4">
            <SkeletonBlock width="100%" height={44} radius="xs" />
          </View>
        </SkeletonPlate>

        <View className="gap-2">
          <SkeletonBlock width={96} height={10} radius="xs" />
          <RowSkeleton />
          <RowSkeleton />
        </View>

        <View className="gap-2">
          <SkeletonBlock width={128} height={10} radius="xs" />
          <RowSkeleton />
        </View>
      </View>
    </SkeletonProvider>
  );
}
