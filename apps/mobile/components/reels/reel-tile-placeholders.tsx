import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight, Swords, User } from "lucide-react-native";
import type { CtaVariant, GhostVariant } from "@/lib/highlight/reel-lane";
import { REEL_LANE_COPY } from "@/lib/highlight/reel-lane";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { REEL_TILE_SIZE, TileCaption, TileFrame, type ReelTileSize } from "./reel-tile-frame";
import { SEE_ALL_A11Y, ctaCopy, ghostCopy } from "./reel-tile-copy";

/** Opacity of the faint ghosts that fade the empty shelf to the right (spec 10.2, 10.3). */
export const FAINT_GHOST_OPACITY = 0.4;

/**
 * A ghost (spec 5, 10.2, 10.3): a dashed hairline outline, a silhouette and
 * one line of copy. Never pressable. The C-L5 ghost carries the recording
 * helper C-L6 under it; faint ghosts are outline only and hidden from
 * VoiceOver (they only shape the shelf).
 */
export function GhostTile({ variant, faint, size, testID }: { variant: GhostVariant; faint: boolean; size: ReelTileSize; testID?: string }) {
  const tokens = useThemedTokens();
  const { width, height } = REEL_TILE_SIZE[size];
  const copy = ghostCopy(variant);
  return (
    <View
      testID={testID}
      accessible={!faint}
      accessibilityLabel={faint ? undefined : copy}
      importantForAccessibility={faint ? "no-hide-descendants" : "yes"}
      accessibilityElementsHidden={faint}
      style={{ gap: 6, opacity: faint ? FAINT_GHOST_OPACITY : 1 }}
    >
      <TileFrame size={size}>
        <View className="border-hairline-strong" style={{ width, height, borderRadius: 4, borderWidth: 1, borderStyle: "dashed", paddingVertical: 10, paddingHorizontal: 8, gap: 8 }}>
          <View className="flex-1 items-center justify-center">
            <User size={28} color={tokens.textTertiary} strokeWidth={1.5} />
          </View>
          {faint ? null : <Text className="font-body text-caption text-ink-2">{copy}</Text>}
        </View>
      </TileFrame>
      <TileCaption meta={!faint && variant === "next_highlight" ? REEL_LANE_COPY.recordingHelper : null} />
    </View>
  );
}

/** A CTA tile (spec 5, 10.2, 10.3): a secondary button, never red, that switches to the Arena tab. */
export function CtaTile({ variant, size, onPress, testID }: { variant: CtaVariant; size: ReelTileSize; onPress: () => void; testID?: string }) {
  const tokens = useThemedTokens();
  const { width, height } = REEL_TILE_SIZE[size];
  const { label, a11y } = ctaCopy(variant);
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={{ gap: 6 }}>
      <TileFrame size={size}>
        <View
          className="bg-surface-3 border-hairline-strong items-center justify-center"
          style={{ width, height, borderRadius: 3, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, gap: 10 }}
        >
          <Swords size={22} color={tokens.textPrimary} />
          <Text className="font-heading text-small uppercase tracking-caps text-ink text-center">{label}</Text>
        </View>
      </TileFrame>
      <TileCaption />
    </Pressable>
  );
}

/** The last Home tile when more reels exist: "See all", switching to the Matches tab. */
export function SeeAllTile({ size, onPress, testID }: { size: ReelTileSize; onPress: () => void; testID?: string }) {
  const tokens = useThemedTokens();
  const { width, height } = REEL_TILE_SIZE[size];
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={SEE_ALL_A11Y} style={{ gap: 6 }}>
      <TileFrame size={size}>
        <View
          className="bg-surface-3 border-hairline items-center justify-center"
          style={{ width, height, borderRadius: 4, borderWidth: 1, gap: 6 }}
        >
          <Text className="font-heading text-small uppercase tracking-caps text-ink">{REEL_LANE_COPY.seeAll}</Text>
          <ChevronRight size={16} color={tokens.textSecondary} />
        </View>
      </TileFrame>
      <TileCaption />
    </Pressable>
  );
}

/** A loading tile: the shared skeleton bar (shimmers inside the carousel's SkeletonProvider). */
export function SkeletonTile({ size, testID }: { size: ReelTileSize; testID?: string }) {
  const { width, height } = REEL_TILE_SIZE[size];
  return (
    <View testID={testID} style={{ gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <TileFrame size={size}>
        <SkeletonBlock width={width} height={height} radius="xs" />
      </TileFrame>
      <TileCaption />
    </View>
  );
}
