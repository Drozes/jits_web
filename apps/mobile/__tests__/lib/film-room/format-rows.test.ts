import { cardLine, deltaLabel, monthOf, recordStrip, shortDate, shortName, titleDate } from "@/lib/film-room/format";
import { applyFilter, buildRows, opponentsOf, recordOf, NO_FILTER } from "@/lib/film-room/rows";
import { libItem } from "../../support/film-fixtures";

describe("format", () => {
  it("shortens names", () => {
    expect(shortName("Mina Park")).toBe("M. Park");
    expect(shortName("kai de la reyes")).toBe("K. reyes");
    expect(shortName("Cher")).toBe("Cher");
    expect(shortName(null)).toBe("Opponent");
  });

  it("formats deltas with ▲/▼ and a true minus", () => {
    expect(deltaLabel(14)).toBe("▲ +14");
    expect(deltaLabel(-9)).toBe("▼ −9");
    expect(deltaLabel(0)).toBe("± 0");
    expect(deltaLabel(null)).toBeNull();
  });

  it("builds the card line from delta and finish time (or the clock)", () => {
    expect(cardLine(libItem())).toBe("▲ +14 · 06:17");
    expect(cardLine(libItem({ outcome: "draw", elo_delta: 1, finish_time_seconds: null, duration_seconds: 600 }))).toBe("▲ +1 · 10:00");
    // Every match is ranked: a legacy casual row reads like any match, and a
    // row with no recorded delta shows only the time (never "CASUAL").
    expect(cardLine(libItem({ match_type: "casual", elo_delta: 0 }))).toBe("± 0 · 06:17");
    expect(cardLine(libItem({ match_type: "casual", elo_delta: null }))).toBe("06:17");
  });

  it("formats dates without em dashes", () => {
    const iso = new Date(2026, 8, 7, 12).toISOString();
    expect(shortDate(iso)).toBe("SEP 07");
    expect(titleDate(iso)).toBe("Sep 7");
    expect(monthOf(iso)).toEqual({ key: "2026-09", label: "SEPTEMBER 2026" });
    expect(monthOf(null)).toEqual({ key: "unknown", label: "UNDATED" });
    expect(recordStrip({ wins: 15, losses: 7, draws: 2 }, 1526)).toBe("24 MATCHES · 15W 7L 2D · 1526");
    expect(recordStrip({ wins: 1, losses: 0, draws: 0 }, null)).toBe("1 MATCH · 1W 0L 0D");
  });
});

describe("rows", () => {
  const sep = (d: number, over = {}) => libItem({ match_id: `s${d}`, completed_at: new Date(2026, 8, d, 12).toISOString(), ...over });
  const aug = (d: number, over = {}) => libItem({ match_id: `a${d}`, completed_at: new Date(2026, 7, d, 12).toISOString(), ...over });

  it("groups by month, two posters per row, keeping order", () => {
    const rows = buildRows([sep(27), sep(24), sep(20), aug(30)]);
    expect(rows.map((r) => (r.type === "month" ? `${r.label}:${r.count}` : r.items.map((i) => i.match_id).join("+")))).toEqual([
      "SEPTEMBER 2026:3",
      "s27+s24",
      "s20",
      "AUGUST 2026:1",
      "a30",
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("puts one match per row for the full-width feed (perRow 1)", () => {
    const rows = buildRows([sep(27), sep(24), aug(30)], 1);
    expect(rows.map((r) => (r.type === "month" ? `${r.label}:${r.count}` : r.items.map((i) => i.match_id).join("+")))).toEqual([
      "SEPTEMBER 2026:2",
      "s27",
      "s24",
      "AUGUST 2026:1",
      "a30",
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("filters by outcome and opponent", () => {
    const items = [
      sep(27, { outcome: "win" }),
      sep(24, { outcome: "loss", opponent: { id: "opp-2", display_name: "Joao Silva", profile_photo_url: null } }),
      sep(20, { outcome: "draw" }),
    ];
    expect(applyFilter(items, NO_FILTER)).toHaveLength(3);
    expect(applyFilter(items, { outcome: "loss", opponentId: null }).map((i) => i.match_id)).toEqual(["s24"]);
    expect(applyFilter(items, { outcome: "all", opponentId: "opp-1" }).map((i) => i.match_id)).toEqual(["s27", "s20"]);
    expect(opponentsOf(items)).toEqual([
      { id: "opp-1", name: "M. Park", count: 2 },
      { id: "opp-2", name: "J. Silva", count: 1 },
    ]);
  });

  it("totals the record from history", () => {
    expect(recordOf([{ athlete_outcome: "win" }, { athlete_outcome: "win" }, { athlete_outcome: "loss" }, { athlete_outcome: "draw" }, { athlete_outcome: null }])).toEqual({ wins: 2, losses: 1, draws: 1 });
  });
});
