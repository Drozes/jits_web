import * as React from "react";
import { Text, View } from "react-native";
import type { ReelLaneKey } from "@/lib/highlight/reel-types";

/**
 * Tile geometry (specs/matches-tab section 5, boards P-MT-05 and P-MT-14):
 * a 9:16 poster, Home 104 x 185, Matches 96 x 171. Every tile sits in a
 * frame of a 2 px ring stroke plus a 2 px surface gap on each side, so a
 * frame is 8 pt wider and taller than its poster; frames abut, which leaves
 * the spec's 8 pt gap between posters. The ring is drawn only on an unseen
 * ready tile (`unseen-ring` token); every other frame is transparent, so all
 * tiles line up.
 */
export type ReelTileSize = ReelLaneKey;

export const REEL_TILE_SIZE: Record<ReelTileSize, { width: number; height: number }> = {
  home: { width: 104, height: 185 },
  matches: { width: 96, height: 171 },
};

/** Ring stroke and the surface gap inside it. */
export const RING_WIDTH = 2;
export const RING_GAP = 2;
const FRAME_INSET = RING_WIDTH + RING_GAP;

/** Width of one tile column, frame included (the carousel's snap interval). */
export function tileColumnWidth(size: ReelTileSize): number {
  return REEL_TILE_SIZE[size].width + FRAME_INSET * 2;
}

/** The ring frame around a poster. `ring` draws the unseen ring in `border-unseen-ring`. */
export function TileFrame({ size, ring, children }: { size: ReelTileSize; ring?: boolean; children: React.ReactNode }) {
  const { width, height } = REEL_TILE_SIZE[size];
  return (
    <View
      testID={ring ? "reel-tile-ring" : undefined}
      className={ring ? "border-unseen-ring" : undefined}
      style={[
        { width: width + FRAME_INSET * 2, height: height + FRAME_INSET * 2, padding: RING_GAP, borderWidth: RING_WIDTH, borderRadius: 6 },
        ring ? null : { borderColor: "transparent" },
      ]}
    >
      <View style={{ width, height, borderRadius: 4, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

/** Caption block under a tile (the column's full width): an optional name line and an optional mono meta line. */
export function TileCaption({ title, meta }: { title?: string | null; meta?: string | null }) {
  return (
    <View style={{ paddingHorizontal: 4, minHeight: 30, gap: 2 }}>
      {title ? (
        <Text className="font-heading text-small text-ink" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {meta ? (
        <Text className="font-mono-medium text-micro text-ink-3 tracking-caps tabular-nums">{meta}</Text>
      ) : null}
    </View>
  );
}
