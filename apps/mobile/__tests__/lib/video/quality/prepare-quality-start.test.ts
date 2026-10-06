/**
 * Review L5: a hung AsyncStorage costs the first open the 300 ms cap, not
 * every later open.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { START_PREP_MS, __resetQualityStartForTests, prepareQualityStart } from "@/lib/video/quality/use-quality-session";
import { __resetPlaybackQualityPreferenceForTests } from "@/lib/video/quality/preference";
import { __resetPlaybackHistoryForTests } from "@/lib/video/quality/history-store";
import { __resetPlaybackSettingsStoreForTests } from "@/lib/video/quality/settings-store";
import { __resetNetworkStoreForTests } from "@/lib/video/quality/network-store";

beforeEach(() => {
  __resetQualityStartForTests();
  __resetPlaybackQualityPreferenceForTests("auto", false);
  __resetPlaybackHistoryForTests();
  __resetPlaybackSettingsStoreForTests();
  __resetNetworkStoreForTests({ type: "wifi", details: null });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("prepareQualityStart", () => {
  it("waits up to 300 ms once for a hung storage, then not again", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockReturnValue(new Promise(() => undefined));
    jest.useFakeTimers();
    let first = false;
    void prepareQualityStart().then(() => (first = true));
    await Promise.resolve();
    jest.advanceTimersByTime(START_PREP_MS - 1);
    await Promise.resolve();
    expect(first).toBe(false);
    jest.advanceTimersByTime(1);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(first).toBe(true);

    let second = false;
    void prepareQualityStart().then(() => (second = true));
    jest.advanceTimersByTime(0);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(second).toBe(true);
  });

  it("answers with the builtin wifi start when storage is fine", async () => {
    const start = await prepareQualityStart();
    expect(start).toMatchObject({ target: "720", reason: "network_default", networkKey: "wifi", source: "builtin" });
  });
});
