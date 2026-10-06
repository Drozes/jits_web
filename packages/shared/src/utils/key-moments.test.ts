import { describe, it, expect } from "vitest";
import contract from "./__fixtures__/angle-sync-contract.json";
import {
  buildKeyMoments,
  captionAt,
  formatClock,
  translateAngleTime,
  angleSyncExact,
  humanizeAnalysisLabel,
  canSeeAnalysisLabels,
  keyMomentDisplayLabel,
  keyMomentStepAt,
  keyMomentsBySecond,
  sameKeyMomentStop,
  type KeyMoment,
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
      // Marked the finish, but keeps its own analysed label.
      [200, "Back take", "finish"],
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

describe("angle sync contract shared with jr_be (jr_be-1qz.11 acceptance 3)", () => {
  // Byte-identical to jr_be workers/video-slicer/test/fixtures/angle-sync-contract.json.
  it.each(contract.cases)("t=$t from $from_offset_ms to $to_offset_ms -> $expected_t", (c) => {
    const out = translateAngleTime(c.t, c.from_offset_ms, c.to_offset_ms);
    expect(out.synced).toBe(true);
    expect(out.t).toBeCloseTo(c.expected_t, 9);
  });

  it("AC1: the primary at 30.000 s is 28.500 s on an angle that started 1.5 s later, and back", () => {
    expect(translateAngleTime(30, 0, 1500).t).toBeCloseTo(28.5, 9);
    expect(translateAngleTime(28.5, 1500, 0).t).toBeCloseTo(30, 9);
  });
});

describe("angleSyncExact", () => {
  it("the primary and audio-matched angles are exact", () => {
    expect(angleSyncExact({ is_primary: true, sync_offset_ms: 0, sync_source: null })).toBe(true);
    expect(angleSyncExact({ sync_offset_ms: 0, sync_source: null })).toBe(true);
    expect(angleSyncExact({ sync_offset_ms: -163, sync_source: "audio" })).toBe(true);
  });
  it("clock, manual, missing source or no offset is approximate", () => {
    expect(angleSyncExact({ sync_offset_ms: 2400, sync_source: "clock" })).toBe(false);
    expect(angleSyncExact({ sync_offset_ms: 200, sync_source: "manual" })).toBe(false);
    expect(angleSyncExact({ sync_offset_ms: 200, sync_source: null })).toBe(false);
    expect(angleSyncExact({ sync_offset_ms: null, sync_source: "audio" })).toBe(false);
    expect(angleSyncExact(null)).toBe(false);
  });
});

describe("analysis label gate (jits-xfvd.18)", () => {
  it("shows labels to admins and founders only; anything else is hidden", () => {
    expect(canSeeAnalysisLabels("admin")).toBe(true);
    expect(canSeeAnalysisLabels("founder")).toBe(true);
    expect(canSeeAnalysisLabels("member")).toBe(false);
    expect(canSeeAnalysisLabels(null)).toBe(false);
    expect(canSeeAnalysisLabels(undefined)).toBe(false);
    expect(canSeeAnalysisLabels("ADMIN")).toBe(false);
  });

  it("keyMomentDisplayLabel returns the label only when labels are shown", () => {
    const m: KeyMoment = { t: 27, label: "Single leg takedown", kind: "score", description: null };
    expect(keyMomentDisplayLabel(m, true)).toBe("Single leg takedown");
    expect(keyMomentDisplayLabel(m, false)).toBeNull();
  });

  it("non-admins see a finish label only when it is the recorded submission", () => {
    const named: KeyMoment = { t: 200, label: "Rear-naked choke", kind: "finish", description: null };
    const fallback: KeyMoment = { t: 200, label: "Back take", kind: "finish", description: null };
    expect(keyMomentDisplayLabel(named, false, " Rear-naked choke ")).toBe("Rear-naked choke");
    expect(keyMomentDisplayLabel(fallback, false, "Rear-naked choke")).toBeNull();
    expect(keyMomentDisplayLabel(named, false, null)).toBeNull();
    const score: KeyMoment = { t: 27, label: "Rear-naked choke", kind: "score", description: null };
    expect(keyMomentDisplayLabel(score, false, "Rear-naked choke")).toBeNull();
  });

  it("the recorded name survives buildKeyMoments only when the analysis named it", () => {
    const match = { result: "submission", submission_name: "Armbar" };
    const named = buildKeyMoments({ scoring_moments: [{ type: "armbar", timestamp_s: 90 }] }, match);
    expect(keyMomentDisplayLabel(named.at(-1)!, false, "Armbar")).toBe("Armbar");
    const fallback = buildKeyMoments({ scoring_moments: [{ type: "sweep", timestamp_s: 90 }] }, match);
    expect(keyMomentDisplayLabel(fallback.at(-1)!, false, "Armbar")).toBeNull();
  });
});

describe("keyMomentStepAt", () => {
  const ms: KeyMoment[] = [6, 38, 125].map((t) => ({ t, label: `m${t}`, kind: "score", description: null }));

  it("is null with no moments", () => {
    expect(keyMomentStepAt([], 10)).toBeNull();
  });

  it("before the first moment shows the first time, no prev, next is the first", () => {
    const s = keyMomentStepAt(ms, 2)!;
    expect(s).toMatchObject({ index: 0, reached: false, prev: null });
    expect(s.shown.t).toBe(6);
    expect(s.next?.t).toBe(6);
  });

  it("between moments shows the one at or before the playhead with both neighbours", () => {
    const s = keyMomentStepAt(ms, 60)!;
    expect(s).toMatchObject({ index: 1, reached: true });
    expect(s.shown.t).toBe(38);
    expect(s.prev?.t).toBe(6);
    expect(s.next?.t).toBe(125);
  });

  it("counts a just-seeked moment as reached (quarter second slack)", () => {
    expect(keyMomentStepAt(ms, 37.8)!.shown.t).toBe(38);
  });

  it("first moment has no prev; last has no next", () => {
    expect(keyMomentStepAt(ms, 6)!.prev).toBeNull();
    const last = keyMomentStepAt(ms, 400)!;
    expect(last.shown.t).toBe(125);
    expect(last.next).toBeNull();
    expect(last.prev?.t).toBe(38);
  });

  it("treats a non-finite playhead as 0", () => {
    expect(keyMomentStepAt(ms, Number.NaN)!.reached).toBe(false);
  });
});

describe("same-second moments (review M1)", () => {
  const same: KeyMoment[] = [
    { t: 6, label: "Engage", kind: "engage", description: null },
    { t: 6, label: "Takedown", kind: "score", description: null },
    { t: 40, label: "Sweep", kind: "score", description: null },
  ];

  it("keyMomentsBySecond keeps one entry per second, the finish winning", () => {
    expect(keyMomentsBySecond(same).map((m) => m.t)).toEqual([6, 40]);
    const withFinish: KeyMoment[] = [
      { t: 5.8, label: "Sweep", kind: "score", description: null },
      { t: 6.2, label: "Armbar", kind: "finish", description: null },
    ];
    expect(keyMomentsBySecond(withFinish)).toEqual([{ t: 5.8, label: "Armbar", kind: "finish", description: null }]);
    expect(keyMomentsBySecond([])).toEqual([]);
  });

  it("the stepper steps over distinct times and reaches the first", () => {
    const at40 = keyMomentStepAt(same, 40)!;
    expect(at40).toMatchObject({ index: 1, count: 2 });
    expect(at40.prev?.t).toBe(6);
    const at6 = keyMomentStepAt(same, at40.prev!.t)!;
    expect(at6).toMatchObject({ index: 0, count: 2, prev: null });
    expect(at6.next?.t).toBe(40);
  });
});

describe("stops never share a displayed time (re-review Low)", () => {
  const at = (...ts: number[]): KeyMoment[] => ts.map((t) => ({ t, label: `m${t}`, kind: "score", description: null }));

  it("5.4 and 5.6 (same floored second, both 00:05) are one stop", () => {
    expect(keyMomentsBySecond(at(5.4, 5.6, 20)).map((m) => m.t)).toEqual([5.4, 20]);
    const s = keyMomentStepAt(at(5.4, 5.6, 20), 20)!;
    expect(s.prev?.t).toBe(5.4);
    expect(keyMomentStepAt(at(5.4, 5.6, 20), 5.6)).toMatchObject({ index: 0, count: 2, prev: null });
  });

  it("5.9 and 6.1 (different seconds, under 1 s apart) are one stop", () => {
    expect(keyMomentsBySecond(at(5.9, 6.1, 20)).map((m) => m.t)).toEqual([5.9, 20]);
    expect(keyMomentStepAt(at(5.9, 6.1, 20), 6.1)).toMatchObject({ index: 0, count: 2, prev: null });
  });

  it("a finish wins the stop and keeps the earliest time", () => {
    const ms: KeyMoment[] = [
      { t: 5.9, label: "Sweep", kind: "score", description: null },
      { t: 6.1, label: "Armbar", kind: "finish", description: null },
    ];
    expect(keyMomentsBySecond(ms)).toEqual([{ t: 5.9, label: "Armbar", kind: "finish", description: null }]);
  });

  it("moments a full second or more apart in different seconds stay separate", () => {
    expect(keyMomentsBySecond(at(5.0, 6.0, 7.5)).map((m) => m.t)).toEqual([5.0, 6.0, 7.5]);
  });

  it("sameKeyMomentStop: same floored second or under 1 s apart", () => {
    expect(sameKeyMomentStop(5.4, 5.6)).toBe(true);
    expect(sameKeyMomentStop(5.9, 6.1)).toBe(true);
    expect(sameKeyMomentStop(5.0, 6.0)).toBe(false);
    expect(sameKeyMomentStop(5.0, 6.9)).toBe(false);
  });
});
