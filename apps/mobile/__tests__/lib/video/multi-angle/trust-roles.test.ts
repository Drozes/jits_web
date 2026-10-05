import { isHard, offsetOf, referenceAngleId, syncTrust, type AngleVideo } from "@/lib/video/multi-angle/trust";
import { planAngles, switchModeFor, type PlanAngle } from "@/lib/video/multi-angle/roles";
import { deviceTier, playingCap, ANDROID_MIN_MEMORY_FOR_HOT } from "@/lib/video/multi-angle/device-tier";

function vid(id: string, over: Partial<AngleVideo> = {}): AngleVideo {
  return {
    id,
    uploaded_by: "u",
    uploaded_by_name: null,
    status: "ready",
    playability: "playable",
    duration_seconds: 300,
    camera_angle: null,
    has_analysis: false,
    is_mine: false,
    angle_label: "",
    poster_url: null,
    ...over,
  } as AngleVideo;
}

describe("syncTrust (clock-only handling)", () => {
  const offsets = { ref: 0, a: -163, c: 2400 };
  it("the reference is the reference", () => {
    expect(syncTrust(vid("ref"), "ref", offsets)).toBe("reference");
  });
  it("audio with a confidence and offsets on both ends is audio-synced", () => {
    expect(syncTrust(vid("a", { sync_source: "audio", sync_confidence: 0.8 }), "ref", offsets)).toBe("audio");
    expect(syncTrust(vid("a", { sync_source: " AUDIO ", sync_confidence: 0.6 }), "ref", offsets)).toBe("audio");
  });
  it("anything else is clock-only: missing keys, clock, manual, null confidence, no offset", () => {
    expect(syncTrust(vid("a"), "ref", offsets)).toBe("clock");
    expect(syncTrust(vid("c", { sync_source: "clock", sync_confidence: null }), "ref", offsets)).toBe("clock");
    expect(syncTrust(vid("a", { sync_source: "manual", sync_confidence: 1 }), "ref", offsets)).toBe("clock");
    expect(syncTrust(vid("a", { sync_source: "audio", sync_confidence: null }), "ref", offsets)).toBe("clock");
    expect(syncTrust(vid("x", { sync_source: "audio", sync_confidence: 0.9 }), "ref", offsets)).toBe("clock");
    expect(syncTrust(vid("a", { sync_source: "audio", sync_confidence: 0.9 }), "ref", { a: -163 })).toBe("clock");
  });
  it("isHard: reference and audio only", () => {
    expect(isHard("reference")).toBe(true);
    expect(isHard("audio")).toBe(true);
    expect(isHard("clock")).toBe(false);
  });
  it("offsetOf prefers the row's own offset, then the separate read", () => {
    expect(offsetOf(vid("a", { sync_offset_ms: 5 }), { a: 9 })).toBe(5);
    expect(offsetOf(vid("a"), { a: 9 })).toBe(9);
    expect(offsetOf(vid("a"), {})).toBeNull();
  });
  it("referenceAngleId: the playable primary, else the entry", () => {
    expect(referenceAngleId([vid("a"), vid("b", { is_primary: true })], "a")).toBe("b");
    expect(referenceAngleId([vid("a"), vid("b", { is_primary: true, playability: "processing" })], "a")).toBe("a");
    expect(referenceAngleId([vid("a"), vid("b")], "a")).toBe("a");
  });
});

describe("deviceTier (conservative Android detection)", () => {
  const strong = { os: "android", apiLevel: 34, totalMemory: 8 * 1024 ** 3, yearClass: 2023 };
  it("iOS is always full", () => {
    expect(deviceTier({ os: "ios", apiLevel: null, totalMemory: null, yearClass: null })).toEqual({ tier: "full", reason: null });
  });
  it("a recent, roomy Android is full", () => {
    expect(deviceTier(strong)).toEqual({ tier: "full", reason: null });
  });
  it.each([
    [{ apiLevel: 29 }, "old-os"],
    [{ apiLevel: null }, "old-os"],
    [{ totalMemory: null }, "unknown-memory"],
    [{ totalMemory: ANDROID_MIN_MEMORY_FOR_HOT - 1 }, "low-memory"],
    [{ yearClass: 2018 }, "old-device"],
  ])("warm-only when %j (%s)", (over, reason) => {
    expect(deviceTier({ ...strong, ...over })).toEqual({ tier: "warm-only", reason });
  });
  it("caps playing decoders: 2 on Android and iOS, 1 when warm-only", () => {
    expect(playingCap("android", "full")).toBe(2);
    expect(playingCap("ios", "full")).toBe(2);
    expect(playingCap("android", "warm-only")).toBe(1);
  });
});

describe("planAngles", () => {
  const A = (id: string, trust: PlanAngle["trust"], hotEligible = true): PlanAngle => ({ id, trust, hotEligible });
  const three = [A("ref", "reference"), A("opp", "audio"), A("tk", "audio")];

  it("Best angle on screen: it is the master, the next audio angle is the hot standby, the third stays warm", () => {
    expect(planAngles({ angles: three, visibleId: "ref", referenceId: "ref", os: "ios", tier: "full" })).toEqual({
      visibleId: "ref",
      masterId: "ref",
      hot: ["ref", "opp"],
      warm: ["tk"],
      capped: null,
    });
  });

  it("an audio-synced angle on screen keeps the Best angle's audio as the master (visible muted slave)", () => {
    const p = planAngles({ angles: three, visibleId: "opp", referenceId: "ref", os: "android", tier: "full" });
    expect(p.masterId).toBe("ref");
    expect(p.hot).toEqual(["ref", "opp"]);
    expect(p.warm).toEqual(["tk"]);
  });

  it("never more than two playing decoders on Android, whatever is on screen", () => {
    for (const visibleId of ["ref", "opp", "tk"]) {
      const p = planAngles({ angles: three, visibleId, referenceId: "ref", os: "android", tier: "full" });
      expect(p.hot.length).toBeLessThanOrEqual(2);
      expect(p.hot).toContain(visibleId);
    }
  });

  it("a warm-only phone plays only the visible angle, with its own audio, and records the cap", () => {
    const p = planAngles({ angles: three, visibleId: "opp", referenceId: "ref", os: "android", tier: "warm-only" });
    expect(p).toMatchObject({ masterId: "opp", hot: ["opp"], capped: "ref" });
    const q = planAngles({ angles: three, visibleId: "ref", referenceId: "ref", os: "android", tier: "warm-only" });
    expect(q).toMatchObject({ masterId: "ref", hot: ["ref"], capped: "opp" });
  });

  it("a clock-only angle on screen plays alone with its own audio; nothing is lock-stepped to it", () => {
    const angles = [A("ref", "reference"), A("opp", "audio"), A("tk", "clock")];
    expect(planAngles({ angles, visibleId: "tk", referenceId: "ref", os: "ios", tier: "full" })).toEqual({
      visibleId: "tk",
      masterId: "tk",
      hot: ["tk"],
      warm: ["ref", "opp"],
      capped: null,
    });
  });

  it("a clock-only angle is never the hidden standby", () => {
    const angles = [A("ref", "reference"), A("tk", "clock")];
    const p = planAngles({ angles, visibleId: "ref", referenceId: "ref", os: "ios", tier: "full" });
    expect(p.hot).toEqual(["ref"]);
  });

  it("an angle not hot-eligible (HEVC original on Android, or demoted) is never a hidden standby", () => {
    const angles = [A("ref", "reference"), A("opp", "audio", false), A("tk", "audio")];
    expect(planAngles({ angles, visibleId: "ref", referenceId: "ref", os: "android", tier: "full" }).hot).toEqual(["ref", "tk"]);
    // An ineligible reference cannot be the audio bed under another angle.
    const b = [A("ref", "reference", false), A("opp", "audio")];
    expect(planAngles({ angles: b, visibleId: "opp", referenceId: "ref", os: "android", tier: "full" })).toMatchObject({ masterId: "opp", hot: ["opp"] });
  });
});

describe("switchModeFor", () => {
  it("swap only to a hot angle that is in step", () => {
    expect(switchModeFor("reference", "audio", { hot: true, inStep: true })).toBe("swap");
    expect(switchModeFor("audio", "reference", { hot: true, inStep: false })).toBe("seek");
    expect(switchModeFor("reference", "audio", { hot: false, inStep: false })).toBe("seek");
  });
  it("dips whenever either end is clock-only", () => {
    expect(switchModeFor("reference", "clock", { hot: true, inStep: true })).toBe("dip");
    expect(switchModeFor("clock", "reference", { hot: false, inStep: false })).toBe("dip");
  });
});
