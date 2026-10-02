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
  RANK_READ_TIMEOUT_MS,
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

type Props = { r: number | null; on?: boolean };

async function mount(rank: number | null, enabled = true) {
  const hook = renderHook(({ r, on = true }: Props) => useRankClimb("me", r, on), {
    initialProps: { r: rank, on: enabled } as Props,
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
  hook.rerender({ r: 3, on: true });
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

it("does not detect, store or use up a climb while disabled (unseen)", async () => {
  await AsyncStorage.setItem(KEY, "5");
  const hook = await mount(3, false);
  expect(hook.result.current.climb).toBeNull();
  // Give a stray write a chance to land.
  await act(async () => {
    await Promise.resolve();
  });
  expect(await AsyncStorage.getItem(KEY)).toBe("5");

  // The fighters list comes on screen: now it plays.
  hook.rerender({ r: 3, on: true });
  expect(hook.result.current.climb).toEqual({ from: 5, to: 3, stage: "old" });
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("3"));
});

it("a further climb mid-climb starts again from the reached rank", async () => {
  await AsyncStorage.setItem(KEY, "6");
  const hook = await mount(4);
  expect(hook.result.current.climb).toEqual({ from: 6, to: 4, stage: "old" });
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("4"));
  hook.rerender({ r: 2, on: true });
  expect(hook.result.current.climb).toEqual({ from: 4, to: 2, stage: "old" });
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("2"));
  expect(hook.result.current.climb).toEqual({ from: 4, to: 2, stage: "old" });
});

it("a drop mid-climb ends the climb", async () => {
  await AsyncStorage.setItem(KEY, "6");
  const hook = await mount(4);
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("4"));
  hook.rerender({ r: 8, on: true });
  await waitFor(() => expect(hook.result.current.climb).toBeNull());
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("8"));
});

it("an unreadable store is ready at once with no climb, and sets the baseline", async () => {
  await AsyncStorage.setItem(KEY, "9");
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error("boom")));
  const hook = await mount(2);
  expect(hook.result.current.climb).toBeNull();
  await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe("2"));
});

it("a hanging read times out: ready, no climb, current rank becomes the baseline", async () => {
  jest.useFakeTimers();
  await AsyncStorage.setItem(KEY, "9");
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
    () => new Promise<string | null>(() => undefined),
  );
  const hook = renderHook(() => useRankClimb("me", 2, true));
  expect(hook.result.current.ready).toBe(false);
  await act(async () => {
    jest.advanceTimersByTime(RANK_READ_TIMEOUT_MS - 1);
  });
  expect(hook.result.current.ready).toBe(false);
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(hook.result.current.ready).toBe(true);
  expect(hook.result.current.climb).toBeNull();
  await act(async () => {
    await Promise.resolve();
  });
  expect(await AsyncStorage.getItem(KEY)).toBe("2");
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
