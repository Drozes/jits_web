import AsyncStorage from "@react-native-async-storage/async-storage";
import { __resetSeenMatches, isMatchSeen, loadSeenMatches, markMatchSeen, SEEN_STORAGE_KEY } from "@/lib/film-room/seen-store";

beforeEach(async () => {
  __resetSeenMatches();
  await AsyncStorage.clear();
});

describe("seen store", () => {
  it("persists marked matches and reads them back", async () => {
    markMatchSeen("m-1");
    expect(isMatchSeen("m-1")).toBe(true);
    await Promise.resolve();
    expect(JSON.parse((await AsyncStorage.getItem(SEEN_STORAGE_KEY)) ?? "[]")).toEqual(["m-1"]);

    __resetSeenMatches();
    expect(isMatchSeen("m-1")).toBe(false);
    await loadSeenMatches();
    expect(isMatchSeen("m-1")).toBe(true);
  });

  it("keeps marks made before the stored set finished loading", async () => {
    await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(["old"]));
    const loading = loadSeenMatches();
    markMatchSeen("fresh");
    await loading;
    expect(isMatchSeen("old")).toBe(true);
    expect(isMatchSeen("fresh")).toBe(true);
  });

  it("survives junk in storage", async () => {
    await AsyncStorage.setItem(SEEN_STORAGE_KEY, "{not json");
    await loadSeenMatches();
    expect(isMatchSeen("anything")).toBe(false);
  });
});
