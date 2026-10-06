/** Viewer preferences: mute (`reels:muted:v1`) and the once-per-install swipe hint (spec 8.3). */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import {
  __resetReelPrefsForTests,
  getReelMuted,
  primeReelMuted,
  REEL_MUTED_KEY,
  REEL_SWIPE_HINT_KEY,
  setReelMuted,
  useReelMuted,
} from "@/lib/highlight/reel-prefs";
import { SWIPE_HINT_MS, useSwipeHint } from "@/lib/highlight/use-swipe-hint";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  __resetReelPrefsForTests();
  await AsyncStorage.clear();
});

describe("mute", () => {
  it("starts with sound when nothing is stored (deck rule)", async () => {
    await primeReelMuted();
    expect(getReelMuted()).toBe(false);
  });

  it("restores the last choice and persists a toggle", async () => {
    await AsyncStorage.setItem(REEL_MUTED_KEY, "1");
    const { result } = renderHook(() => useReelMuted());
    await flush();
    expect(result.current).toBe(true);
    act(() => setReelMuted(false));
    expect(result.current).toBe(false);
    await flush();
    expect(await AsyncStorage.getItem(REEL_MUTED_KEY)).toBe("0");
  });

  it("a storage failure falls back to sound on", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await primeReelMuted();
    expect(getReelMuted()).toBe(false);
  });
});

describe("swipe hint C-V1", () => {
  afterEach(() => jest.useRealTimers());

  it("shows once per install on 2+ pages, marked shown at once, gone after the first swipe", async () => {
    const { result } = renderHook(() => useSwipeHint(3));
    await flush();
    expect(result.current.visible).toBe(true);
    expect(await AsyncStorage.getItem(REEL_SWIPE_HINT_KEY)).toBe("1");
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);

    const again = renderHook(() => useSwipeHint(3));
    await flush();
    expect(again.result.current.visible).toBe(false);
  });

  it("never on a single page", async () => {
    const { result } = renderHook(() => useSwipeHint(1));
    await flush();
    expect(result.current.visible).toBe(false);
    expect(await AsyncStorage.getItem(REEL_SWIPE_HINT_KEY)).toBeNull();
  });

  it("leaves on its own after 4 s", async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useSwipeHint(2));
    await flush();
    expect(result.current.visible).toBe(true);
    act(() => jest.advanceTimersByTime(SWIPE_HINT_MS));
    expect(result.current.visible).toBe(false);
  });

  it("a lane growing to 2 pages shows it then", async () => {
    const { result, rerender } = renderHook(({ n }: { n: number }) => useSwipeHint(n), { initialProps: { n: 1 } });
    await flush();
    expect(result.current.visible).toBe(false);
    rerender({ n: 2 });
    await flush();
    expect(result.current.visible).toBe(true);
  });
});
