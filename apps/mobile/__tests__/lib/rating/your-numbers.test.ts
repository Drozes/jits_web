/**
 * Your numbers (jits-1ez5.2): the values the header rating's sheet derives.
 * Rank of total with a top % rounded up, Unranked before a first match
 * (rank.current is typed as a number either way), the record, peak, the last
 * match's delta and the sparkline's points.
 */
import {
  SPARK_MATCHES,
  deltaTone,
  eloThisMonthFromHistory,
  lastMatchDelta,
  peakLegend,
  sparkRange,
  monthStartLabel,
  peakNote,
  rankCell,
  recordCell,
  sparkPoints,
  topPercent,
} from "@/lib/rating/your-numbers";

const STATS = { wins: 14, losses: 6, draws: 1, win_streak: 2, best_win_streak: 5, total_matches: 21 };

describe("topPercent", () => {
  it("rounds up: #37 of 412 is Top 9%, #1 is never Top 0%", () => {
    expect(topPercent(37, 412)).toBe(9);
    expect(topPercent(1, 412)).toBe(1);
    expect(topPercent(1, 1)).toBe(100);
    expect(topPercent(412, 412)).toBe(100);
    expect(topPercent(50, 100)).toBe(50);
  });

  it("is null without a field or a rank", () => {
    expect(topPercent(0, 412)).toBeNull();
    expect(topPercent(3, 0)).toBeNull();
    expect(topPercent(Number.NaN, 10)).toBeNull();
  });
});

describe("rankCell", () => {
  it("reads #37 of 412, Top 9%, and speaks it", () => {
    expect(rankCell({ stats: STATS, rank: { current: 37, best: 20, total: 412 } })).toEqual({
      value: "#37",
      of: "of 412",
      top: "Top 9%",
      label: "Global rank 37 of 412, top 9 percent",
    });
  });

  it("is Unranked (null) before a first match, whatever rank.current says", () => {
    expect(rankCell({ stats: { ...STATS, total_matches: 0 }, rank: { current: 412, best: 412, total: 412 } })).toBeNull();
    expect(rankCell({ stats: null as never, rank: { current: 3, best: 3, total: 10 } })).toBeNull();
  });

  it("is null when the rank is missing or zero", () => {
    expect(rankCell({ stats: STATS, rank: null as never })).toBeNull();
    expect(rankCell({ stats: STATS, rank: { current: 0, best: 0, total: 412 } })).toBeNull();
  });
});

describe("recordCell", () => {
  it("formats the record with formatRecord and counts the matches", () => {
    expect(recordCell(STATS)).toEqual({
      // No-break spaces: never one token per line at large text sizes.
      value: "14W\u00a0·\u00a06L\u00a0·\u00a01D",
      label: "Record: 14 wins, 6 losses, 1 draw",
      matches: "21 matches",
    });
  });

  it("is a 0-0-0 record with no stats, and says 1 match in the singular", () => {
    expect(recordCell(null).value.replace(/\u00a0/g, " ")).toBe("0W · 0L · 0D");
    expect(recordCell(null).value).not.toContain(" ");
    expect(recordCell({ ...STATS, wins: 1, losses: 0, draws: 0 }).matches).toBe("1 match");
  });
});

describe("peakNote", () => {
  it("says how far the peak is above now, or that now is the peak", () => {
    expect(peakNote(1540, 1512)).toBe("28 above now");
    expect(peakNote(1512, 1512)).toBe("At your peak");
  });
});

describe("lastMatchDelta", () => {
  it("is recent_matches[0]'s elo_delta with its outcome, or null with no matches", () => {
    const m = (elo_delta: number, outcome: "win" | "loss" | "draw") => ({ match_id: "m", opponent_name: "X", outcome, match_type: "ranked", elo_delta, completed_at: "" });
    expect(lastMatchDelta({ recent_matches: [m(14, "win"), m(-11, "loss")] })).toEqual({ delta: 14, outcome: "win" });
    expect(lastMatchDelta({ recent_matches: [m(-2, "draw")] })).toEqual({ delta: -2, outcome: "draw" });
    expect(lastMatchDelta({ recent_matches: [] })).toBeNull();
    expect(lastMatchDelta(null)).toBeNull();
  });
});

describe("monthStartLabel", () => {
  it("names the first of the current month", () => {
    expect(monthStartLabel(new Date(2026, 9, 9))).toBe("Since Oct 1");
    expect(monthStartLabel(new Date(2026, 0, 31))).toBe("Since Jan 1");
  });
});

describe("sparkPoints", () => {
  const row = (i: number) => ({
    rating_before: 1400 + i,
    rating_after: 1401 + i,
    created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  });

  it("draws the last SPARK_MATCHES matches oldest to newest, from the first one's rating before", () => {
    // The RPC returns newest first.
    const history = Array.from({ length: 30 }, (_, i) => row(29 - i));
    const points = sparkPoints(history, 1430);
    expect(points).toHaveLength(SPARK_MATCHES + 1);
    expect(points[0]).toBe(1410);
    expect(points[points.length - 1]).toBe(1430);
  });

  it("ends on the current rating when the history has not caught up (never contradicts the hero)", () => {
    const history = Array.from({ length: 3 }, (_, i) => row(2 - i)); // newest after = 1403
    expect(sparkPoints(history, 1403)).toEqual([1400, 1401, 1402, 1403]);
    expect(sparkPoints(history, 1417)).toEqual([1400, 1401, 1402, 1403, 1417]);
  });

  it("is empty with no history", () => {
    expect(sparkPoints([], 1200)).toEqual([]);
  });
});

describe("sparkRange and the peak legend", () => {
  it("draws the peak when it is within or near the line", () => {
    expect(sparkRange([1480, 1500, 1512], 1512)).toEqual({ lo: 1480, hi: 1512, showPeak: true });
    expect(sparkRange([1480, 1500, 1512], 1528)).toEqual({ lo: 1480, hi: 1528, showPeak: true });
    expect(peakLegend(1528, true)).toBe("Peak 1528, dashed");
  });

  it("leaves an old high peak out of the range, so it does not flatten the line, and names it instead", () => {
    expect(sparkRange([1180, 1200, 1210], 1600)).toEqual({ lo: 1180, hi: 1210, showPeak: false });
    expect(peakLegend(1600, false)).toBe("Peak 1600");
  });
});

describe("deltaTone", () => {
  it("is amber for a draw whatever the sign, else by the sign", () => {
    expect(deltaTone(-2, "draw")).toBe("draw");
    expect(deltaTone(-11, "loss")).toBe("loss");
    expect(deltaTone(-11)).toBe("loss");
    expect(deltaTone(14, "win")).toBe("win");
    expect(deltaTone(0)).toBe("flat");
  });
});

describe("eloThisMonthFromHistory", () => {
  it("sums the rating changes since the 1st of this month (the profile query's sum)", () => {
    const now = new Date(2026, 9, 9, 12);
    const rows = [
      { created_at: new Date(2026, 9, 8).toISOString(), delta: 14 },
      { created_at: new Date(2026, 9, 1, 0, 30).toISOString(), delta: -9 },
      { created_at: new Date(2026, 8, 30).toISOString(), delta: 40 },
    ];
    expect(eloThisMonthFromHistory(rows, now)).toBe(5);
    expect(eloThisMonthFromHistory([], now)).toBe(0);
  });
});
