const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));

import {
  PlaybackSession,
  outcomeOf,
  reportPlaybackSession,
  scrubPlaybackError,
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
    expect(out).toMatchObject({ resumed: true, sourceKind: "normalized", signMs: null, watchMs: 1000 });
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
