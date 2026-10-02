/**
 * Rank-up swap flare state (Adding Flare, jits-pddd.5): once per climb, from
 * the last-seen rank stored on the device. A first visit, a drop or an
 * unchanged rank never flares; Reduce Motion stores the rank but shows no
 * climb.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  orderBeforeClimb,
  RANK_STORAGE_PREFIX,
  RANK_SWAP_DELAY_MS,
  RANK_SWAP_MS,
  RANK_FLARE_MS,
  useRankClimb,
} from "@/lib/leaderboard/use-rank-climb";
import type { RankedAthlete } from "@/lib/leaderboard/use-leaderboard-data";
import { __setReduceMotionForTests } from "@/lib/motion";

const KEY = RANK_STORAGE_PREFIX + "me";

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

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  act(() => __setReduceMotionForTests(false));
});

async function mount(rank: number | null) {
  const hook = renderHook(({ r }: { r: number | null }) => useRankClimb("me", r), {
    initialProps: { r: rank },
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

it("stores the rank on a first visit without a climb", async () => {
  const hook = await mount(4);
  expect(hook.result.current.climb).toBeNull();
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("4"));
});

it("reports a climb from the stored rank, once, then stores the new rank", async () => {
  await AsyncStorage.setItem(KEY, "5");
  const hook = await mount(3);
  expect(hook.result.current.climb).toEqual({ from: 5, to: 3, stage: "old" });
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("3"));

  // A re-render with the same rank keeps the one climb going, not a new one.
  hook.rerender({ r: 3 });
  expect(hook.result.current.climb).toEqual({ from: 5, to: 3, stage: "old" });

  await waitFor(
    () => expect(hook.result.current.climb?.stage).toBe("swapped"),
    { timeout: RANK_SWAP_DELAY_MS + 1000 },
  );
  await waitFor(() => expect(hook.result.current.climb).toBeNull(), {
    timeout: RANK_SWAP_MS + RANK_FLARE_MS + 1000,
  });

  // Reopening with the same rank: no replay.
  hook.unmount();
  const again = await mount(3);
  expect(again.result.current.climb).toBeNull();
});

it("does not flare on a drop, but stores the new rank", async () => {
  await AsyncStorage.setItem(KEY, "2");
  const hook = await mount(6);
  expect(hook.result.current.climb).toBeNull();
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("6"));
});

it("shows no climb under Reduce Motion, and still stores the rank", async () => {
  act(() => __setReduceMotionForTests(true));
  await AsyncStorage.setItem(KEY, "9");
  const hook = await mount(1);
  expect(hook.result.current.climb).toBeNull();
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("1"));
});

it("leaves the stored rank alone while the athlete is not ranked", async () => {
  await AsyncStorage.setItem(KEY, "7");
  const hook = await mount(null);
  expect(hook.result.current.climb).toBeNull();
  expect(await AsyncStorage.getItem(KEY)).toBe("7");
});

it("orderBeforeClimb puts the athlete back and the passed athletes one place up", () => {
  const now = [athlete("a", 1), athlete("me", 2, true), athlete("b", 3), athlete("c", 4), athlete("d", 5)];
  const before = orderBeforeClimb(now, { from: 4, to: 2 });
  expect(before.map((x) => [x.id, x.rank])).toEqual([
    ["a", 1],
    ["b", 2],
    ["c", 3],
    ["me", 4],
    ["d", 5],
  ]);
});

it("orderBeforeClimb works on a filtered list", () => {
  // b (rank 3) is filtered out; c was passed.
  const now = [athlete("a", 1), athlete("me", 2, true), athlete("c", 4), athlete("d", 5)];
  const before = orderBeforeClimb(now, { from: 4, to: 2 });
  expect(before.map((x) => x.id)).toEqual(["a", "c", "me", "d"]);
});
