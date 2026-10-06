/**
 * ReelTile memoisation (spec 14): a refetch that changed nothing rebuilds
 * every tile object (`buildLaneTiles`), but no tile redraws; a changed reel
 * redraws only its own tile.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

const mockReadyRenders: string[] = [];
const mockBuildingRenders: string[] = [];
jest.mock("@/components/reels/reel-tile-ready", () => ({
  ReadyTile: ({ item }: { item: { highlightId: string } }) => {
    mockReadyRenders.push(item.highlightId);
    return null;
  },
}));
jest.mock("@/components/reels/reel-tile-building", () => ({
  BuildingTile: ({ reel }: { reel: { matchId: string } }) => {
    mockBuildingRenders.push(reel.matchId);
    return null;
  },
}));

import { ReelTile, sameTileContent } from "@/components/reels/reel-tile";
import { buildLaneTiles, type ReelTileModel } from "@/lib/highlight/reel-lane";
import { reelItem, buildingReel } from "../../support/reel-tile-fixtures";

function List({ tiles, onTilePress }: { tiles: ReelTileModel[]; onTilePress: (t: ReelTileModel) => void }) {
  return (
    <>
      {tiles.map((t) => (
        <ReelTile key={t.key} tile={t} size="home" onTilePress={onTilePress} />
      ))}
    </>
  );
}

beforeEach(() => {
  mockReadyRenders.length = 0;
  mockBuildingRenders.length = 0;
});

it("an unchanged refetch redraws no tile; a changed reel redraws only itself", () => {
  const a = reelItem("a");
  const b = reelItem("b");
  const building = buildingReel("m-1");
  const make = (items = [a, b], inFlight = [building]) =>
    buildLaneTiles({ laneKey: "home", items, building: inFlight, clipsEnabled: true, loading: false, hasMore: false });
  const onTilePress = jest.fn();
  const utils = render(<List tiles={make()} onTilePress={onTilePress} />);
  expect(mockReadyRenders).toEqual(["a", "b"]);
  expect(mockBuildingRenders).toEqual(["m-1"]);

  // New tile and building objects with the same content.
  utils.rerender(<List tiles={make([a, b], [{ ...building }])} onTilePress={onTilePress} />);
  expect(mockReadyRenders).toEqual(["a", "b"]);
  expect(mockBuildingRenders).toEqual(["m-1"]);

  // Reel b was watched (a new item object) and the building reel moved to step 2.
  utils.rerender(<List tiles={make([a, { ...b, unseen: false, version: 2 }], [{ ...building, step: 1, reelState: "planning" }])} onTilePress={onTilePress} />);
  expect(mockReadyRenders).toEqual(["a", "b", "b"]);
  expect(mockBuildingRenders).toEqual(["m-1", "m-1"]);
});

it("sameTileContent compares key, kind and the drawn payload", () => {
  const ghost = (faint: boolean): ReelTileModel => ({ kind: "ghost", key: "g", variant: "next_highlight", faint });
  expect(sameTileContent(ghost(false), ghost(false))).toBe(true);
  expect(sameTileContent(ghost(false), ghost(true))).toBe(false);
  expect(sameTileContent({ kind: "see_all", key: "see_all" }, { kind: "see_all", key: "see_all" })).toBe(true);
  const r = reelItem("a");
  expect(sameTileContent({ kind: "ready", key: "k", item: r }, { kind: "ready", key: "k", item: { ...r } })).toBe(false);
});
