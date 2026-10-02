/**
 * Play-once persistence (Adding Flare, jits-pddd.4 review): result moments
 * play once per result across app restarts.
 *
 * - The keys live in one AsyncStorage entry (`motion:played:v1`, key ->
 *   epoch ms), loaded at import without awaiting and written through.
 * - The map keeps only the newest PLAYED_CAP keys.
 * - The recency guard: an old result is not fresh unless this athlete just
 *   confirmed it here; an unknown completion time counts as fresh.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("persisted played keys", () => {
  it("a key already in storage at launch has played", async () => {
    await AsyncStorage.setItem("motion:played:v1", JSON.stringify({ "verdict:M9": 1 }));
    let mod: typeof import("@/components/ui/elo-system/play-once") | undefined;
    jest.isolateModules(() => {
      mod = require("@/components/ui/elo-system/play-once");
    });
    await mod!.playedLoaded;
    expect(mod!.hasPlayed("verdict:M9")).toBe(true);
    expect(mod!.hasPlayed("verdict:M10")).toBe(false);
  });

  it("writes new keys through, newest PLAYED_CAP only", async () => {
    let mod: typeof import("@/components/ui/elo-system/play-once") | undefined;
    jest.isolateModules(() => {
      mod = require("@/components/ui/elo-system/play-once");
    });
    await mod!.playedLoaded;
    const now = jest.spyOn(Date, "now");
    for (let i = 0; i < mod!.PLAYED_CAP + 5; i++) {
      now.mockReturnValue(1_000 + i);
      mod!.markPlayed(`k${i}`);
    }
    now.mockRestore();
    await Promise.resolve();
    const stored = JSON.parse((await AsyncStorage.getItem(mod!.PLAYED_STORAGE_KEY)) ?? "{}");
    expect(Object.keys(stored)).toHaveLength(mod!.PLAYED_CAP);
    expect(stored.k0).toBeUndefined();
    expect(stored[`k${mod!.PLAYED_CAP + 4}`]).toBe(1_000 + mod!.PLAYED_CAP + 4);
  });
});

describe("isResultFresh", () => {
  it("fresh within five minutes, or when confirmed here, or when unknown", () => {
    const { isResultFresh, markResultFresh, RESULT_FRESH_MS } = require("@/components/ui/elo-system/play-once");
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(isResultFresh("A", "2026-10-01T11:58:00Z", now)).toBe(true);
    expect(isResultFresh("A", new Date(now - RESULT_FRESH_MS - 1).toISOString(), now)).toBe(false);
    expect(isResultFresh("A", null, now)).toBe(true);
    markResultFresh("B");
    expect(isResultFresh("B", "2026-09-01T00:00:00Z", now)).toBe(true);
  });
});
