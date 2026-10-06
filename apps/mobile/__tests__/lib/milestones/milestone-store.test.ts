/**
 * Milestones (specs/matches-tab 10.6): once per athlete per device, 7 day
 * freshness, Home suppresses Matches, the loss exception, first match that
 * is also the first win, Reduce Motion, and the active-match guard.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  __resetMilestonesForTests,
  claimMilestone,
  decideMilestone,
  loadMilestones,
  milestoneLoadState,
  milestoneStorageKey,
  MILESTONE_COPY,
  MILESTONE_FRESH_MS,
  seenMilestones,
  type MilestoneId,
  type MilestoneInputs,
} from "@/lib/milestones/milestone-store";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const none: ReadonlySet<MilestoneId> = new Set();

function matches(over: Partial<MilestoneInputs> = {}): MilestoneInputs {
  return {
    surface: "matches",
    now: NOW,
    inActiveMatch: false,
    stats: { wins: 0, losses: 1, draws: 0 },
    newestMatch: { matchId: "m1", completedAt: iso(NOW - HOUR), outcome: "loss" },
    newestWin: null,
    highlights: null,
    ...over,
  };
}

beforeEach(async () => {
  __resetMilestonesForTests();
  await AsyncStorage.clear();
});

describe("decideMilestone", () => {
  it("first match that is a loss: no haptic, ink-only confetti, unchanged copy", () => {
    expect(decideMilestone(matches(), none)).toEqual({
      milestone: "first_match",
      marks: ["first_match"],
      copy: MILESTONE_COPY.first_match,
      targetId: "m1",
      haptic: false,
      confetti: "ink",
      particles: true,
    });
  });

  it("first match that is a draw celebrates with the haptic and brand confetti", () => {
    const c = decideMilestone(matches({ stats: { wins: 0, losses: 0, draws: 1 }, newestMatch: { matchId: "m1", completedAt: iso(NOW - HOUR), outcome: "draw" } }), none);
    expect(c).toMatchObject({ milestone: "first_match", haptic: true, confetti: "brand" });
  });

  it("first match that is also the first win: only the First win banner, both marked together", () => {
    const c = decideMilestone(
      matches({ stats: { wins: 1, losses: 0, draws: 0 }, newestMatch: { matchId: "m1", completedAt: iso(NOW - HOUR), outcome: "win" } }),
      none,
    );
    expect(c).toMatchObject({ milestone: "first_win", marks: ["first_match", "first_win"], copy: MILESTONE_COPY.first_win, haptic: true, confetti: "brand" });
  });

  it("a later first win celebrates on its own card", () => {
    const c = decideMilestone(
      matches({ stats: { wins: 1, losses: 3, draws: 0 }, newestWin: { matchId: "w1", completedAt: iso(NOW - 2 * HOUR) } }),
      new Set<MilestoneId>(["first_match"]),
    );
    expect(c).toMatchObject({ milestone: "first_win", marks: ["first_win"], targetId: "w1" });
  });

  it("freshness guard: an event older than 7 days never celebrates", () => {
    const old = iso(NOW - MILESTONE_FRESH_MS - 1);
    expect(decideMilestone(matches({ newestMatch: { matchId: "m1", completedAt: old, outcome: "loss" } }), none)).toBeNull();
    expect(
      decideMilestone(matches({ stats: { wins: 1, losses: 2, draws: 0 }, newestWin: { matchId: "w", completedAt: old } }), new Set<MilestoneId>(["first_match"])),
    ).toBeNull();
    expect(decideMilestone(matches({ newestMatch: { matchId: "m1", completedAt: null, outcome: "loss" } }), none)).toBeNull();
    expect(decideMilestone(matches({ newestMatch: { matchId: "m1", completedAt: "junk", outcome: "loss" } }), none)).toBeNull();
  });

  it("fires once: a seen milestone does not repeat", () => {
    expect(decideMilestone(matches(), new Set<MilestoneId>(["first_match"]))).toBeNull();
  });

  it("needs exactly one match / one win", () => {
    expect(decideMilestone(matches({ stats: { wins: 0, losses: 2, draws: 0 } }), none)).toBeNull();
    expect(
      decideMilestone(matches({ stats: { wins: 2, losses: 0, draws: 0 }, newestWin: { matchId: "w", completedAt: iso(NOW) } }), new Set<MilestoneId>(["first_match"])),
    ).toBeNull();
    expect(decideMilestone(matches({ stats: null }), none)).toBeNull();
  });

  it("never fires during an active match or over a modal", () => {
    expect(decideMilestone(matches({ inActiveMatch: true }), none)).toBeNull();
    expect(decideMilestone(matches({ overModal: true }), none)).toBeNull();
  });

  it("Reduce Motion: no particles, banner and haptic rule unchanged", () => {
    const c = decideMilestone(
      matches({ reduceMotion: true, stats: { wins: 1, losses: 0, draws: 0 }, newestMatch: { matchId: "m1", completedAt: iso(NOW), outcome: "win" } }),
      none,
    );
    expect(c).toMatchObject({ particles: false, haptic: true });
    expect(decideMilestone(matches({ reduceMotion: true }), none)).toMatchObject({ particles: false, haptic: false });
  });

  describe("first highlight", () => {
    const hl = (over: Partial<NonNullable<MilestoneInputs["highlights"]>> = {}) => ({
      count: 1,
      hasMore: false,
      first: { highlightId: "h1", unseen: true, readyAt: iso(NOW - HOUR) },
      ...over,
    });

    it("fires on Home for exactly one unseen reel", () => {
      expect(decideMilestone({ surface: "home", now: NOW, inActiveMatch: false, highlights: hl() }, none)).toMatchObject({
        milestone: "first_highlight",
        targetId: "h1",
        copy: MILESTONE_COPY.first_highlight,
        haptic: true,
      });
    });

    it("does not fire for a seen reel, a second reel, more pages or an old reel", () => {
      const home = (h: ReturnType<typeof hl>) => decideMilestone({ surface: "home", now: NOW, inActiveMatch: false, highlights: h }, none);
      expect(home(hl({ first: { highlightId: "h1", unseen: false, readyAt: iso(NOW) } }))).toBeNull();
      expect(home(hl({ count: 2 }))).toBeNull();
      expect(home(hl({ hasMore: true }))).toBeNull();
      expect(home(hl({ first: { highlightId: "h1", unseen: true, readyAt: iso(NOW - MILESTONE_FRESH_MS - 1) } }))).toBeNull();
    });

    it("Home never fires the match milestones", () => {
      expect(decideMilestone({ ...matches(), surface: "home" }, none)).toBeNull();
    });

    it("Matches shows a first win before a first highlight; the highlight waits", () => {
      const both = matches({ stats: { wins: 1, losses: 0, draws: 0 }, newestMatch: { matchId: "m1", completedAt: iso(NOW), outcome: "win" }, highlights: hl() });
      expect(decideMilestone(both, none)?.milestone).toBe("first_win");
      expect(decideMilestone(both, new Set<MilestoneId>(["first_match", "first_win"]))?.milestone).toBe("first_highlight");
    });
  });
});

describe("store", () => {
  it("refuses a claim before the marks have loaded, and writes nothing", async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    expect(milestoneLoadState("a1")).toBe("pending");
    expect(claimMilestone("a1", { marks: ["first_match"] })).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    await loadMilestones("a1");
    expect(claimMilestone("a1", { marks: ["first_match"] })).toBe(true);
  });

  it("claims once, writes every mark in one write under milestones:v1:<athleteId>", async () => {
    await loadMilestones("a1");
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    expect(claimMilestone("a1", { marks: ["first_match", "first_win"] }, NOW)).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe(milestoneStorageKey("a1"));
    expect(milestoneStorageKey("a1")).toBe("milestones:v1:a1");
    expect(JSON.parse(setItem.mock.calls[0][1] as string)).toEqual({ first_match: iso(NOW), first_win: iso(NOW) });
    expect(claimMilestone("a1", { marks: ["first_win"] })).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("a read error fails closed: no celebration and no write for the session", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("io"));
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    expect((await loadMilestones("a1")).size).toBe(0);
    expect(milestoneLoadState("a1")).toBe("failed");
    expect(claimMilestone("a1", { marks: ["first_match"] })).toBe(false);
    // Still closed on a second load in the same session (the read is not retried).
    await loadMilestones("a1");
    expect(claimMilestone("a1", { marks: ["first_highlight"] })).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("persists merged with what is stored: existing and unknown keys are preserved", async () => {
    await AsyncStorage.setItem(milestoneStorageKey("a1"), JSON.stringify({ first_match: "2026-10-01T00:00:00.000Z", future_key: 7 }));
    await loadMilestones("a1");
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    expect(claimMilestone("a1", { marks: ["first_highlight"] }, NOW)).toBe(true);
    expect(JSON.parse(setItem.mock.calls[0][1] as string)).toEqual({
      first_match: "2026-10-01T00:00:00.000Z",
      future_key: 7,
      first_highlight: iso(NOW),
    });
  });

  it("a Home fire suppresses the Matches fire (same id, synchronously)", async () => {
    await loadMilestones("a1");
    expect(claimMilestone("a1", { marks: ["first_highlight"] })).toBe(true);
    expect(claimMilestone("a1", { marks: ["first_highlight"] })).toBe(false);
    expect(decideMilestone({ surface: "matches", now: NOW, inActiveMatch: false, highlights: { count: 1, hasMore: false, first: { highlightId: "h", unseen: true, readyAt: iso(NOW) } } }, seenMilestones("a1"))).toBeNull();
  });

  it("is per athlete", async () => {
    await loadMilestones("a1");
    await loadMilestones("a2");
    expect(claimMilestone("a1", { marks: ["first_match"] })).toBe(true);
    expect(claimMilestone("a2", { marks: ["first_match"] })).toBe(true);
  });

  it("refuses an empty claim", async () => {
    await loadMilestones("a1");
    expect(claimMilestone("a1", { marks: [] })).toBe(false);
  });

  it("survives a restart (reads back from storage); a later claim is visible to a later load", async () => {
    await loadMilestones("a1");
    claimMilestone("a1", { marks: ["first_match"] }, NOW);
    await Promise.resolve();
    __resetMilestonesForTests();
    expect(seenMilestones("a1").size).toBe(0);
    expect([...(await loadMilestones("a1"))]).toEqual(["first_match"]);
    claimMilestone("a1", { marks: ["first_win"] }, NOW);
    expect((await loadMilestones("a1")).has("first_win")).toBe(true);
  });

  it("reads junk storage as nothing celebrated (and may then record marks)", async () => {
    await AsyncStorage.setItem(milestoneStorageKey("a1"), "{nope");
    expect((await loadMilestones("a1")).size).toBe(0);
    expect(claimMilestone("a1", { marks: ["first_match"] })).toBe(true);
    await AsyncStorage.setItem(milestoneStorageKey("a2"), JSON.stringify({ first_match: 5, bogus: "x", first_win: true }));
    expect([...(await loadMilestones("a2"))]).toEqual(["first_win"]);
  });
});
