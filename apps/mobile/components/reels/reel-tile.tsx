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
  /** False while the host screen is blurred (pauses the building shimmer). Default true. */
  animate?: boolean;
  testID?: string;
}

/**
 * One 9:16 reel tile of any kind (specs/matches-tab section 5): `ready`,
 * `building`, `ghost`, `cta`, `see_all` or `skeleton`. Memoised: a carousel
 * re-render only redraws tiles whose model, pulse or reveal changed
 * (`useReelLane` keeps unchanged reels' objects stable).
 */
function ReelTileImpl({ tile, size, onTilePress, pulse, reveal, animate, testID }: ReelTileProps) {
  const press = React.useCallback(() => onTilePress(tile), [onTilePress, tile]);
  switch (tile.kind) {
    case "ready":
      return <ReadyTile item={tile.item} size={size} pulse={pulse} reveal={reveal} onPress={press} testID={testID} />;
    case "building":
      return <BuildingTile reel={tile.reel} size={size} onPress={press} animate={animate} testID={testID} />;
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

/**
 * Same tile content. `buildLaneTiles` makes new tile objects on every
 * refetch, so identity alone would redraw every tile: compare by key and
 * kind, then the payload (`useReelLane` keeps an unchanged `ReelItem` object
 * stable; a building reel compares the fields it draws).
 */
export function sameTileContent(a: ReelTileModel, b: ReelTileModel): boolean {
  if (a === b) return true;
  if (a.key !== b.key || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "ready":
      return a.item === (b as typeof a).item;
    case "building": {
      const x = a.reel;
      const y = (b as typeof a).reel;
      return (
        x.reelState === y.reelState &&
        x.step === y.step &&
        x.waitDeadlineAt === y.waitDeadlineAt &&
        x.serverNow === y.serverNow &&
        x.receivedAt === y.receivedAt &&
        x.posterUrl === y.posterUrl &&
        x.opponentName === y.opponentName
      );
    }
    case "ghost":
      return a.variant === (b as typeof a).variant && a.faint === (b as typeof a).faint;
    case "cta":
      return a.variant === (b as typeof a).variant;
    default:
      return true;
  }
}

function sameProps(a: ReelTileProps, b: ReelTileProps): boolean {
  return (
    a.size === b.size &&
    a.onTilePress === b.onTilePress &&
    !!a.pulse === !!b.pulse &&
    !!a.reveal === !!b.reveal &&
    (a.animate ?? true) === (b.animate ?? true) &&
    a.testID === b.testID &&
    sameTileContent(a.tile, b.tile)
  );
}

export const ReelTile = React.memo(ReelTileImpl, sameProps);
