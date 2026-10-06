import * as React from "react";
import { FlatList, View, type ListRenderItemInfo } from "react-native";
import { useRouter } from "expo-router";
import type { ReelItem, ReelLaneKey } from "@/lib/highlight/reel-types";
import { pagerItems, type ReelTileModel } from "@/lib/highlight/reel-lane";
import { ARENA_HREF } from "@/lib/arena/constants";
import { MATCHES_TAB_HREF } from "@/lib/film-room/href";
import { matchDetailHref } from "@/lib/match-detail/href";
import { MetaTag } from "@/components/ui/elo-system";
import { SkeletonProvider } from "@/components/ui/skeleton";
import { ReelTile } from "./reel-tile";
import { tileColumnWidth, RING_WIDTH, RING_GAP } from "./reel-tile-frame";
import { useReelMoments } from "./use-reel-moments";

export type OpenReelHandler = (items: ReelItem[], startIndex: number, lane: ReelLaneKey) => void;

export interface ReelCarouselProps {
  /** MetaTag title: C-HM3 `Highlights` on Home, C-M2 `Your highlights` on Matches. */
  title: string;
  /** Lane key: tile size, the viewer lane token, and the `testID` suffix (`reel-carousel-<laneKey>`). */
  laneKey: ReelLaneKey;
  /** From `buildLaneTiles`. Empty renders nothing (an empty row is impossible). */
  tiles: ReelTileModel[];
  /**
   * A ready tile was tapped: the lane's ready items in tile order (building,
   * ghost, CTA, See all and skeleton tiles are never pages) and the tapped
   * reel's index in them.
   */
  onOpenReel: OpenReelHandler;
  /** Near the end of the row (load the next page). */
  onEndReached?: () => void;
  /** CTA tile tapped (after the switch to the Arena tab), for the host's empty-state telemetry. */
  onCtaPress?: (tile: Extract<ReelTileModel, { kind: "cta" }>) => void;
  testID?: string;
}

/** Vertical room for the ring pulse (1.04 of a 193 pt frame grows about 4 pt each way). */
const PULSE_ROOM = 4;

/** The row's side gutter is 16 pt to the first poster; the frame's ring and gap take 4 of it. */
const GUTTER = 16 - RING_WIDTH - RING_GAP;

/**
 * The reusable horizontal reel carousel (specs/matches-tab section 5): a
 * MetaTag title, then a snapping row of 9:16 tiles. Tapping a ready tile
 * calls `onOpenReel` with the pager items; a building tile opens match
 * detail (Film status); a CTA tile switches to the Arena tab; See all
 * switches to the Matches tab; ghost and skeleton tiles are not pressable.
 * It plays the reveal and the first-unseen pulse (`useReelMoments`) and emits
 * no telemetry itself (hosts do, in `onOpenReel` / `onCtaPress`).
 */
export function ReelCarousel({ title, laneKey, tiles, onOpenReel, onEndReached, onCtaPress, testID }: ReelCarouselProps) {
  const router = useRouter();
  const moments = useReelMoments(tiles, laneKey);
  const { pulseIds, revealIds, focused } = moments;
  const column = tileColumnWidth(laneKey);

  // Handlers read the latest props through a ref, so the press callback the
  // memoised tiles receive never changes identity.
  const latest = React.useRef({ tiles, onOpenReel, onCtaPress, laneKey, router });
  latest.current = { tiles, onOpenReel, onCtaPress, laneKey, router };
  const onPress = React.useCallback((tile: ReelTileModel) => {
    const { tiles: all, onOpenReel: open, onCtaPress: cta, laneKey: lane, router: r } = latest.current;
    switch (tile.kind) {
      case "ready": {
        const items = pagerItems(all);
        const index = items.findIndex((i) => i.highlightId === tile.item.highlightId);
        if (index >= 0) open(items, index, lane);
        return;
      }
      case "building":
        r.push(matchDetailHref(tile.reel.matchId) as never);
        return;
      case "cta":
        r.navigate(ARENA_HREF as never);
        cta?.(tile);
        return;
      case "see_all":
        // The entry marker lets the Matches tab attribute the open (`matches.tab_opened` entry see_all).
        r.navigate(`${MATCHES_TAB_HREF}?entry=see_all` as never);
        return;
      default:
        return;
    }
  }, []);

  const renderItem = React.useCallback(
    ({ item: tile }: ListRenderItemInfo<ReelTileModel>) => {
      const id = tile.kind === "ready" ? tile.item.highlightId : null;
      return (
        <ReelTile
          tile={tile}
          size={laneKey}
          onTilePress={onPress}
          pulse={id ? pulseIds.has(id) : false}
          reveal={id ? revealIds.has(id) : false}
          animate={focused}
          testID={`reel-tile-${tile.key}`}
        />
      );
    },
    [laneKey, onPress, pulseIds, revealIds, focused],
  );

  if (tiles.length === 0) return null;
  const loading = tiles.some((t) => t.kind === "skeleton");

  const row = (
    <FlatList
      horizontal
      data={tiles}
      keyExtractor={(t) => t.key}
      renderItem={renderItem}
      extraData={moments}
      accessibilityRole="list"
      accessibilityLabel={title}
      showsHorizontalScrollIndicator={false}
      snapToInterval={column}
      decelerationRate="fast"
      getItemLayout={(_d, index) => ({ length: column, offset: GUTTER + column * index, index })}
      // PULSE_ROOM above and below so the 1.04 ring pulse is never clipped by the
      // row's bounds (Android clips a ScrollView's children); cells never clip.
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingVertical: PULSE_ROOM }}
      style={{ overflow: "visible" }}
      removeClippedSubviews={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      // Home holds at most 10 reels plus building and See all tiles: draw them all.
      initialNumToRender={laneKey === "home" ? 14 : 6}
      windowSize={5}
      scrollEnabled={!loading}
    />
  );

  return (
    <View testID={testID ?? `reel-carousel-${laneKey}`} style={{ gap: 10 - PULSE_ROOM, marginHorizontal: -16 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <MetaTag>{title}</MetaTag>
      </View>
      {loading ? <SkeletonProvider>{row}</SkeletonProvider> : row}
    </View>
  );
}
