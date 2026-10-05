/**
 * The persisted live choice (review rounds 3 and 4): `{ live, at, confirmed }`,
 * the arrival decision it drives, and account deletion.
 *
 * Source: apps/mobile/lib/arena/live-intent-persist.ts
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetPersistedLiveIntentForTests,
  arrivalDecision,
  clearAllPersistedLiveIntents,
  confirmPersistedOffline,
  loadPersistedLiveIntent,
  loadPersistedLiveIntentBounded,
  peekPersistedLiveIntent,
  persistLiveIntent,
} from "@/lib/arena/live-intent-persist";

beforeEach(async () => {
  __resetPersistedLiveIntentForTests();
  await AsyncStorage.clear();
});

describe("persisted live choice", () => {
  it("an offline choice is unconfirmed until a false lands; a live choice is never confirmed", async () => {
    persistLiveIntent("a", false);
    expect(peekPersistedLiveIntent("a")).toMatchObject({ live: false, confirmed: false });
    confirmPersistedOffline("a");
    expect(peekPersistedLiveIntent("a")).toMatchObject({ live: false, confirmed: true });
    persistLiveIntent("a", true);
    confirmPersistedOffline("a");
    expect(peekPersistedLiveIntent("a")).toMatchObject({ live: true, confirmed: false });
  });

  it("survives a relaunch (storage), and reads the round 3 plain values as unconfirmed", async () => {
    persistLiveIntent("a", false);
    confirmPersistedOffline("a");
    await Promise.resolve();
    __resetPersistedLiveIntentForTests();
    expect(peekPersistedLiveIntent("a")).toBeUndefined();
    expect(await loadPersistedLiveIntent("a")).toMatchObject({ live: false, confirmed: true });
    await AsyncStorage.setItem("arena-live-intent.b", "offline");
    expect(await loadPersistedLiveIntent("b")).toEqual({ live: false, at: 0, confirmed: false });
  });

  it("arrival with the server live: clear only an unconfirmed offline choice", () => {
    expect(arrivalDecision(null)).toBe("restore");
    expect(arrivalDecision(undefined)).toBe("restore");
    expect(arrivalDecision({ live: true, at: 1, confirmed: false })).toBe("restore");
    expect(arrivalDecision({ live: false, at: 1, confirmed: false })).toBe("clear");
    // Its clear landed: the server's `true` is a newer session (web): adopted.
    expect(arrivalDecision({ live: false, at: 1, confirmed: true })).toBe("restore");
  });

  it("a hung storage read is given up after the bound (unknown)", async () => {
    jest.useFakeTimers();
    try {
      const spy = jest.spyOn(AsyncStorage, "getItem").mockReturnValue(new Promise(() => undefined));
      const p = loadPersistedLiveIntentBounded("c", 1_000);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await p).toBeNull();
      spy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it("account deletion forgets every stored choice, and nothing is recorded for them again", async () => {
    persistLiveIntent("a", true);
    await AsyncStorage.setItem("arena-live-intent.z", "live");
    await clearAllPersistedLiveIntents();
    expect(await AsyncStorage.getItem("arena-live-intent.a")).toBeFalsy();
    expect(await AsyncStorage.getItem("arena-live-intent.z")).toBeFalsy();
    // Sign-out after the deletion records an offline choice: ignored.
    persistLiveIntent("a", false);
    expect(peekPersistedLiveIntent("a")).toBeUndefined();
  });
});
