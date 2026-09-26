import { describe, it, expect } from "vitest";
import {
  canSubmitResult,
  exitReasonFor,
  finishSecondsFromFields,
  formatMatchClock,
  hasRecordedResult,
  isFinishTimeValid,
  resultFromMatch,
} from "./match-state";

describe("finishSecondsFromFields", () => {
  it("is undefined when both fields are empty", () => {
    expect(finishSecondsFromFields("", "")).toBeUndefined();
    expect(finishSecondsFromFields("  ", "")).toBeUndefined();
  });
  it("combines minutes and seconds, either may be blank", () => {
    expect(finishSecondsFromFields("4", "30")).toBe(270);
    expect(finishSecondsFromFields("", "45")).toBe(45);
    expect(finishSecondsFromFields("2", "")).toBe(120);
  });
  it("is NaN for malformed or out-of-range parts", () => {
    expect(finishSecondsFromFields("1.5", "0")).toBeNaN();
    expect(finishSecondsFromFields("-1", "0")).toBeNaN();
    expect(finishSecondsFromFields("1", "60")).toBeNaN();
    expect(finishSecondsFromFields("1", "-5")).toBeNaN();
  });
});

describe("isFinishTimeValid", () => {
  it("requires 1..duration", () => {
    expect(isFinishTimeValid(undefined, 300)).toBe(false);
    expect(isFinishTimeValid(0, 300)).toBe(false);
    expect(isFinishTimeValid(1, 300)).toBe(true);
    expect(isFinishTimeValid(300, 300)).toBe(true);
    expect(isFinishTimeValid(301, 300)).toBe(false);
    expect(isFinishTimeValid(Number.NaN, 300)).toBe(false);
  });
});

describe("canSubmitResult", () => {
  const base = {
    result: "submission" as const,
    winnerId: "a",
    submissionCode: "rnc",
    finishTime: 90,
    durationSeconds: 300,
  };
  it("allows a draw with nothing else", () => {
    expect(
      canSubmitResult({ ...base, result: "draw", winnerId: "", submissionCode: "", finishTime: undefined }),
    ).toBe(true);
  });
  it("allows a complete submission", () => {
    expect(canSubmitResult(base)).toBe(true);
  });
  it("blocks a submission without a finish time (BE missing_fields)", () => {
    expect(canSubmitResult({ ...base, finishTime: undefined })).toBe(false);
  });
  it("blocks a finish time past the match (BE invalid_finish_time)", () => {
    expect(canSubmitResult({ ...base, finishTime: 301 })).toBe(false);
    expect(canSubmitResult({ ...base, finishTime: 0 })).toBe(false);
  });
  it("blocks a missing winner, submission type or result", () => {
    expect(canSubmitResult({ ...base, winnerId: "" })).toBe(false);
    expect(canSubmitResult({ ...base, submissionCode: "" })).toBe(false);
    expect(canSubmitResult({ ...base, result: null })).toBe(false);
  });
});

describe("formatMatchClock", () => {
  it("formats m:ss", () => {
    expect(formatMatchClock(300)).toBe("5:00");
    expect(formatMatchClock(65)).toBe("1:05");
  });
});

describe("exitReasonFor / hasRecordedResult", () => {
  it("exits only on cancelled or voided", () => {
    expect(exitReasonFor("cancelled")).toBe("cancelled");
    expect(exitReasonFor("voided")).toBe("voided");
    expect(exitReasonFor("pending")).toBeNull();
    expect(exitReasonFor("completed")).toBeNull();
    expect(exitReasonFor(undefined)).toBeNull();
  });
  it("treats completed and disputed as recorded", () => {
    expect(hasRecordedResult("completed")).toBe(true);
    expect(hasRecordedResult("disputed")).toBe(true);
    expect(hasRecordedResult("in_progress")).toBe(false);
  });
});

describe("resultFromMatch", () => {
  const p = (athlete_id: string, outcome: string | null) =>
    ({ athlete_id, outcome }) as never;
  it("rebuilds the verdict from my own outcome", () => {
    expect(resultFromMatch({ participants: [p("me", "win"), p("op", "loss")] }, "me")).toEqual({
      result: "submission",
      winnerId: "me",
    });
    expect(resultFromMatch({ participants: [p("me", "loss"), p("op", "win")] }, "me")).toEqual({
      result: "submission",
      winnerId: "op",
    });
    expect(resultFromMatch({ participants: [p("me", "draw"), p("op", "draw")] }, "me")).toEqual({
      result: "draw",
    });
  });
  it("is null before an outcome is stamped", () => {
    expect(resultFromMatch({ participants: [p("me", null), p("op", null)] }, "me")).toBeNull();
  });
});
