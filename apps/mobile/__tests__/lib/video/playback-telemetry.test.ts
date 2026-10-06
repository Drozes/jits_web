const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));

import {
  PlaybackSession,
  outcomeOf,
  rebufferBucket,
  reportPlaybackSession,
  scrubPlaybackError,
  startupBucket,
  SEEK_EXEMPT_MS,
  type PlaybackSessionMeta,
} from "@/lib/video/playback-telemetry";

const MATCH: PlaybackSessionMeta = { surface: "match", videoId: "vid-1", angle: "mine", angleCount: 2 };
const REEL: PlaybackSessionMeta = { surface: "highlight", videoId: null, angle: null, angleCount: null };

/** A match session opened at t=0 with autoplay, its URL signed at `signAt`. */
function matchSession(signAt = 400) {
  const s = new PlaybackSession(MATCH, 0);
  s.playIntent(true, 0);
  s.sourceAttached("normalized", signAt);
  return s;
}

beforeEach(() => mockCaptureMessage.mockReset());

describe("PlaybackSession", () => {
  it("measures sign time and time to first frame from the open (autoplay)", () => {
    const s = matchSession(400);
    s.status("loading", 450);
    s.status("readyToPlay", 900);
    s.playing(true, 1000);
    const out = s.summary(61_000, "unmount");
    expect(out.signMs).toBe(400);
    expect(out.timeToFirstFrameMs).toBe(1000);
    expect(out.startupAbandoned).toBe(false);
    expect(out.watchMs).toBe(60_000);
    expect(out.watchMinutes).toBe(1);
    expect(out.sessionMs).toBe(61_000);
    expect(out.sourceKind).toBe("normalized");
    // The startup wait before the first frame is not a stall.
    expect(out.stallCount).toBe(0);
  });

  it("takes the view's first frame when it comes before playing", () => {
    const s = matchSession();
    s.firstFrame(700);
    s.playing(true, 900);
    expect(s.summary(1000, "unmount").timeToFirstFrameMs).toBe(700);
  });

  it("counts a stall as loading while meant to play, after the first frame", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.position(10);
    // Buffer runs dry: AVPlayer waits (loading, not playing).
    s.status("loading", 11_000);
    s.playing(false, 11_000);
    s.status("readyToPlay", 13_500);
    s.playing(true, 13_500);
    s.status("loading", 20_000);
    s.playing(false, 20_000);
    s.status("readyToPlay", 20_500);
    s.playing(true, 20_500);
    const out = s.summary(30_500, "unmount");
    expect(out.stallCount).toBe(2);
    expect(out.stallMs).toBe(3000);
    expect(out.longestStallMs).toBe(2500);
    expect(out.watchMs).toBe(10_000 + 6_500 + 10_000);
    expect(out.rebufferRatio).toBeCloseTo(3000 / 29_500, 4);
  });

  it("does not count the wait after a seek as a stall", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.seekRequested(5000);
    s.status("loading", 5000);
    s.status("readyToPlay", 6000);
    // The next drop is a real stall again.
    s.status("loading", 9000);
    s.status("readyToPlay", 9400);
    const out = s.summary(10_000, "unmount");
    expect(out.seekCount).toBe(1);
    expect(out.stallCount).toBe(1);
    expect(out.stallMs).toBe(400);
  });

  it("does not count the reload after a re-signed URL as a stall", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.error("expired");
    s.status("error", 5000);
    s.resigned();
    s.sourceAttached("normalized", 5400);
    s.status("loading", 5500);
    s.status("readyToPlay", 6500);
    // The resume seek back to the position.
    s.expectWait(6500);
    s.status("loading", 6500);
    s.status("readyToPlay", 6800);
    s.playing(true, 6800);
    const out = s.summary(7000, "unmount");
    expect(out.stallCount).toBe(0);
    expect(out.seekCount).toBe(0);
    expect(out.signMs).toBe(400);
  });

  it("a seek that never buffers does not swallow the next real stall (M1)", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.position(10);
    // A skip inside the buffer: no loading/readyToPlay pair at all.
    s.seekRequested(2000);
    s.position(20); // where it landed
    s.position(20.25); // playing on from there: the exemption is over
    s.status("loading", 30_000);
    s.status("readyToPlay", 31_000);
    const out = s.summary(32_000, "unmount");
    expect(out.stallCount).toBe(1);
    expect(out.stallMs).toBe(1000);
  });

  it("a seek whose first update is still the old spot, then lands, keeps its exemption (r2-1)", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.position(10);
    s.seekRequested(2000);
    s.position(10.2); // pre-seek tick
    s.position(50); // the seek lands: a jump, not progress
    s.status("loading", 2300); // buffering at the new spot
    s.status("readyToPlay", 3000);
    expect(s.summary(3500, "unmount").stallCount).toBe(0);
  });

  it("a seek's exemption also expires on its own after 1.5 s", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.seekRequested(2000);
    // No position updates at all (paused-looking stream), then a stall.
    s.status("loading", 2000 + SEEK_EXEMPT_MS + 1);
    s.status("readyToPlay", 5000);
    expect(s.summary(6000, "unmount").stallCount).toBe(1);
  });

  it("playing again after a seek ends its exemption", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.seekRequested(2000);
    s.playing(true, 2100);
    s.status("loading", 2200);
    s.status("readyToPlay", 2700);
    expect(s.summary(3000, "unmount")).toMatchObject({ stallCount: 1, stallMs: 500 });
  });

  it("counts stalls for playback started without an explicit intent (native controls, restore)", () => {
    const s = new PlaybackSession(REEL, 0);
    s.sourceAttached("highlight", 0);
    s.playing(true, 1000);
    s.status("loading", 3000);
    s.status("readyToPlay", 3500);
    expect(s.summary(4000, "unmount").stallCount).toBe(1);
  });

  it("a reel's re-signed swap is an expected load, not a stall", () => {
    const s = new PlaybackSession(REEL, 0);
    s.sourceAttached("highlight", 0);
    s.playIntent(true, 500);
    s.playing(true, 800);
    s.sourceAttached("highlight", 5000);
    s.status("loading", 5000);
    s.status("readyToPlay", 6000);
    expect(s.summary(7000, "unmount").stallCount).toBe(0);
  });

  it("does not count buffering while paused, and pausing ends an open stall", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.status("loading", 2000);
    s.playIntent(false, 2500);
    s.playing(false, 2500);
    s.status("loading", 3000);
    s.status("readyToPlay", 8000);
    const out = s.summary(9000, "unmount");
    expect(out.stallCount).toBe(1);
    expect(out.stallMs).toBe(500);
  });

  it("closes an open stall and the watch clock at the end", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.status("loading", 4000);
    const out = s.summary(6000, "background");
    expect(out.stallMs).toBe(2000);
    expect(out.watchMs).toBe(5000);
    expect(out.endReason).toBe("background");
  });

  it("flags a startup the athlete gave up on", () => {
    const s = matchSession();
    const out = s.summary(9000, "unmount");
    expect(out.timeToFirstFrameMs).toBeNull();
    expect(out.startupAbandoned).toBe(true);
    expect(outcomeOf(out)).toBe("abandoned_startup");
  });

  it("an error the re-sign recovered from is counted but is not the outcome", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.playing(false, 5000);
    s.error("The operation could not be completed https://x.supabase.co/sign/a.mp4?token=SECRET");
    s.resigned();
    s.playing(true, 6000);
    const out = s.summary(7000, "unmount");
    expect(out.errorCount).toBe(1);
    expect(out.resignCount).toBe(1);
    expect(out.endedInError).toBe(false);
    expect(out.error).toBe("The operation could not be completed <url>");
    expect(outcomeOf(out)).toBe("watched");
  });

  it("an error with nothing played after it is the outcome", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.error("boom");
    s.playing(false, 2000);
    const out = s.summary(3000, "unmount");
    expect(out.endedInError).toBe(true);
    expect(outcomeOf(out)).toBe("error");
  });

  it("records completion, duration and the furthest position", () => {
    const s = matchSession();
    s.duration(400);
    s.playing(true, 1000);
    s.position(120);
    s.position(399.9);
    s.position(Number.NaN);
    s.ended();
    s.playing(false, 2000);
    const out = s.summary(2000, "unmount");
    expect(out).toMatchObject({ completed: true, durationS: 400, maxPositionS: 399.9 });
    expect(outcomeOf(out)).toBe("completed");
  });

  it("reports a match session once a source reached the player, not before", () => {
    const opened = new PlaybackSession(MATCH, 0);
    expect(opened.shouldReport()).toBe(false);
    opened.sourceAttached("original", 10);
    expect(opened.shouldReport()).toBe(true);
  });

  it("reports an open that was abandoned while signing (M2)", () => {
    const s = new PlaybackSession(MATCH, 0);
    s.playIntent(true, 0);
    expect(s.shouldReport()).toBe(true);
    const out = s.summary(4000, "unmount");
    expect(out).toMatchObject({ signOutcome: "pending", signMs: null, startupAbandoned: true, sourceKind: null });
    expect(outcomeOf(out)).toBe("abandoned_startup");
  });

  it("a failed or unplayable sign is its own outcome, not an abandoned startup", () => {
    const failed = new PlaybackSession(MATCH, 0);
    failed.playIntent(true, 0);
    failed.setSignOutcome("failed");
    const f = failed.summary(900, "unmount");
    expect(f).toMatchObject({ signOutcome: "failed", startupAbandoned: false });
    expect(outcomeOf(f)).toBe("sign_failed");

    const processing = new PlaybackSession(MATCH, 0);
    processing.playIntent(true, 0);
    processing.setSignOutcome("processing");
    expect(outcomeOf(processing.summary(900, "unmount"))).toBe("unavailable");
  });

  it("reports a reel only once it was played", () => {
    const s = new PlaybackSession(REEL, 0);
    s.sourceAttached("highlight", 0);
    // The view drew frame 0 at rest: not a first frame (no intent yet).
    s.firstFrame(100);
    expect(s.shouldReport()).toBe(false);
    s.playIntent(true, 5000);
    s.playing(true, 5300);
    expect(s.shouldReport()).toBe(true);
    const out = s.summary(8300, "unmount");
    expect(out.timeToFirstFrameMs).toBe(300);
    expect(out.signMs).toBeNull();
  });

  it("a continuation after the background reports only if something happened", () => {
    const quiet = new PlaybackSession(MATCH, 0, { resumed: true, sourceKind: "normalized" });
    expect(quiet.shouldReport()).toBe(false);
    const watched = new PlaybackSession(MATCH, 0, { resumed: true, sourceKind: "normalized", wantPlay: true });
    watched.playing(true, 100);
    expect(watched.shouldReport()).toBe(true);
    const out = watched.summary(1100, "unmount");
    expect(out).toMatchObject({ resumed: true, sourceKind: "normalized", signMs: null, watchMs: 1000, signOutcome: null });
    // A warm resume is not a startup (m3).
    expect(out.timeToFirstFrameMs).toBeNull();
  });

  it("carries the network type and the meta set later", () => {
    const s = new PlaybackSession({ ...MATCH, angle: null, angleCount: null }, 0);
    s.setNetwork("cellular", "4g");
    s.setMeta({ angle: "opponent", angleCount: 2 });
    s.sourceAttached("original", 0);
    expect(s.summary(10, "unmount")).toMatchObject({
      networkType: "cellular",
      cellularGeneration: "4g",
      angle: "opponent",
      angleCount: 2,
    });
  });
});

describe("reportPlaybackSession", () => {
  it("sends ONE info event with the dimensions as tags and the numbers as extra", () => {
    const s = matchSession();
    s.setNetwork("wifi", null);
    s.playing(true, 1000);
    const summary = s.summary(5000, "unmount");
    reportPlaybackSession(summary);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith("Video playback session", {
      level: "info",
      tags: {
        "video.playback.surface": "match",
        "video.playback.source": "normalized",
        "video.playback.network": "wifi",
        "video.playback.outcome": "watched",
        "video.playback.mode": "single",
        "video.playback.rendition": "unknown",
        "video.playback.rendition_final": "unknown",
        "video.playback.start_reason": "none",
        "video.playback.quality_pref": "none",
        "video.playback.stepdown": "none",
        "video.playback.resumed": "false",
        "video.playback.network_key": "none",
        "video.playback.stalled": "no",
        "video.playback.startup_bucket": "lt1s",
        "video.playback.rebuffer_bucket": "0",
      },
      extra: summary,
    });
  });

  it("never throws when Sentry does", () => {
    mockCaptureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });
    expect(() => reportPlaybackSession(matchSession().summary(1, "unmount"))).not.toThrow();
  });
});

describe("scrubPlaybackError", () => {
  it("removes signed URLs and bounds the length", () => {
    expect(scrubPlaybackError(null)).toBeNull();
    expect(scrubPlaybackError("x https://a/b?token=1 y")).toBe("x <url> y");
    expect(scrubPlaybackError("e".repeat(500))).toHaveLength(200);
  });
});

describe("PlaybackSession angle switches (multi-angle P0)", () => {
  it("keeps one session across switches and times tap to the new angle's first frame", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.switchStarted(5000);
    s.sourceAttached("normalized", 5010);
    s.switchLanded(5300);
    s.switchStarted(9000);
    s.switchLanded(9100);
    s.switchStarted(12_000);
    s.switchLanded(12_500);
    const out = s.summary(20_000, "unmount");
    expect(out.switchCount).toBe(3);
    expect(out.switchLatencyMs).toBe(300);
    expect(out.switchLatencyMaxMs).toBe(500);
    // The first startup is still the session's time to first frame.
    expect(out.timeToFirstFrameMs).toBe(1000);
  });

  it("does not count the switched-in angle's load as a stall", () => {
    const s = matchSession();
    s.playing(true, 1000);
    s.switchStarted(5000);
    s.status("loading", 5050);
    s.status("readyToPlay", 5400);
    expect(s.summary(6000, "unmount").stallCount).toBe(0);
  });

  it("a switch with no frame yet (left, or superseded) has no latency; a stray landing is ignored", () => {
    const s = matchSession();
    s.switchStarted(5000);
    s.switchStarted(6000);
    s.switchLanded(6200);
    s.switchLanded(7000);
    const out = s.summary(8000, "unmount");
    expect(out.switchCount).toBe(2);
    expect(out.switchLatencyMs).toBe(200);
    expect(out.switchLatencyMaxMs).toBe(200);
  });

  it("reports no switch fields' values without a switch", () => {
    const out = matchSession().summary(1000, "unmount");
    expect(out).toMatchObject({ switchCount: 0, switchLatencyMs: null, switchLatencyMaxMs: null });
  });

  it("accepts the timekeeper angle as its own dimension", () => {
    const s = new PlaybackSession({ ...MATCH, angle: "timekeeper", angleCount: 3 }, 0);
    expect(s.summary(10, "unmount")).toMatchObject({ angle: "timekeeper", angleCount: 3 });
  });
});

describe("PlaybackSession multi-angle fields", () => {
  it("counts switch modes, reports residual percentiles and decoder-cap events", () => {
    const s = new PlaybackSession({ ...MATCH, playerMode: "multi", deviceTier: "warm-only" }, 0);
    s.playIntent(true, 0);
    s.sourceAttached("normalized", 100);
    s.switchStarted(1000, "swap");
    s.switchStarted(2000, "seek");
    s.switchStarted(3000, "dip");
    s.switchStarted(4000, "seek");
    for (let i = 1; i <= 20; i += 1) s.syncResidual(i / 1000);
    s.decoderCap("warm-only:low-memory");
    s.decoderCap("decoder-error");
    s.decoderCap("decoder-error");
    const out = s.summary(5000, "unmount");
    expect(out).toMatchObject({
      playerMode: "multi",
      deviceTier: "warm-only",
      switchCount: 4,
      switchSwapCount: 1,
      switchSeekCount: 2,
      switchDipCount: 1,
      syncResidualP50Ms: 10,
      syncResidualP95Ms: 19,
      syncSamples: 20,
      decoderCapEvents: 3,
      decoderCapReasons: "decoder-error,warm-only:low-memory",
    });
  });

  it("is empty for the single player", () => {
    expect(matchSession().summary(10, "unmount")).toMatchObject({
      switchSwapCount: 0,
      syncResidualP50Ms: null,
      syncSamples: 0,
      decoderCapEvents: 0,
      decoderCapReasons: null,
    });
  });

  it("tags the player mode", () => {
    reportPlaybackSession(new PlaybackSession({ ...MATCH, playerMode: "multi" }, 0).summary(1, "unmount"));
    expect(mockCaptureMessage.mock.calls[0][1].tags["video.playback.mode"]).toBe("multi");
    reportPlaybackSession(matchSession().summary(1, "unmount"));
    expect(mockCaptureMessage.mock.calls[1][1].tags["video.playback.mode"]).toBe("single");
  });

  it("does not tag a player mode on a reel (#53 review N1)", () => {
    const s = new PlaybackSession({ ...REEL, playerMode: "multi" }, 0);
    s.playIntent(true, 0);
    s.sourceAttached("highlight", 0);
    reportPlaybackSession(s.summary(10, "unmount"));
    expect(mockCaptureMessage.mock.calls[0][1].tags).not.toHaveProperty("video.playback.mode");
  });
});

// ---------------------------------------------------------------------------
// Adaptive quality (jits-xfvd.12, spec 05 section 5.6)
// ---------------------------------------------------------------------------

const QMETA = {
  qualityPreference: "auto" as const,
  settingsVersion: 1,
  settingsSource: "server" as const,
  adaptiveEnabled: true,
  networkKey: "cellular_4g",
  connectionExpensive: true,
  startTarget: "720" as const,
  startReason: "network_default" as const,
};

/** A match session on 720 from t=0, playing (first frame) at 1000. */
function qualitySession() {
  const s = matchSession(400);
  s.setQuality(QMETA);
  s.renditionAttached("720", "pb1", 400);
  s.playing(true, 1000);
  return s;
}

describe("PlaybackSession adaptive quality", () => {
  it("buckets watch time per served rendition; the buckets sum to watchMs", () => {
    const s = qualitySession();
    s.qualitySwitchStarted("720", "360", "stall_long", 11_000);
    s.renditionAttached("360", "pb1", 11_200);
    s.playing(false, 30_000);
    s.playing(true, 31_000);
    s.renditionAttached("original", null, 41_000);
    const out = s.summary(51_000, "unmount");
    expect(out.msOn720).toBe(10_200);
    expect(out.msOn360).toBe(28_800);
    expect(out.msOnOriginal).toBe(10_000);
    expect(out.msOn720 + out.msOn360 + out.msOnOriginal).toBe(out.watchMs);
    expect(out).toMatchObject({
      startRendition: "720",
      finalRendition: "original",
      startFallback: false,
      playbackProfile: "pb1",
      ...QMETA,
    });
  });

  it("startFallback when the served start differs from the target; playerStartupMs is ttff minus sign", () => {
    const s = matchSession(400);
    s.setQuality({ ...QMETA, startTarget: "360" });
    s.renditionAttached("720", null, 400);
    s.playing(true, 1500);
    const out = s.summary(2000, "unmount");
    expect(out.startFallback).toBe(true);
    expect(out.playerStartupMs).toBe(1100);
  });

  it("a quality switch is not an angle switch: no switchCount, no switch latency", () => {
    const s = qualitySession();
    s.qualitySwitchStarted("720", "360", "stall_repeat", 5000);
    s.qualitySwitchLanded(5600);
    const out = s.summary(10_000, "unmount");
    expect(out).toMatchObject({
      switchCount: 0,
      switchLatencyMs: null,
      qualitySwitchCount: 1,
      qualityStepDownCount: 1,
      qualityStepUpCount: 0,
      qualitySwitchLatencyMs: 600,
      qualitySwitchLatencyMaxMs: 600,
      qualitySwitches: [{ atMs: 5000, from: "720", to: "360", reason: "stall_repeat" }],
      qualitySwitchesTruncated: false,
    });
  });

  it("the quality swap's reload is exempt from stalls, like an angle swap", () => {
    const s = qualitySession();
    s.qualitySwitchStarted("720", "360", "stall_long", 5000);
    s.status("loading", 5050);
    s.status("readyToPlay", 5600);
    expect(s.summary(6000, "unmount").stallCount).toBe(0);
  });

  it("freezes stalls before the first step-down (an open stall up to now) and counts the rest after", () => {
    const s = qualitySession();
    s.status("loading", 2000);
    s.status("readyToPlay", 2500);
    s.status("loading", 4000);
    // The step-down fires while the second stall is open.
    s.qualitySwitchStarted("720", "360", "stall_long", 5200);
    s.status("readyToPlay", 5600);
    s.playing(true, 5600);
    s.status("loading", 9000);
    s.status("readyToPlay", 9300);
    const out = s.summary(12_000, "unmount");
    expect(out).toMatchObject({
      stallsBeforeStepDown: 2,
      stallMsBeforeStepDown: 1700,
      stallsAfterStepDown: 1,
      stallMsAfterStepDown: 300,
    });
  });

  it("before/after figures stay null without a stall-driven step-down (a step-up only)", () => {
    const s = qualitySession();
    s.qualitySwitchStarted("360", "720", "smooth", 40_000);
    const out = s.summary(50_000, "unmount");
    expect(out).toMatchObject({ qualityStepUpCount: 1, stallsBeforeStepDown: null, stallsAfterStepDown: null });
  });

  it("keeps the first 8 quality switches and flags the rest as truncated", () => {
    const s = qualitySession();
    for (let i = 0; i < 10; i += 1) s.qualitySwitchStarted(i % 2 ? "360" : "720", i % 2 ? "720" : "360", i % 2 ? "smooth" : "stall_long", 2000 + i * 1000);
    const out = s.summary(20_000, "unmount");
    expect(out.qualitySwitchCount).toBe(10);
    expect(out.qualitySwitches).toHaveLength(8);
    expect(out.qualitySwitchesTruncated).toBe(true);
    expect(out.qualitySwitches[0]).toEqual({ atMs: 2000, from: "720", to: "360", reason: "stall_long" });
  });

  it("carries the controller's lock and cap flags", () => {
    const s = qualitySession();
    s.qualityFlags({ lockedLow: true, capReached: false });
    s.qualityFlags({ lockedLow: false, capReached: true });
    expect(s.summary(2000, "unmount")).toMatchObject({ qualityLockedLow: true, qualityCapReached: true });
  });

  it("onStall fires exactly when stallCount increments and when an open stall closes", () => {
    const events: Array<[string, number]> = [];
    const s = new PlaybackSession(MATCH, 0, { onStall: (e) => events.push([e.kind, e.at]) });
    s.playIntent(true, 0);
    s.sourceAttached("normalized", 400);
    s.playing(true, 1000);
    s.status("loading", 2000);
    s.status("loading", 2100); // still the same stall
    s.status("readyToPlay", 2600);
    s.seekRequested(3000);
    s.status("loading", 3100); // a seek's wait: not a stall
    s.status("readyToPlay", 3300);
    s.status("loading", 5000);
    s.playIntent(false, 5400); // paused: the stall closes
    expect(events).toEqual([
      ["start", 2000],
      ["end", 2600],
      ["start", 5000],
      ["end", 5400],
    ]);
    expect(s.summary(6000, "unmount").stallCount).toBe(2);
  });

  it("a reel has null, 0 or false quality fields and `none` quality tags", () => {
    const s = new PlaybackSession(REEL, 0);
    s.playIntent(true, 0);
    s.sourceAttached("highlight", 0);
    s.playing(true, 500);
    const out = s.summary(5000, "unmount");
    expect(out).toMatchObject({
      qualityPreference: null,
      networkKey: null,
      startRendition: null,
      finalRendition: null,
      startFallback: false,
      qualitySwitchCount: 0,
      msOn720: 0,
      msOn360: 0,
      msOnOriginal: 0,
      stallsBeforeStepDown: null,
      qualityLockedLow: false,
      playerStartupMs: null,
    });
    reportPlaybackSession(out);
    const tags = mockCaptureMessage.mock.calls[0][1].tags;
    expect(tags).toMatchObject({
      "video.playback.rendition": "none",
      "video.playback.rendition_final": "none",
      "video.playback.start_reason": "none",
      "video.playback.quality_pref": "none",
      "video.playback.stepdown": "none",
      "video.playback.network_key": "none",
      "video.playback.startup_bucket": "none",
    });
  });

  it("tags a match session's quality dimensions", () => {
    const s = qualitySession();
    s.status("loading", 2000);
    s.qualitySwitchStarted("720", "360", "stall_long", 3000);
    s.renditionAttached("360", "pb1", 3100);
    s.playing(true, 3500);
    reportPlaybackSession(s.summary(60_000, "unmount"));
    expect(mockCaptureMessage.mock.calls[0][1].tags).toMatchObject({
      "video.playback.mode": "single",
      "video.playback.rendition": "720",
      "video.playback.rendition_final": "360",
      "video.playback.start_reason": "network_default",
      "video.playback.quality_pref": "auto",
      "video.playback.stepdown": "stall",
      "video.playback.network_key": "cellular_4g",
      "video.playback.stalled": "yes",
      "video.playback.startup_bucket": "lt1s",
    });
  });

  it("a match session with no file reached reads rendition unknown", () => {
    const s = new PlaybackSession(MATCH, 0);
    s.playIntent(true, 0);
    reportPlaybackSession(s.summary(100, "unmount"));
    expect(mockCaptureMessage.mock.calls[0][1].tags["video.playback.rendition"]).toBe("unknown");
  });
});

describe("PlaybackSession continuation (review telemetry M1)", () => {
  it("a resumed session reports no start fallback, carries an earlier step-down and tags resumed", () => {
    const s = new PlaybackSession(MATCH, 0, {
      resumed: true,
      sourceKind: "normalized",
      wantPlay: true,
      rendition: { served: "360", playbackProfile: null },
    });
    s.setQuality(QMETA);
    s.qualityFlags({ lockedLow: false, capReached: false, steppedDown: true });
    s.playing(true, 100);
    const out = s.summary(5000, "unmount");
    expect(out.startFallback).toBeNull();
    expect(out.qualitySteppedDown).toBe(true);
    reportPlaybackSession(out);
    expect(mockCaptureMessage.mock.calls[0][1].tags).toMatchObject({
      "video.playback.resumed": "true",
      "video.playback.stepdown": "stall",
    });
  });
});

describe("quality tag buckets", () => {
  it.each([
    [null, "none"],
    [0, "lt1s"],
    [999, "lt1s"],
    [1000, "1to2s"],
    [2499, "2to2.5s"],
    [2500, "2.5to3s"],
    [3000, "3to5s"],
    [5000, "gte5s"],
  ])("startup %p -> %s", (ms, bucket) => {
    expect(startupBucket(ms)).toBe(bucket);
  });

  it.each([
    [null, "none"],
    [0, "0"],
    [0.005, "lt1pct"],
    [0.01, "1to2pct"],
    [0.02, "2to5pct"],
    [0.05, "gte5pct"],
    [0.4, "gte5pct"],
  ])("rebuffer %p -> %s", (ratio, bucket) => {
    expect(rebufferBucket(ratio)).toBe(bucket);
  });
});
