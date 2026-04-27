import { describe, it, expect } from "vitest";
import {
  MATCH_STATUS,
  MATCH_RESULT,
  MATCH_TYPE,
  MATCH_OUTCOME,
  CHALLENGE_STATUS,
  ATHLETE_STATUS,
} from "./constants";

describe("MATCH_STATUS", () => {
  it("has all lifecycle states", () => {
    expect(MATCH_STATUS.PENDING).toBe("pending");
    expect(MATCH_STATUS.IN_PROGRESS).toBe("in_progress");
    expect(MATCH_STATUS.COMPLETED).toBe("completed");
    expect(MATCH_STATUS.DISPUTED).toBe("disputed");
  });

  it("has exactly 4 statuses", () => {
    expect(Object.keys(MATCH_STATUS)).toHaveLength(4);
  });
});

describe("MATCH_RESULT", () => {
  it("has submission and draw", () => {
    expect(MATCH_RESULT.SUBMISSION).toBe("submission");
    expect(MATCH_RESULT.DRAW).toBe("draw");
  });

  it("has exactly 2 results", () => {
    expect(Object.keys(MATCH_RESULT)).toHaveLength(2);
  });
});

describe("MATCH_TYPE", () => {
  it("has casual and ranked", () => {
    expect(MATCH_TYPE.CASUAL).toBe("casual");
    expect(MATCH_TYPE.RANKED).toBe("ranked");
  });
});

describe("MATCH_OUTCOME", () => {
  it("has win, loss, and draw", () => {
    expect(MATCH_OUTCOME.WIN).toBe("win");
    expect(MATCH_OUTCOME.LOSS).toBe("loss");
    expect(MATCH_OUTCOME.DRAW).toBe("draw");
  });
});

describe("CHALLENGE_STATUS", () => {
  it("has all challenge statuses", () => {
    expect(CHALLENGE_STATUS.PENDING).toBe("pending");
    expect(CHALLENGE_STATUS.ACCEPTED).toBe("accepted");
    expect(CHALLENGE_STATUS.DECLINED).toBe("declined");
    expect(CHALLENGE_STATUS.EXPIRED).toBe("expired");
    expect(CHALLENGE_STATUS.CANCELLED).toBe("cancelled");
  });

  it("has exactly 5 statuses", () => {
    expect(Object.keys(CHALLENGE_STATUS)).toHaveLength(5);
  });
});

describe("ATHLETE_STATUS", () => {
  it("has pending, active, and inactive", () => {
    expect(ATHLETE_STATUS.PENDING).toBe("pending");
    expect(ATHLETE_STATUS.ACTIVE).toBe("active");
    expect(ATHLETE_STATUS.INACTIVE).toBe("inactive");
  });
});
