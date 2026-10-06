import * as React from "react";
import type { ReelTileModel } from "@/lib/highlight/reel-lane";
import type { ReelTileSize } from "./reel-tile-frame";
import { ReadyTile } from "./reel-tile-ready";
import { BuildingTile } from "./reel-tile-building";
import { CtaTile, GhostTile, SeeAllTile, SkeletonTile } from "./reel-tile-placeholders";

export interface ReelTileProps {
  tile: ReelTileModel;
  size: ReelTileSize;
  /** Stable across renders (memoised tiles): receives the tile that was pressed. Ghost and skeleton tiles never call it. */
  onTilePress: (tile: ReelTileModel) => void;
  /** Ready tiles only: run one ring pulse (`moment.reelRingPulse`). */
  pulse?: boolean;
  /** Ready tiles only: fade in (a building tile just landed). */
  reveal?: boolean;
  testID?: string;
}

/**
 * One 9:16 reel tile of any kind (specs/matches-tab section 5): `ready`,
 * `building`, `ghost`, `cta`, `see_all` or `skeleton`. Memoised: a carousel
 * re-render only redraws tiles whose model, pulse or reveal changed
 * (`useReelLane` keeps unchanged reels' objects stable).
 */
function ReelTileImpl({ tile, size, onTilePress, pulse, reveal, testID }: ReelTileProps) {
  const press = React.useCallback(() => onTilePress(tile), [onTilePress, tile]);
  switch (tile.kind) {
    case "ready":
      return <ReadyTile item={tile.item} size={size} pulse={pulse} reveal={reveal} onPress={press} testID={testID} />;
    case "building":
      return <BuildingTile reel={tile.reel} size={size} onPress={press} testID={testID} />;
    case "ghost":
      return <GhostTile variant={tile.variant} faint={tile.faint} size={size} testID={testID} />;
    case "cta":
      return <CtaTile variant={tile.variant} size={size} onPress={press} testID={testID} />;
    case "see_all":
      return <SeeAllTile size={size} onPress={press} testID={testID} />;
    case "skeleton":
      return <SkeletonTile size={size} testID={testID} />;
  }
}

export const ReelTile = React.memo(ReelTileImpl);
