import { clearestAngleFor, readMomentAngles, type MomentAngle } from "@/lib/video/multi-angle/moment-angles";

describe("moment angles (keys pending: degrade gracefully)", () => {
  it("reads nothing from an analysis without the keys", () => {
    expect(readMomentAngles(null, undefined, { summary: "x" })).toEqual([]);
    expect(clearestAngleFor(27, [], ["a", "b"])).toBeNull();
  });

  it("reads the likely shapes from the analysis or the match, skipping junk", () => {
    const list = readMomentAngles(
      { moment_angles: "nope" },
      {
        momentAngles: [
          { t_s: 27, best_video_id: "b", clarity: { a: 3, b: 8, c: "x" } },
          { timestamp_s: 192, video_id: "a" },
          { nope: true },
          null,
        ],
      },
    );
    expect(list).toEqual([
      { t: 27, bestVideoId: "b", clarity: { a: 3, b: 8 } },
      { t: 192, bestVideoId: "a", clarity: {} },
    ]);
  });

  it("picks the clearest switchable angle of the nearest moment within 3 s", () => {
    const list: MomentAngle[] = [
      { t: 27, bestVideoId: "b", clarity: { a: 3, b: 8, c: 9 } },
      { t: 192, bestVideoId: "a", clarity: {} },
    ];
    // c is clearest but not switchable (still processing): b.
    expect(clearestAngleFor(28, list, ["a", "b"])).toBe("b");
    expect(clearestAngleFor(190, list, ["a", "b"])).toBe("a");
    expect(clearestAngleFor(100, list, ["a", "b"])).toBeNull();
    expect(clearestAngleFor(192, list, ["b"])).toBeNull();
  });
});
