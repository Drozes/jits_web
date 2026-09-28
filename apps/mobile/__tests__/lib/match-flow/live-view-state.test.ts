/**
 * What the live broadcast screen shows, derived from the live state. The
 * strip precedence is hold > paused > timeup > final10 > starting.
 */
import {
  deriveLiveView,
  formatAthleteMeta,
  spokenDuration,
  toLiveAthlete,
  type LiveViewInput,
} from "@/lib/match-flow/live-view-state";

const GRANTED = { granted: true, canAskAgain: true };

function view(overrides: Partial<LiveViewInput> = {}) {
  return deriveLiveView({
    remaining: 300,
    paused: false,
    holding: false,
    recorderState: "recording",
    permission: GRANTED,
    opponentEnded: false,
    hasRecorded: true,
    ...overrides,
  });
}

describe("strip", () => {
  it("is empty while recording on a running clock", () => {
    expect(view().strip).toBeNull();
  });

  it("follows hold > paused > timeup > final10 > starting", () => {
    // Everything true at once: hold wins.
    expect(view({ holding: true, paused: true, remaining: 0 }).strip).toBe("hold");
    expect(view({ holding: true, remaining: 5 }).strip).toBe("hold");
    expect(view({ holding: true, recorderState: "idle", hasRecorded: false }).strip).toBe("hold");
    // Paused beats time up and final 10.
    expect(view({ paused: true, remaining: 0 }).strip).toBe("paused");
    expect(view({ paused: true, remaining: 7 }).strip).toBe("paused");
    expect(view({ paused: true, recorderState: "idle", hasRecorded: false }).strip).toBe("paused");
    // Time up beats starting.
    expect(view({ remaining: 0 }).strip).toBe("timeup");
    expect(view({ remaining: 0, recorderState: "idle", hasRecorded: false }).strip).toBe("timeup");
    // Final 10 beats starting.
    expect(view({ remaining: 7, recorderState: "idle", hasRecorded: false }).strip).toBe("final10");
    expect(view({ recorderState: "idle", hasRecorded: false }).strip).toBe("starting");
  });

  it("shows final 10 only for 1..10 seconds left", () => {
    expect(view({ remaining: 11 }).strip).toBeNull();
    expect(view({ remaining: 10 }).strip).toBe("final10");
    expect(view({ remaining: 1 }).strip).toBe("final10");
    expect(view({ remaining: 0 }).strip).toBe("timeup");
  });

  it("is empty once the opponent ended, whatever else is true", () => {
    expect(view({ opponentEnded: true, holding: true, paused: true, remaining: 0 }).strip).toBeNull();
  });

  it("does not show starting without camera permission", () => {
    expect(view({ recorderState: "idle", hasRecorded: false, permission: { granted: false, canAskAgain: true } }).strip).toBeNull();
  });
});

describe("autoEndPending", () => {
  it("is set only at 00:00 on an unpaused clock the opponent did not end", () => {
    expect(view({ remaining: 0 }).autoEndPending).toBe(true);
    expect(view({ remaining: 0, paused: true }).autoEndPending).toBe(false);
    expect(view({ remaining: 0, opponentEnded: true }).autoEndPending).toBe(false);
    expect(view({ remaining: 1 }).autoEndPending).toBe(false);
  });
});

describe("tally", () => {
  it("says REC only while recording", () => {
    expect(view().tally).toBe("rec");
    expect(view({ recorderState: "idle", hasRecorded: false }).tally).toBe("starting");
    expect(view({ recorderState: "stopping", hasRecorded: false }).tally).toBe("starting");
  });

  it("says no video when the camera is unavailable", () => {
    expect(view({ permission: { granted: false, canAskAgain: false } }).tally).toBe("noVideo");
    expect(view({ permission: null, recorderState: "idle", hasRecorded: false }).tally).toBe("noVideo");
    expect(view({ recorderState: "error" }).tally).toBe("noVideo");
  });

  it("says saving (or no video) once the opponent ended", () => {
    for (const s of ["recording", "stopping", "uploading", "uploaded"] as const) {
      expect(view({ opponentEnded: true, recorderState: s }).tally).toBe("saving");
    }
    expect(view({ opponentEnded: true, recorderState: "idle", hasRecorded: false }).tally).toBe("noVideo");
    expect(view({ opponentEnded: true, recorderState: "error" }).tally).toBe("noVideo");
  });
});

describe("after the recording stopped mid-match (interruption or cap)", () => {
  for (const s of ["idle", "stopping", "uploading", "uploaded"] as const) {
    it(`${s}: no video, no starting strip, no dim`, () => {
      const v = view({ recorderState: s, hasRecorded: true });
      expect(v.tally).toBe("noVideo");
      expect(v.strip).toBeNull();
      expect(v.camera).toBe("live");
    });
  }

  it("re-entering an expired match (idle at 00:00, never recorded) is not starting", () => {
    const v = view({ recorderState: "idle", hasRecorded: false, remaining: 0 });
    expect(v.tally).toBe("noVideo");
    expect(v.strip).toBe("timeup");
    expect(v.camera).toBe("live");
  });
});

describe("slab label", () => {
  it("is LIVE while the clock runs, including final 10, starting and no video", () => {
    expect(view().slab).toBe("live");
    expect(view({ remaining: 7 }).slab).toBe("live");
    expect(view({ recorderState: "idle", hasRecorded: false }).slab).toBe("live");
    expect(view({ permission: { granted: false, canAskAgain: false } }).slab).toBe("live");
  });

  it("is PAUSED, TIME or FINAL for those states", () => {
    expect(view({ paused: true }).slab).toBe("paused");
    expect(view({ paused: true, remaining: 0 }).slab).toBe("paused");
    expect(view({ remaining: 0 }).slab).toBe("time");
    expect(view({ opponentEnded: true, paused: true }).slab).toBe("final");
  });
});

describe("camera treatment", () => {
  it("dims while starting and after the opponent ended", () => {
    expect(view().camera).toBe("live");
    expect(view({ recorderState: "idle", hasRecorded: false }).camera).toBe("starting-dim");
    expect(view({ recorderState: "idle", hasRecorded: false, remaining: 0 }).camera).toBe("live");
    expect(view({ opponentEnded: true }).camera).toBe("saving-dim");
  });

  it("names the unavailable variant", () => {
    const denied = view({ permission: { granted: false, canAskAgain: false } });
    expect([denied.camera, denied.unavailable]).toEqual(["unavailable", "denied"]);
    const canAsk = view({ permission: { granted: false, canAskAgain: true } });
    expect([canAsk.camera, canAsk.unavailable]).toEqual(["unavailable", "canAsk"]);
    const error = view({ recorderState: "error" });
    expect([error.camera, error.unavailable]).toEqual(["unavailable", "error"]);
    expect(view().unavailable).toBeNull();
  });
});

describe("toLiveAthlete", () => {
  it("maps a participant to the athlete bar's name and meta", () => {
    expect(toLiveAthlete({ display_name: "K. Reyes", current_elo: 1512, current_weight: 77 })).toEqual({
      name: "K. Reyes",
      meta: "1512 · 77 KG",
    });
    expect(toLiveAthlete({ display_name: "Bot", current_elo: null, current_weight: null }).meta).toBeNull();
  });
});

describe("formatting helpers", () => {
  it("formats the clock and speaks durations", () => {
    expect(spokenDuration(463)).toBe("7 minutes 43 seconds");
    expect(spokenDuration(61)).toBe("1 minute 1 second");
    expect(spokenDuration(120)).toBe("2 minutes");
    expect(spokenDuration(9)).toBe("9 seconds");
  });

  it("builds the athlete meta line, leaving out what is missing", () => {
    expect(formatAthleteMeta(1512, 77)).toBe("1512 · 77 KG");
    expect(formatAthleteMeta(1512, 77.25)).toBe("1512 · 77.3 KG");
    expect(formatAthleteMeta(null, 76)).toBe("76 KG");
    expect(formatAthleteMeta(1498, null)).toBe("1498");
    expect(formatAthleteMeta(null, null)).toBeNull();
  });
});
