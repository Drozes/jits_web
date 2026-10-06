/** Viewer swipe hint flag (specs/matches-tab 8): once per install, 2+ pages only. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetSwipeHint,
  hasSeenSwipeHint,
  markSwipeHintShown,
  shouldShowSwipeHint,
  SWIPE_HINT_STORAGE_KEY,
} from "@/lib/highlight/swipe-hint";

beforeEach(async () => {
  __resetSwipeHint();
  await AsyncStorage.clear();
});

describe("swipe hint", () => {
  it("shows on a fresh install with 2 or more pages, never with fewer", async () => {
    expect(await shouldShowSwipeHint(2)).toBe(true);
    expect(await shouldShowSwipeHint(1)).toBe(false);
    expect(await shouldShowSwipeHint(0)).toBe(false);
  });

  it("shows once: marking persists under reels:swipe-hint:v1 and survives a restart", async () => {
    expect(SWIPE_HINT_STORAGE_KEY).toBe("reels:swipe-hint:v1");
    markSwipeHintShown();
    expect(await shouldShowSwipeHint(5)).toBe(false);
    await Promise.resolve();
    __resetSwipeHint();
    expect(await AsyncStorage.getItem(SWIPE_HINT_STORAGE_KEY)).not.toBeNull();
    expect(await hasSeenSwipeHint()).toBe(true);
  });

  it("a mark made while the read is in flight wins", async () => {
    const pending = hasSeenSwipeHint();
    markSwipeHintShown();
    expect(await pending).toBe(true);
  });

  it("an unreadable store reads as already shown", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("io"));
    expect(await shouldShowSwipeHint(3)).toBe(false);
  });

  it("writes once", async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    markSwipeHintShown();
    markSwipeHintShown();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
