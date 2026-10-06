import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import {
  PLAYBACK_QUALITY_KEY,
  __resetPlaybackQualityPreferenceForTests,
  getPlaybackQualityPreference,
  hydratePlaybackQualityPreference,
  setPlaybackQualityPreference,
  usePlaybackQualityPreference,
} from "@/lib/video/quality/preference";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPlaybackQualityPreferenceForTests("auto", false);
});

describe("playback quality preference", () => {
  it("defaults to auto with nothing stored", async () => {
    await hydratePlaybackQualityPreference();
    expect(getPlaybackQualityPreference()).toBe("auto");
  });

  it.each(["high", "data_saver", "auto"] as const)("hydrates a stored %s", async (v) => {
    await AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, v);
    await hydratePlaybackQualityPreference();
    expect(getPlaybackQualityPreference()).toBe(v);
  });

  it.each(["HIGH", "720", "", "{}"])("an unknown stored value %j reads as auto", async (v) => {
    await AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, v);
    await hydratePlaybackQualityPreference();
    expect(getPlaybackQualityPreference()).toBe("auto");
  });

  it("set saves the value under video-playback:quality", async () => {
    setPlaybackQualityPreference("data_saver");
    expect(getPlaybackQualityPreference()).toBe("data_saver");
    await Promise.resolve();
    expect(await AsyncStorage.getItem(PLAYBACK_QUALITY_KEY)).toBe("data_saver");
  });

  it("a choice made before hydration lands wins over the stored one", async () => {
    await AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, "high");
    const pending = hydratePlaybackQualityPreference();
    setPlaybackQualityPreference("data_saver");
    await pending;
    expect(getPlaybackQualityPreference()).toBe("data_saver");
  });

  it("the hook hydrates on first use and follows changes", async () => {
    await AsyncStorage.setItem(PLAYBACK_QUALITY_KEY, "high");
    const { result } = renderHook(() => usePlaybackQualityPreference());
    expect(result.current).toBe("auto");
    await act(async () => undefined);
    expect(result.current).toBe("high");
    act(() => setPlaybackQualityPreference("auto"));
    expect(result.current).toBe("auto");
  });

  it("a failing read leaves auto and never rejects", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await expect(hydratePlaybackQualityPreference()).resolves.toBeUndefined();
    expect(getPlaybackQualityPreference()).toBe("auto");
  });
});
