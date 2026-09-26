import { describe, it, expect } from "vitest";
import { hasWatchAction, initialVideoPhase, watchLabel } from "./match-video-state";

describe("initialVideoPhase", () => {
  it("processing wins over everything", () => {
    expect(initialVideoPhase({ playability: "processing" }, "u", null)).toBe("processing");
  });
  it("VIDEO_FILE_MISSING is missing", () => {
    expect(initialVideoPhase({ playability: "playable" }, null, "VIDEO_FILE_MISSING")).toBe("missing");
  });
  it("no url and no error is absent", () => {
    expect(initialVideoPhase({ playability: "playable" }, null, null)).toBe("absent");
  });
  it("a url, or a retryable error, is idle (Watch)", () => {
    expect(initialVideoPhase({ playability: "playable" }, "u", null)).toBe("idle");
    expect(initialVideoPhase({ playability: "failed" }, "u", null)).toBe("idle");
    expect(initialVideoPhase({ playability: "playable" }, null, "UNKNOWN")).toBe("idle");
    expect(hasWatchAction({ playability: "playable" }, null, "UNKNOWN")).toBe(true);
    expect(hasWatchAction({ playability: "playable" }, null, null)).toBe(false);
  });
});

describe("watchLabel", () => {
  it("reads naturally for mine, named and unnamed opponents", () => {
    expect(watchLabel({ is_mine: true, angle_label: "Your recording" })).toBe("Watch your recording");
    expect(watchLabel({ is_mine: false, angle_label: "Demo Red's recording" })).toBe("Watch Demo Red's recording");
    expect(watchLabel({ is_mine: false, angle_label: "Opponent's recording" })).toBe("Watch opponent's recording");
  });
});
