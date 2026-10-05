import { describe, it, expect } from "vitest";
import {
  videoPlayability,
  videoAngleLabel,
  sortMatchVideosForViewer,
  formatVideoDuration,
  defaultMatchAngle,
  angleLabel,
  angleTag,
  uploadPercent,
} from "./match-video";

describe("videoPlayability", () => {
  it.each(["ready", "processing", "slicing", "analyzing", "analyzed"])(
    "%s is playable",
    (status) => {
      expect(videoPlayability(status)).toBe("playable");
    },
  );

  it.each(["uploading", "merging"])("%s is processing", (status) => {
    expect(videoPlayability(status)).toBe("processing");
  });

  it("failed is failed (the UI still offers Watch)", () => {
    expect(videoPlayability("failed")).toBe("failed");
  });

  it("an unknown future status is attempted as playable", () => {
    expect(videoPlayability("transcoding_v2")).toBe("playable");
    expect(videoPlayability("")).toBe("playable");
  });
});

describe("videoAngleLabel", () => {
  it("labels the viewer's own upload", () => {
    expect(videoAngleLabel("me", "me", "Alice")).toBe("Your recording");
    expect(videoAngleLabel("me", "me", null)).toBe("Your recording");
  });

  it("names the other uploader", () => {
    expect(videoAngleLabel("opp", "me", "Bob")).toBe("Bob's recording");
  });

  it("falls back when the uploader name is missing or blank", () => {
    expect(videoAngleLabel("opp", "me", null)).toBe("Opponent's recording");
    expect(videoAngleLabel("opp", "me", "  ")).toBe("Opponent's recording");
  });
});

describe("sortMatchVideosForViewer", () => {
  it("puts the viewer's videos first and keeps input order within groups", () => {
    const videos = [
      { id: "o1", uploaded_by: "opp" },
      { id: "m1", uploaded_by: "me" },
      { id: "o2", uploaded_by: "opp" },
      { id: "m2", uploaded_by: "me" },
      { id: "x1", uploaded_by: "third" },
    ];
    expect(sortMatchVideosForViewer(videos, "me").map((v) => v.id)).toEqual([
      "m1",
      "m2",
      "o1",
      "o2",
      "x1",
    ]);
  });

  it("does not mutate the input and handles empty lists", () => {
    const videos = [
      { id: "o1", uploaded_by: "opp" },
      { id: "m1", uploaded_by: "me" },
    ];
    sortMatchVideosForViewer(videos, "me");
    expect(videos.map((v) => v.id)).toEqual(["o1", "m1"]);
    expect(sortMatchVideosForViewer([], "me")).toEqual([]);
  });
});

describe("formatVideoDuration", () => {
  it.each([
    [null, null],
    [undefined, null],
    [0, null],
    [-5, null],
    [Number.NaN, null],
    [1, "0:01"],
    [59, "0:59"],
    [60, "1:00"],
    [61, "1:01"],
    [599, "9:59"],
    [3599, "59:59"],
    [3600, "60:00"],
  ])("%s -> %s", (input, expected) => {
    expect(formatVideoDuration(input as number | null | undefined)).toBe(expected);
  });

  it("rounds fractional seconds", () => {
    expect(formatVideoDuration(59.6)).toBe("1:00");
    expect(formatVideoDuration(12.4)).toBe("0:12");
  });
});

describe("wave A angle helpers (jits-n2im.15)", () => {
  it("defaultMatchAngle picks the server-elected primary", () => {
    const vids = [
      { id: "mine", is_primary: false },
      { id: "theirs", is_primary: true },
    ];
    expect(defaultMatchAngle(vids)?.id).toBe("theirs");
  });

  it("defaultMatchAngle falls back to the first (viewer-sorted) angle with no primary", () => {
    expect(defaultMatchAngle([{ id: "mine" }, { id: "theirs", is_primary: null }])?.id).toBe("mine");
    expect(defaultMatchAngle([])).toBeNull();
  });

  it("angleLabel follows the deck", () => {
    expect(angleLabel(true, "D. Okafor")).toBe("Your angle");
    expect(angleLabel(false, "D. Okafor")).toBe("D. Okafor's angle");
    expect(angleLabel(false, "  ")).toBe("Opponent's angle");
  });

  it("angleTag marks only the timekeeper", () => {
    expect(angleTag("timekeeper")).toBe("Timekeeper");
    expect(angleTag("self")).toBeNull();
    expect(angleTag(null)).toBeNull();
  });

  it("sortMatchVideosForViewer puts the timekeeper last", () => {
    const vids = [
      { id: "tk", uploaded_by: "T", recording_type: "timekeeper" },
      { id: "opp", uploaded_by: "B", recording_type: "self" },
      { id: "me", uploaded_by: "A", recording_type: "self" },
    ];
    expect(sortMatchVideosForViewer(vids, "A").map((v) => v.id)).toEqual(["me", "opp", "tk"]);
  });

  it("uploadPercent clamps and rejects unknowns", () => {
    expect(uploadPercent(42, 100)).toBe(42);
    expect(uploadPercent(150, 100)).toBe(100);
    expect(uploadPercent(null, 100)).toBeNull();
    expect(uploadPercent(5, 0)).toBeNull();
  });
});
