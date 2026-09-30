import { describe, expect, it } from "vitest";
import {
  STATS_WINDOWS,
  buildEloProgression,
  buildWeeklyActivity,
  eloGridTicks,
  statsWindowSince,
} from "./stats-window";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("statsWindowSince", () => {
  it("maps 30D / 90D / 1Y to now minus 30 / 90 / 365 days and ALL to null", () => {
    expect(statsWindowSince("30d", NOW)).toBe(new Date(NOW.getTime() - 30 * DAY).toISOString());
    expect(statsWindowSince("90d", NOW)).toBe(new Date(NOW.getTime() - 90 * DAY).toISOString());
    expect(statsWindowSince("1y", NOW)).toBe(new Date(NOW.getTime() - 365 * DAY).toISOString());
    expect(statsWindowSince("all", NOW)).toBeNull();
  });

  it("lists the chips in board order, ALL last", () => {
    expect(STATS_WINDOWS.map((w) => w.label)).toEqual(["30D", "90D", "1Y", "All"]);
  });
});

describe("buildWeeklyActivity", () => {
  it("builds 8 weekly buckets, counting only the rows passed and within 8 weeks", () => {
    const weeks = buildWeeklyActivity(
      [
        { completed_at: new Date(NOW.getTime() - 1 * DAY).toISOString(), athlete_outcome: "win" },
        { completed_at: new Date(NOW.getTime() - 2 * DAY).toISOString(), athlete_outcome: "loss" },
        { completed_at: new Date(NOW.getTime() - 20 * DAY).toISOString(), athlete_outcome: "win" },
        { completed_at: new Date(NOW.getTime() - 70 * DAY).toISOString(), athlete_outcome: "win" },
      ],
      NOW,
    );
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({ matches: 2, wins: 1 });
    expect(weeks[5]).toMatchObject({ matches: 1, wins: 1 });
    expect(weeks.reduce((n, w) => n + w.matches, 0)).toBe(3);
  });

  it("is all zeros for an empty window", () => {
    expect(buildWeeklyActivity([], NOW).every((w) => w.matches === 0)).toBe(true);
  });
});

describe("buildEloProgression", () => {
  it("orders newest-first RPC rows oldest to newest and labels start/end", () => {
    const p = buildEloProgression(
      [
        { rating_before: 1469, rating_after: 1487, created_at: "2026-09-27T00:00:00Z" },
        { rating_before: 1350, rating_after: 1400, created_at: "2026-03-14T00:00:00Z" },
        { rating_before: 1400, rating_after: 1469, created_at: "2026-06-01T00:00:00Z" },
      ],
      1487,
    );
    expect(p.points).toEqual([1350, 1400, 1469, 1487]);
    expect(p).toMatchObject({
      start: 1350,
      end: 1487,
      delta: 137,
      matches: 3,
      startDate: "2026-03-14T00:00:00Z",
      endDate: "2026-09-27T00:00:00Z",
    });
  });

  it("is a flat line at current ELO with 0 matches when the window is empty", () => {
    expect(buildEloProgression([], 1487)).toEqual({
      points: [1487, 1487],
      start: 1487,
      end: 1487,
      delta: 0,
      matches: 0,
      startDate: null,
      endDate: null,
    });
  });

  it("labels an empty window's axis with its bounds (ALL has no start)", () => {
    const since = new Date(NOW.getTime() - 30 * DAY).toISOString();
    expect(buildEloProgression([], 1487, { since, now: NOW })).toMatchObject({
      matches: 0,
      startDate: since,
      endDate: NOW.toISOString(),
    });
    expect(buildEloProgression([], 1487, { since: null, now: NOW })).toMatchObject({
      startDate: null,
      endDate: NOW.toISOString(),
    });
  });
});

describe("eloGridTicks", () => {
  it("uses round 50s across the board's 1350 to 1487 range", () => {
    expect(eloGridTicks([1350, 1420, 1487])).toEqual([1350, 1400, 1450, 1500]);
  });

  it("brackets a flat series so the line sits mid-chart", () => {
    expect(eloGridTicks([1500, 1500])).toEqual([1490, 1500, 1510]);
    const ticks = eloGridTicks([1487, 1487]);
    expect(ticks[0]).toBeLessThan(1487);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(1487);
  });

  it("never draws more than 5 gridlines", () => {
    expect(eloGridTicks([800, 2400]).length).toBeLessThanOrEqual(5);
  });
});
