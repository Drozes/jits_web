import { describe, it, expect } from "vitest";
import {
  buildKeyMoments,
  captionAt,
  formatClock,
  humanizeAnalysisLabel,
} from "./key-moments";

describe("humanizeAnalysisLabel", () => {
  it("turns snake and kebab case into sentence case", () => {
    expect(humanizeAnalysisLabel("guard_pass_attempt")).toBe("Guard pass attempt");
    expect(humanizeAnalysisLabel("BACK-TAKE")).toBe("Back take");
    expect(humanizeAnalysisLabel("  ")).toBeNull();
    expect(humanizeAnalysisLabel(null)).toBeNull();
  });
});

describe("formatClock", () => {
  it("formats mm:ss and clamps bad input to 00:00", () => {
    expect(formatClock(377)).toBe("06:17");
    expect(formatClock(9.9)).toBe("00:09");
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(-3)).toBe("00:00");
    expect(formatClock(null)).toBe("00:00");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});

describe("buildKeyMoments", () => {
  const analysis = {
    positions: [
      { position: "closed_guard", timestamp_s: 60, description: "Bottom player pulls guard." },
      { position: "standing", timestamp_s: 9, description: "Hand fighting." },
    ],
    scoring_moments: [
      { type: "guard_pass", timestamp_s: 192, description: "Knee cut to side control" },
      { type: "takedown", timestamp_s: 27 },
      { type: "submission", timestamp_s: 375 },
    ],
  };

  it("orders engage, scores and the finish; promotes the nearby scoring moment to the finish", () => {
    const moments = buildKeyMoments(
      analysis,
      { result: "submission", submission_name: "Rear-naked choke", finish_time_seconds: 377 },
      600,
    );
    expect(moments.map((m) => [m.t, m.label, m.kind])).toEqual([
      [9, "Engage", "engage"],
      [27, "Takedown", "score"],
      [192, "Guard pass", "score"],
      [375, "Rear-naked choke", "finish"],
    ]);
    expect(moments[0].description).toBe("Hand fighting.");
    expect(moments[1].description).toBeNull();
  });

  it("adds a separate finish when no scoring moment is near it", () => {
    const moments = buildKeyMoments(
      { scoring_moments: [{ type: "takedown", timestamp_s: 27 }] },
      { result: "submission", submission_name: null, finish_time_seconds: 300 },
      null,
    );
    expect(moments.map((m) => [m.t, m.label, m.kind])).toEqual([
      [27, "Takedown", "score"],
      [300, "Finish", "finish"],
    ]);
  });

  it("adds no finish for points, draws or an unknown finish time", () => {
    expect(
      buildKeyMoments(null, { result: "points", finish_time_seconds: 300 }).some((m) => m.kind === "finish"),
    ).toBe(false);
    expect(
      buildKeyMoments(null, { result: "submission", finish_time_seconds: null }),
    ).toEqual([]);
  });

  it("drops invalid and past-the-end times, and collapses duplicates", () => {
    const moments = buildKeyMoments(
      {
        positions: [{ position: "standing", timestamp_s: -1 }],
        scoring_moments: [
          { type: "takedown", timestamp_s: Number.NaN },
          { type: "sweep", timestamp_s: 999 },
          { type: "sweep", timestamp_s: 40 },
          { type: "sweep", timestamp_s: 40.2 },
          { type: null, timestamp_s: 50 },
        ],
      },
      null,
      300,
    );
    expect(moments.map((m) => [m.t, m.label])).toEqual([
      [40, "Sweep"],
      [50, "Score"],
    ]);
  });
});

describe("captionAt", () => {
  const moments = buildKeyMoments(
    {
      positions: [{ position: "standing", timestamp_s: 9 }],
      scoring_moments: [{ type: "guard_pass", timestamp_s: 192, description: "knee cut to side control" }],
    },
    null,
  );
  const positions = [
    { position: "standing", timestamp_s: 9 },
    { position: "side_control", timestamp_s: 195 },
  ];

  it("shows the latest moment for 10 s, with its description", () => {
    expect(captionAt(moments, positions, 195)).toEqual({
      t: 192,
      text: "Guard pass: knee cut to side control",
    });
  });

  it("falls back to the current position after the hold", () => {
    expect(captionAt(moments, positions, 230)).toEqual({ t: 195, text: "Side control" });
  });

  it("returns null before anything happens", () => {
    expect(captionAt(moments, positions, 2)).toBeNull();
    expect(captionAt([], null, 100)).toBeNull();
  });
});
