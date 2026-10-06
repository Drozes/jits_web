/**
 * useMilestoneCelebration (specs/matches-tab 10.6, AC 6.10, board P-MT-15):
 * load before decide, claim before show, once per athlete per device, one
 * surface only for the first highlight, never during an active match, over a
 * modal or while blurred, the loss exception, Reduce Motion, fail-closed,
 * and `matches.milestone_shown`.
 */
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let mockFocusCleanups: (() => void)[] = [];
let mockFocusCbs: (() => void | (() => void))[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocusCbs.push(cb);
      const clean = cb();
      if (clean) mockFocusCleanups.push(clean);
      return clean;
    }, [cb]);
  },
}));
let mockInMatch = false;
let mockArena: { incoming: unknown; incomingTucked: boolean } = { incoming: null, incomingTucked: false };
let mockMenuOpen = false;
jest.mock("@/lib/arena/arena-store", () => ({
  useIsInArenaMatch: () => mockInMatch,
  useArenaState: () => mockArena,
  useLiveMenuOpen: () => mockMenuOpen,
}));
const mockHaptic = jest.fn(() => Promise.resolve());
jest.mock("@/lib/motion/haptics", () => ({ haptics: { milestone: () => mockHaptic() } }));
const mockCapture = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({ captureMessage: (...a: unknown[]) => mockCapture(...a), addBreadcrumb: jest.fn() }));

import { __setReduceMotionForTests } from "@/lib/motion/use-reduce-motion";
import { __resetMilestonesForTests, milestoneStorageKey, type MilestoneCelebration } from "@/lib/milestones/milestone-store";
import { useMilestoneCelebration, type MilestoneData } from "@/lib/milestones/use-milestone-celebration";

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let seen: { current: MilestoneCelebration | null; dismiss: () => void } = { current: null, dismiss: () => undefined };
function Probe({ surface, athleteId = "ath-1", data }: { surface: "home" | "matches"; athleteId?: string; data: MilestoneData }) {
  const r = useMilestoneCelebration(surface, athleteId, data);
  seen = { current: r.celebration, dismiss: r.dismiss };
  return null;
}

const firstWin: MilestoneData = {
  stats: { wins: 1, losses: 0, draws: 0 },
  newestMatch: { matchId: "m1", completedAt: hoursAgo(1), outcome: "win" },
  newestWin: { matchId: "m1", completedAt: hoursAgo(1) },
  highlights: null,
};
const firstLoss: MilestoneData = {
  stats: { wins: 0, losses: 1, draws: 0 },
  newestMatch: { matchId: "m1", completedAt: hoursAgo(1), outcome: "loss" },
  newestWin: null,
  highlights: null,
};
const oneReel: MilestoneData = {
  highlights: { count: 1, hasMore: false, first: { highlightId: "h1", unseen: true, readyAt: hoursAgo(1) } },
};

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  __resetMilestonesForTests();
  await AsyncStorage.clear();
  mockInMatch = false;
  mockArena = { incoming: null, incomingTucked: false };
  mockMenuOpen = false;
  mockFocusCleanups = [];
  mockFocusCbs = [];
  __setReduceMotionForTests(false);
  seen = { current: null, dismiss: () => undefined };
});

describe("useMilestoneCelebration", () => {
  it("a first match that is also the first win shows only First win, marks both, buzzes and logs", async () => {
    render(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_win"));
    expect(seen.current).toMatchObject({ targetId: "m1", marks: ["first_match", "first_win"], confetti: "brand", particles: true, copy: "First win. That one counts." });
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith("matches.milestone_shown", { level: "info", tags: { milestone: "first_win" } });
    const stored = JSON.parse((await AsyncStorage.getItem(milestoneStorageKey("ath-1"))) ?? "{}");
    expect(Object.keys(stored).sort()).toEqual(["first_match", "first_win"]);
  });

  it("a first match that was a loss: First match, ink-only confetti and no haptic", async () => {
    render(<Probe surface="matches" data={firstLoss} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_match"));
    expect(seen.current?.confetti).toBe("ink");
    expect(seen.current?.haptic).toBe(false);
    expect(mockHaptic).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith("matches.milestone_shown", { level: "info", tags: { milestone: "first_match" } });
  });

  it("fires once per athlete per device: a remount or a later visit shows nothing", async () => {
    const a = render(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current).not.toBeNull());
    a.unmount();
    seen = { current: null, dismiss: () => undefined };
    render(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    // A fresh app run (memory gone) reads the stored marks: still nothing.
    __resetMilestonesForTests();
    render(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("the first highlight celebrates on whichever surface opens first, never both", async () => {
    const home = render(<Probe surface="home" data={oneReel} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_highlight"));
    expect(seen.current?.targetId).toBe("h1");
    home.unmount();
    seen = { current: null, dismiss: () => undefined };
    render(<Probe surface="matches" data={oneReel} />);
    await settle();
    expect(seen.current).toBeNull();
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it("Home never celebrates a first match or a first win", async () => {
    render(<Probe surface="home" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
  });

  it("waits during an active Arena match, then fires on the next clear moment", async () => {
    mockInMatch = true;
    const utils = render(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    expect(await AsyncStorage.getItem(milestoneStorageKey("ath-1"))).toBeNull();
    mockInMatch = false;
    utils.rerender(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_win"));
  });

  it("never over the incoming challenge prompt or the live menu (a tucked prompt is fine)", async () => {
    mockArena = { incoming: { id: "c1" }, incomingTucked: false };
    const utils = render(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    mockArena = { incoming: null, incomingTucked: false };
    mockMenuOpen = true;
    utils.rerender(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    mockMenuOpen = false;
    mockArena = { incoming: { id: "c1" }, incomingTucked: true };
    utils.rerender(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current).not.toBeNull());
  });

  it("never while the surface is blurred (a pushed screen covers it)", async () => {
    render(<Probe surface="matches" data={firstLoss} />);
    // Blur before the async load resolves.
    act(() => mockFocusCleanups.forEach((c) => c()));
    await settle();
    expect(seen.current).toBeNull();
    act(() => {
      mockFocusCbs.forEach((cb) => cb());
    });
    await waitFor(() => expect(seen.current?.milestone).toBe("first_match"));
  });

  it("Reduce Motion: no particles, but the banner and the haptic stay", async () => {
    __setReduceMotionForTests(true);
    render(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current).not.toBeNull());
    expect(seen.current?.particles).toBe(false);
    expect(mockHaptic).toHaveBeenCalledTimes(1);
  });

  it("an event older than 7 days never celebrates", async () => {
    render(
      <Probe
        surface="matches"
        data={{ ...firstWin, newestMatch: { matchId: "m1", completedAt: hoursAgo(24 * 8), outcome: "win" }, newestWin: { matchId: "m1", completedAt: hoursAgo(24 * 8) } }}
      />,
    );
    await settle();
    expect(seen.current).toBeNull();
  });

  it("fails closed when the store cannot be read: nothing shows and nothing is written", async () => {
    // The storage mock's functions are jest.fn already: queue one rejection (no spy, which would drop the mock's implementation on restore).
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    render(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("one celebration per focus: a second due milestone waits for the next focus", async () => {
    const both: MilestoneData = { ...firstWin, highlights: oneReel.highlights };
    const utils = render(<Probe surface="matches" data={both} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_win"));
    act(() => seen.dismiss());
    utils.rerender(<Probe surface="matches" data={both} />);
    await settle();
    expect(seen.current).toBeNull();
    // Blur and focus again: the first highlight now celebrates.
    act(() => mockFocusCleanups.forEach((c) => c()));
    act(() => {
      mockFocusCbs.forEach((cb) => cb());
    });
    await waitFor(() => expect(seen.current?.milestone).toBe("first_highlight"));
  });

  it("the host's own block (a picker open) holds the decision", async () => {
    function Blocked({ blocked }: { blocked: boolean }) {
      const r = useMilestoneCelebration("matches", "ath-1", firstWin, { blocked });
      seen = { current: r.celebration, dismiss: r.dismiss };
      return null;
    }
    const utils = render(<Blocked blocked />);
    await settle();
    expect(seen.current).toBeNull();
    utils.rerender(<Blocked blocked={false} />);
    await waitFor(() => expect(seen.current?.milestone).toBe("first_win"));
  });

  it("dismiss clears the celebration without re-firing it", async () => {
    const utils = render(<Probe surface="matches" data={firstWin} />);
    await waitFor(() => expect(seen.current).not.toBeNull());
    act(() => seen.dismiss());
    utils.rerender(<Probe surface="matches" data={firstWin} />);
    await settle();
    expect(seen.current).toBeNull();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
});
