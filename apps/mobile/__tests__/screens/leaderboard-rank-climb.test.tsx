/**
 * Rankings rank-up swap flare at screen level (Adding Flare, jits-pddd.5):
 * after a climb, the FIRST painted list frame already shows the old order
 * (never new, then old, then new), then the list swaps to the real order and
 * flares the athlete's rows. A climb is not used up while the screen is not
 * focused.
 */
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";
import { RANK_STORAGE_PREFIX, RANK_SWAP_DELAY_MS } from "@/lib/leaderboard/use-rank-climb";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : stub) },
  );
});
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockFocused = true;
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => mockFocused }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ accentCta: "#E63946" }),
}));
jest.mock("@/components/layout/brand-header", () => ({ BrandHeader: () => null }));
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: "me", gender: "M" },
    isLoading: false,
  }),
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

const mockAthletes = [athlete("Ana", 1), athlete("Mia", 2, true), athlete("Bo", 3), athlete("Cy", 4)];
jest.mock("@/lib/leaderboard/use-leaderboard-data", () => ({
  useLeaderboardData: () => ({
    athletes: mockAthletes,
    gyms: [],
    isLoading: false,
    isRefreshing: false,
    refresh: jest.fn(),
  }),
}));

// Record what each FightersList render was asked to show, then render the real one.
const mockFrames: Array<string | null> = [];
jest.mock("@/components/leaderboard/fighters-list", () => {
  const actual = jest.requireActual("@/components/leaderboard/fighters-list");
  return {
    FightersList: (props: { climb?: { stage: string } | null }) => {
      mockFrames.push(props.climb?.stage ?? null);
      return actual.FightersList(props);
    },
  };
});

import LeaderboardScreen from "@/app/(app)/(tabs)/leaderboard/index";

const KEY = RANK_STORAGE_PREFIX + "me";
const LIST_NAMES = /^(Ana|Mia|Bo|Cy)$/;

beforeEach(async () => {
  mockFrames.length = 0;
  mockFocused = true;
  await AsyncStorage.clear();
});

function listOrder(view: ReturnType<typeof render>) {
  // The sticky footer reads "Mia · You", so it does not match.
  return view.getAllByText(LIST_NAMES).map((n) => n.props.children);
}

it("paints the old order first, then swaps to the new order with the flare", async () => {
  await AsyncStorage.setItem(KEY, "4");
  const view = render(<LeaderboardScreen />);

  await waitFor(() => expect(view.queryAllByText(LIST_NAMES).length).toBe(4));
  // Every list frame so far was the old order: no new-order frame came first.
  expect(mockFrames.length).toBeGreaterThan(0);
  expect(mockFrames.every((f) => f === "old")).toBe(true);
  expect(listOrder(view)).toEqual(["Ana", "Bo", "Cy", "Mia"]);
  expect(view.queryByTestId("rank-flare")).toBeNull();

  await waitFor(() => expect(listOrder(view)).toEqual(["Ana", "Mia", "Bo", "Cy"]), {
    timeout: RANK_SWAP_DELAY_MS + 1000,
  });
  expect(view.getAllByTestId("rank-flare")).toHaveLength(2);
  expect(await AsyncStorage.getItem(KEY)).toBe("2");
});

it("does not use up the climb while the screen is not focused", async () => {
  mockFocused = false;
  await AsyncStorage.setItem(KEY, "4");
  const view = render(<LeaderboardScreen />);
  await waitFor(() => expect(view.queryAllByText(LIST_NAMES).length).toBe(4));
  expect(listOrder(view)).toEqual(["Ana", "Mia", "Bo", "Cy"]);
  await act(async () => {
    await Promise.resolve();
  });
  expect(await AsyncStorage.getItem(KEY)).toBe("4");
  view.unmount();
});
