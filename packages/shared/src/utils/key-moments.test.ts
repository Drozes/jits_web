import { describe, it, expect } from "vitest";
import {
  buildKeyMoments,
  captionAt,
  formatClock,
  translateAngleTime,
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
      { type: "submission", timestamp_s: 375, description: "Rear naked choke from the back" },
    ],
  };
  const rnc = { result: "submission", submission_name: "Rear-naked choke" };

  it("orders engage and scores, and promotes the scoring moment that is the submission", () => {
    const moments = buildKeyMoments(analysis, rnc, 600);
    expect(moments.map((m) => [m.t, m.label, m.kind])).toEqual([
      [9, "Engage", "engage"],
      [27, "Takedown", "score"],
      [192, "Guard pass", "score"],
      [375, "Rear-naked choke", "finish"],
    ]);
    expect(moments[0].description).toBe("Hand fighting.");
    expect(moments[1].description).toBeNull();
  });

  it("uses a technique tag naming the submission when no scoring moment does, in video time", () => {
    const moments = buildKeyMoments(
      {
        scoring_moments: [{ type: "takedown", timestamp_s: 27 }, { type: "back_take", timestamp_s: 300 }],
        technique_tags: [
          { technique_name: "Single leg", timestamp_start: 27 },
          { technique_name: "Rear naked choke", timestamp_start: 318 },
        ],
      },
      rnc,
      null,
    );
    expect(moments.map((m) => [m.t, m.label, m.kind])).toEqual([
      [27, "Takedown", "score"],
      [300, "Back take", "score"],
      [318, "Rear-naked choke", "finish"],
    ]);
  });

  it("falls back to the last scoring moment, and adds no finish without any", () => {
    const last = buildKeyMoments(
      { scoring_moments: [{ type: "back_take", timestamp_s: 200 }, { type: "takedown", timestamp_s: 27 }] },
      rnc,
    );
    expect(last.map((m) => [m.t, m.label, m.kind])).toEqual([
      [27, "Takedown", "score"],
      [200, "Rear-naked choke", "finish"],
    ]);
    expect(buildKeyMoments({ positions: [{ position: "standing", timestamp_s: 5 }] }, rnc).some((m) => m.kind === "finish")).toBe(false);
    expect(buildKeyMoments(null, rnc)).toEqual([]);
  });

  it("marks no finish for points or draws", () => {
    expect(buildKeyMoments(analysis, { result: "points" }).some((m) => m.kind === "finish")).toBe(false);
    expect(buildKeyMoments(analysis, null).some((m) => m.kind === "finish")).toBe(false);
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

describe("translateAngleTime", () => {
  it("shifts by the offset difference when both angles are synced", () => {
    // Target started 2.5 s later than the source: the same instant is earlier on it.
    expect(translateAngleTime(42, 0, 2500)).toEqual({ t: 39.5, synced: true });
    expect(translateAngleTime(1, 0, 2500)).toEqual({ t: 0, synced: true });
  });

  it("carries t unchanged and unsynced when either offset is unknown", () => {
    expect(translateAngleTime(42, null, 2500)).toEqual({ t: 42, synced: false });
    expect(translateAngleTime(42, 0, undefined)).toEqual({ t: 42, synced: false });
  });
});
