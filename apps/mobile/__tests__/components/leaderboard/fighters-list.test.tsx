/**
 * FightersList motion (Adding Flare, jits-pddd.5): rows take the screen's
 * first-load stagger; a climb renders the old order (with old ranks), then
 * the real order with the flare on the athlete's list row and sticky footer.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { FightersList } from "@/components/leaderboard/fighters-list";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ accentCta: "#E63946" }),
}));

function athlete(id: string, rank: number, me = false): RankedAthlete {
  return {
    id,
    rank,
    displayName: id,
    currentElo: 2000 - rank,
    wins: 0,
    losses: 0,
    isCurrentUser: me,
    gender: "M",
  };
}

const list = [athlete("Ana", 1), athlete("Mia", 2, true), athlete("Bo", 3), athlete("Cy", 4)];
const me = list[1];

function names(view: ReturnType<typeof render>) {
  return view.getAllByText(/^(Ana|Mia|Bo|Cy)$/).map((n) => n.props.children);
}

it("asks the stagger for each rendered row index", () => {
  const entering = jest.fn(() => undefined);
  render(
    <FightersList athletes={list} isRefreshing={false} onRefresh={jest.fn()} currentUser={me} entering={entering} />,
  );
  expect(entering.mock.calls.map((c) => (c as unknown[])[0])).toEqual([0, 1, 2, 3]);
});

it("renders without a flare when there is no climb", () => {
  const view = render(
    <FightersList athletes={list} isRefreshing={false} onRefresh={jest.fn()} currentUser={me} />,
  );
  expect(names(view)).toEqual(["Ana", "Mia", "Bo", "Cy"]);
  expect(view.queryByTestId("rank-flare")).toBeNull();
});

it("renders the old order and old ranks before the swap", () => {
  const view = render(
    <FightersList
      athletes={list}
      isRefreshing={false}
      onRefresh={jest.fn()}
      currentUser={me}
      climb={{ from: 4, to: 2, stage: "old" }}
    />,
  );
  expect(names(view)).toEqual(["Ana", "Bo", "Cy", "Mia"]);
  // Mia shows 04 in the list and in the sticky footer; Bo and Cy one up.
  expect(view.getAllByText("04")).toHaveLength(2);
  expect(view.getByText("02")).toBeTruthy();
  expect(view.queryByTestId("rank-flare")).toBeNull();
});

it("swaps to the real order and flares the athlete's rows", () => {
  const view = render(
    <FightersList
      athletes={list}
      isRefreshing={false}
      onRefresh={jest.fn()}
      currentUser={me}
      climb={{ from: 4, to: 2, stage: "swapped" }}
    />,
  );
  expect(names(view)).toEqual(["Ana", "Mia", "Bo", "Cy"]);
  expect(view.getAllByTestId("rank-flare")).toHaveLength(2);
});
