/**
 * The waiting challenger's `arena` reading (location-flag follow-up M1): it
 * starts with a foregrounded, pending/accepted outgoing challenge (flag on,
 * not in a match), repeats every 60 s, fires again on foreground, and stops
 * with the challenge, the flag or the background. Without permission it asks
 * once per session from the waiting state, with the explain copy first.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

const mockPermission = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
}));
const mockArenaReading = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock("@/lib/arena/arena-presence", () => ({
  reportArenaReading: (...a: unknown[]) => mockArenaReading(...a),
}));
const mockExplain = jest.fn();
const mockClose = jest.fn();
jest.mock("@/lib/arena/go-live-location", () => ({
  explainArenaLocation: () => mockExplain(),
  closeLocationSheet: () => mockClose(),
}));

import {
  CHALLENGER_READING_REFRESH_MS,
  __resetChallengerArenaReadingForTests,
  useChallengerArenaReading,
} from "@/lib/arena/use-challenger-arena-reading";

let appStateHandlers: ((s: string) => void)[] = [];

function setAppState(s: string) {
  Object.defineProperty(AppState, "currentState", { value: s, configurable: true });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  __resetChallengerArenaReadingForTests();
  setAppState("active");
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return {
      remove: () => {
        appStateHandlers = appStateHandlers.filter((x) => x !== h);
      },
    };
  }) as never);
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function mount(initial: { id: string | null; active: boolean }) {
  return renderHook(
    ({ id, active }: { id: string | null; active: boolean }) => useChallengerArenaReading(id, active),
    { initialProps: initial },
  );
}

describe("useChallengerArenaReading", () => {
  it("reports at once, then every 60 s, silently (never asks)", async () => {
    mount({ id: "ch-1", active: true });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(1);
    expect(mockArenaReading).toHaveBeenLastCalledWith("ch-1", { ask: false });
    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS);
    });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(2);
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it("stops when the challenge clears or the flag goes off", async () => {
    const r = mount({ id: "ch-1", active: true });
    await flush();
    r.rerender({ id: null, active: true });
    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS * 3);
    });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(1);

    r.rerender({ id: "ch-2", active: false });
    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS * 3);
    });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a challenge or with the flag off", async () => {
    mount({ id: null, active: true });
    mount({ id: "ch-1", active: false });
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS);
    });
    await flush();
    expect(mockArenaReading).not.toHaveBeenCalled();
  });

  it("skips ticks in the background and reports at once on foreground", async () => {
    mount({ id: "ch-1", active: true });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(1);
    setAppState("background");
    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS * 2);
    });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(1);
    setAppState("active");
    await act(async () => {
      for (const h of appStateHandlers) h("active");
    });
    await flush();
    expect(mockArenaReading).toHaveBeenCalledTimes(2);
  });

  it("a new challenge reports for that challenge", async () => {
    const r = mount({ id: "ch-1", active: true });
    await flush();
    r.rerender({ id: "ch-2", active: true });
    await flush();
    expect(mockArenaReading).toHaveBeenLastCalledWith("ch-2", { ask: false });
  });

  it("without permission: explains once, then asks; never again this session", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockExplain.mockResolvedValue(true);
    const r = mount({ id: "ch-1", active: true });
    await flush();
    expect(mockExplain).toHaveBeenCalledTimes(1);
    expect(mockArenaReading).toHaveBeenCalledWith("ch-1", { ask: true });
    expect(mockClose).toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(CHALLENGER_READING_REFRESH_MS);
    });
    r.rerender({ id: "ch-2", active: true });
    await flush();
    expect(mockExplain).toHaveBeenCalledTimes(1);
    expect(mockArenaReading).toHaveBeenCalledTimes(1);
  });

  it("Not now on the explain sends nothing", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    mockExplain.mockResolvedValue(false);
    mount({ id: "ch-1", active: true });
    await flush();
    expect(mockExplain).toHaveBeenCalledTimes(1);
    expect(mockArenaReading).not.toHaveBeenCalled();
  });

  it("permanently denied: never explains, never reads", async () => {
    mockPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    mount({ id: "ch-1", active: true });
    await flush();
    expect(mockExplain).not.toHaveBeenCalled();
    expect(mockArenaReading).not.toHaveBeenCalled();
  });
});
