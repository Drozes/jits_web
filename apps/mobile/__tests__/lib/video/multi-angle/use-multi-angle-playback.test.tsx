import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockTelemetry = {
  setMeta: jest.fn(),
  sourceAttached: jest.fn(),
  signOutcome: jest.fn(),
  resigned: jest.fn(),
  playIntent: jest.fn(),
  seekRequested: jest.fn(),
  expectWait: jest.fn(),
  firstFrame: jest.fn(),
  switchStarted: jest.fn(),
  switchLanded: jest.fn(),
  syncResidual: jest.fn(),
  decoderCap: jest.fn(),
  error: jest.fn(),
  setQuality: jest.fn(),
  renditionAttached: jest.fn(),
  qualitySwitchStarted: jest.fn(),
  qualitySwitchLanded: jest.fn(),
  onStall: jest.fn((cb: (e: { kind: "start" | "end"; at: number }) => void) => {
    mockStallListeners.add(cb);
    return () => mockStallListeners.delete(cb);
  }),
};
const mockStallListeners = new Set<(e: { kind: "start" | "end"; at: number }) => void>();
jest.mock("@/lib/video/use-playback-telemetry", () => ({ usePlaybackTelemetry: () => mockTelemetry }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/motion", () => ({ haptics: { select: jest.fn(async () => undefined) } }));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({ getMatchVideoPlaybackResult: (...a: unknown[]) => mockSign(...a) }));
jest.mock("expo-video", () => require("../../../support/fake-expo-video"));

import { fakePlayers, readyPlayer, resetFakeVideo, tick } from "../../../support/fake-expo-video";
import { useMultiAnglePlayback, DIP_MS, type MultiAngleInput } from "@/lib/video/multi-angle/use-multi-angle-playback";
import { FRAME_S } from "@/lib/video/multi-angle/sync-controller";
import type { AngleVideo } from "@/lib/video/multi-angle/trust";

const IOS = { os: "ios", apiLevel: null, totalMemory: null, yearClass: null };
const BUDGET_ANDROID = { os: "android", apiLevel: 33, totalMemory: 3 * 1024 ** 3, yearClass: 2021 };

function v(id: string, over: Partial<AngleVideo> = {}): AngleVideo {
  return {
    id,
    uploaded_by: id,
    uploaded_by_name: id,
    status: "ready",
    playability: "playable",
    duration_seconds: 400,
    camera_angle: null,
    has_analysis: false,
    is_mine: false,
    angle_label: "",
    poster_url: null,
    ...over,
  } as AngleVideo;
}

/** Best angle (mine, primary), the opponent audio-synced 2.5 s later, the timekeeper per `tk`. */
function match(tk: Partial<AngleVideo> = { sync_source: "clock", sync_offset_ms: 4000 }): AngleVideo[] {
  return [
    v("ref", { is_mine: true, is_primary: true, sync_offset_ms: 0 }),
    v("opp", { sync_offset_ms: 2500, sync_source: "audio", sync_confidence: 0.8 }),
    v("tk", { recording_type: "timekeeper", ...tk }),
  ];
}

let clock = 1_000_000;
beforeEach(() => {
  jest.clearAllMocks();
  resetFakeVideo();
  clock = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  mockSign.mockImplementation((_c: unknown, id: string) =>
    Promise.resolve({ ok: true, data: { url: `https://s/${id}.mp4`, posterUrl: null, status: "ready", playability: "playable", matchId: "m", durationSeconds: 400, sourceKind: "normalized" } }),
  );
});
afterEach(() => jest.restoreAllMocks());

const P = { ref: 0, opp: 1, tk: 2 } as const;

async function openAll(opts: { device?: MultiAngleInput["device"]; videos?: AngleVideo[] } = {}) {
  const base: MultiAngleInput = { entryId: "ref", startS: null, videos: null, device: opts.device ?? IOS };
  const hook = renderHook((props: MultiAngleInput) => useMultiAnglePlayback(props), { initialProps: base });
  await waitFor(() => expect(fakePlayers[0].replaceAsync).toHaveBeenCalledWith({ uri: "https://s/ref.mp4" }));
  act(() => readyPlayer(0));
  // The entry plays before the match (and its other angles) is known.
  expect(fakePlayers[0].playing).toBe(true);
  hook.rerender({ ...base, videos: opts.videos ?? match() });
  await waitFor(() => expect(fakePlayers[2].replaceAsync).toHaveBeenCalled());
  act(() => {
    readyPlayer(1);
    readyPlayer(2);
  });
  return hook;
}

/** Master at `t` with the opponent's slave `errS` off its target (seconds). */
function sample(t: number, errS: number) {
  act(() => {
    tick(P.opp, t - 2.5 + errS);
    tick(P.ref, t);
  });
}

describe("useMultiAnglePlayback roles and audio", () => {
  it("one player per angle: the Best angle plays unmuted as master, the opponent hot and muted, the clock-only timekeeper warm", async () => {
    const { result } = await openAll();
    expect(fakePlayers).toHaveLength(3);
    expect(result.current.plan).toEqual({ visibleId: "ref", masterId: "ref", hot: ["ref", "opp"], warm: ["tk"], capped: null });
    expect(fakePlayers[P.ref]).toMatchObject({ playing: true, muted: false });
    expect(fakePlayers[P.opp]).toMatchObject({ playing: true, muted: true });
    expect(fakePlayers[P.tk]).toMatchObject({ playing: false, muted: true });
    expect(result.current.angles.map((a) => [a.id, a.trust])).toEqual([
      ["ref", "reference"],
      ["opp", "audio"],
      ["tk", "clock"],
    ]);
  });

  it("treats every angle as clock-only when the backend sends no sync keys", async () => {
    const videos = [v("ref", { is_mine: true, is_primary: true }), v("opp"), v("tk")];
    const { result } = await openAll({ videos });
    expect(result.current.angles.map((a) => a.trust)).toEqual(["reference", "clock", "clock"]);
    expect(result.current.plan?.hot).toEqual(["ref"]);
  });
});

describe("useMultiAnglePlayback drift loop", () => {
  it("nudges an ahead slave's rate, then hard re-seeks it past the threshold, and reports residuals", async () => {
    const { result } = await openAll();
    expect(result.current.plan?.hot).toContain("opp");
    fakePlayers[P.opp].rates.length = 0;
    for (let i = 0; i < 3; i += 1) {
      clock += 250;
      sample(10 + i * 0.25, 0.06);
    }
    expect(fakePlayers[P.opp].rates.at(-1)).toBeCloseTo(0.97, 6);
    expect(mockTelemetry.syncResidual).toHaveBeenCalledWith(expect.closeTo(0.06, 6));
    // Out by a second (a stall on the slave): exact re-seek to the target.
    const seeks = fakePlayers[P.opp].seeks.length;
    for (let i = 0; i < 3; i += 1) {
      clock += 250;
      sample(11 + i * 0.25, 1);
    }
    // The median turns on the second bad sample (11.25 s); the settle window
    // then keeps the third from seeking again.
    expect(fakePlayers[P.opp].seeks.length).toBe(seeks + 1);
    expect(fakePlayers[P.opp].seeks.at(-1)).toBeCloseTo(11.25 - 2.5, 3);
  });

  it("re-seeks warm angles to the current moment every 5 s while playing", async () => {
    await openAll({ videos: match({ sync_source: "clock", sync_offset_ms: 4000 }) });
    clock += 6000;
    act(() => tick(P.ref, 20));
    // The timekeeper started 4 s later: its file is 4 s behind the timeline.
    expect(fakePlayers[P.tk].seeks.at(-1)).toBeCloseTo(16, 6);
  });
});

describe("useMultiAnglePlayback switch modes", () => {
  it("swap: a hot, in-step angle cuts in at once and the Best angle's audio carries on", async () => {
    const { result } = await openAll();
    act(() => result.current.slots[P.opp].onFirstFrameRender());
    for (let i = 0; i < 3; i += 1) {
      clock += 250;
      sample(10 + i * 0.25, 0.01);
    }
    let mode: string | null = null;
    act(() => {
      mode = result.current.switchTo("opp");
    });
    expect(mode).toBe("swap");
    expect(result.current.visibleId).toBe("opp");
    expect(mockTelemetry.switchStarted).toHaveBeenCalledWith("swap");
    expect(mockTelemetry.switchLanded).toHaveBeenCalledTimes(1);
    expect(fakePlayers[P.ref]).toMatchObject({ playing: true, muted: false });
    expect(fakePlayers[P.opp]).toMatchObject({ playing: true, muted: true });
    expect(result.current.slots[P.opp].visible).toBe(true);
    expect(result.current.slots[P.ref].visible).toBe(false);
  });

  it("seek: a warm audio-synced angle seeks exactly behind a held frame, then shows", async () => {
    const { result } = await openAll({ videos: match({ sync_source: "audio", sync_confidence: 0.7, sync_offset_ms: -1000 }) });
    expect(result.current.plan?.warm).toEqual(["tk"]);
    clock += 250;
    act(() => tick(P.ref, 30));
    let mode: string | null = null;
    act(() => {
      mode = result.current.switchTo("tk");
    });
    expect(mode).toBe("seek");
    // The timekeeper started 1 s earlier: 31 s into its file.
    expect(fakePlayers[P.tk].seeks.at(-1)).toBeCloseTo(31, 6);
    expect(fakePlayers[P.tk].play).toHaveBeenCalled();
    expect(fakePlayers[P.ref].generateThumbnailsAsync).toHaveBeenCalledWith([30]);
    await waitFor(() => expect(result.current.heldFrame).toEqual({ fakeThumbnail: true, t: 30 }));
    expect(result.current.visibleId).toBe("ref");
    act(() => tick(P.tk, 31.1));
    expect(result.current.visibleId).toBe("tk");
    expect(result.current.heldFrame).toBeNull();
    // The Best angle stays the audio bed; the standby becomes the Best angle.
    expect(result.current.plan).toMatchObject({ masterId: "ref", hot: ["ref", "tk"] });
    expect(fakePlayers[P.tk].muted).toBe(true);
    expect(fakePlayers[P.opp].playing).toBe(false);
  });

  it("dip: a clock-only angle dips to black, plays its own audio alone, and never lock-steps", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    try {
      const { result } = await openAll();
      clock += 250;
      act(() => tick(P.ref, 30));
      let mode: string | null = null;
      const before = fakePlayers[P.tk].seeks.length;
      act(() => {
        mode = result.current.switchTo("tk");
      });
      expect(mode).toBe("dip");
      expect(result.current.dipped).toBe(true);
      // Black first: the cut waits for the dip.
      expect(fakePlayers[P.tk].seeks).toHaveLength(before);
      act(() => jest.advanceTimersByTime(DIP_MS));
      // Approximate: 4 s later than the Best angle.
      expect(fakePlayers[P.tk].seeks.at(-1)).toBeCloseTo(26, 6);
      act(() => tick(P.tk, 26.2));
      expect(result.current.visibleId).toBe("tk");
      expect(result.current.plan).toEqual({ visibleId: "tk", masterId: "tk", hot: ["tk"], warm: ["ref", "opp"], capped: null });
      expect(fakePlayers[P.tk]).toMatchObject({ muted: false, playing: true });
      expect(fakePlayers[P.ref].playing).toBe(false);
      expect(fakePlayers[P.opp].playing).toBe(false);
      act(() => jest.advanceTimersByTime(DIP_MS));
      expect(result.current.dipped).toBe(false);
      // The timeline stays on the Best angle's clock: 26.2 s local + 4 s.
      expect(result.current.positionS).toBeCloseTo(30.2, 6);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a paused switch lands paused and frame step moves every angle by one frame", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    try {
      const { result } = await openAll({ videos: match({ sync_source: "audio", sync_confidence: 0.7, sync_offset_ms: -1000 }) });
      act(() => tick(P.ref, 12));
      act(() => result.current.setPlaying(false));
      fakePlayers.forEach((p) => p.play.mockClear());
      act(() => {
        result.current.switchTo("tk");
      });
      act(() => jest.advanceTimersByTime(400));
      expect(result.current.visibleId).toBe("tk");
      fakePlayers.forEach((p) => expect(p.play).not.toHaveBeenCalled());
      act(() => result.current.stepFrame(1));
      expect(fakePlayers[P.ref].seeks.at(-1)).toBeCloseTo(12 + FRAME_S, 6);
      expect(fakePlayers[P.tk].seeks.at(-1)).toBeCloseTo(13 + FRAME_S, 6);
      expect(result.current.positionS).toBeCloseTo(12 + FRAME_S, 6);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("useMultiAnglePlayback on Android", () => {
  it("a budget phone runs warm-only: one decoder playing, the cap reported", async () => {
    const { result } = await openAll({ device: BUDGET_ANDROID });
    expect(result.current.tier).toEqual({ tier: "warm-only", reason: "low-memory" });
    expect(result.current.plan).toMatchObject({ hot: ["ref"], capped: "opp" });
    expect(fakePlayers.filter((p) => p.playing)).toHaveLength(1);
    expect(mockTelemetry.decoderCap).toHaveBeenCalledWith("warm-only:low-memory");
    // A switch there is a seek, never a swap, and audio follows the picture.
    clock += 250;
    act(() => tick(P.ref, 10));
    let mode: string | null = null;
    act(() => {
      mode = result.current.switchTo("opp");
    });
    expect(mode).toBe("seek");
    act(() => tick(P.opp, 7.5));
    expect(result.current.plan).toMatchObject({ masterId: "opp", hot: ["opp"] });
    expect(fakePlayers[P.opp].muted).toBe(false);
    expect(fakePlayers.filter((p) => p.playing)).toHaveLength(1);
  });

  it("never runs three decoders, even mid-switch, on a full Android phone", async () => {
    const strong = { os: "android", apiLevel: 34, totalMemory: 8 * 1024 ** 3, yearClass: 2023 };
    const { result } = await openAll({ device: strong, videos: match({ sync_source: "audio", sync_confidence: 0.7, sync_offset_ms: -1000 }) });
    let maxPlaying = 0;
    fakePlayers.forEach((p) => {
      const play = p.play.getMockImplementation()!;
      p.play.mockImplementation(() => {
        play();
        maxPlaying = Math.max(maxPlaying, fakePlayers.filter((x) => x.playing).length);
      });
    });
    clock += 250;
    act(() => tick(P.ref, 30));
    act(() => {
      result.current.switchTo("tk");
    });
    act(() => tick(P.tk, 31));
    expect(result.current.visibleId).toBe("tk");
    expect(maxPlaying).toBeLessThanOrEqual(2);
    expect(fakePlayers.filter((p) => p.playing)).toHaveLength(2);
  });

  it("never plays an HEVC original as a hidden standby on Android", async () => {
    mockSign.mockImplementation((_c: unknown, id: string) =>
      Promise.resolve({ ok: true, data: { url: `https://s/${id}.mp4`, posterUrl: null, status: "ready", playability: "playable", matchId: "m", durationSeconds: 400, sourceKind: id === "opp" ? "original" : "normalized" } }),
    );
    const strong = { os: "android", apiLevel: 34, totalMemory: 8 * 1024 ** 3, yearClass: 2023 };
    const { result } = await openAll({ device: strong });
    expect(result.current.plan?.hot).toEqual(["ref"]);
  });

  it("a decoder error demotes the standby to warm and re-signs it once", async () => {
    const strong = { os: "android", apiLevel: 34, totalMemory: 8 * 1024 ** 3, yearClass: 2023 };
    const { result } = await openAll({ device: strong });
    expect(result.current.plan?.hot).toEqual(["ref", "opp"]);
    await act(async () => {
      fakePlayers[P.opp].emit("statusChange", { status: "error", error: { message: "MediaCodec decoder init failed" } });
    });
    expect(mockTelemetry.decoderCap).toHaveBeenCalledWith("decoder-error");
    await waitFor(() => expect(fakePlayers[P.opp].replaceAsync).toHaveBeenCalledTimes(2));
    act(() => readyPlayer(P.opp));
    expect(result.current.plan?.hot).toEqual(["ref"]);
    expect(result.current.plan?.warm).toContain("opp");
  });
});

describe("useMultiAnglePlayback adaptive quality (same policy as the single player)", () => {
  type Avail = { "720": boolean; "360": boolean };
  const BOTH: Avail = { "720": true, "360": true };
  const NONE: Avail = { "720": false, "360": false };
  function signCopies(copies: Record<string, Avail>) {
    mockSign.mockImplementation((_c: unknown, id: string, opts: { rendition: string }) => {
      const a = copies[id] ?? BOTH;
      const served =
        opts.rendition === "360" ? (a["360"] ? "360" : a["720"] ? "720" : "original") : a["720"] ? "720" : a["360"] ? "360" : "original";
      return Promise.resolve({
        ok: true,
        data: {
          url: `https://s/${id}.${served}.mp4`,
          posterUrl: null,
          status: "ready",
          playability: "playable",
          matchId: "m",
          durationSeconds: 400,
          sourceKind: served === "original" ? "original" : "normalized",
          target: opts.rendition,
          servedRendition: served,
          available: a,
          playbackProfile: null,
        },
      });
    });
  }
  beforeEach(() => {
    mockStallListeners.clear();
    require("@/lib/video/quality/preference").__resetPlaybackQualityPreferenceForTests("auto");
    require("@/lib/video/quality/history-store").__resetPlaybackHistoryForTests();
    require("@/lib/video/quality/settings-store").__resetPlaybackSettingsStoreForTests();
    require("@/lib/video/quality/network-store").__resetNetworkStoreForTests({ type: "wifi", details: null });
  });
  const stall = (kind: "start" | "end") => act(() => mockStallListeners.forEach((cb) => cb({ kind, at: clock })));

  async function openAt(url: (id: string) => string) {
    const base: MultiAngleInput = { entryId: "ref", startS: null, videos: null, device: IOS };
    const hook = renderHook((props: MultiAngleInput) => useMultiAnglePlayback(props), { initialProps: base });
    await waitFor(() => expect(fakePlayers[0].replaceAsync).toHaveBeenCalledWith({ uri: url("ref") }));
    act(() => readyPlayer(0));
    hook.rerender({ ...base, videos: match() });
    await waitFor(() => expect(fakePlayers[2].replaceAsync).toHaveBeenCalled());
    act(() => {
      readyPlayer(1);
      readyPlayer(2);
    });
    act(() => hook.result.current.slots[P.ref].onFirstFrameRender());
    return hook;
  }

  it("every slot signs at the session's rendition (Data saver: 360)", async () => {
    signCopies({});
    require("@/lib/video/quality/preference").__resetPlaybackQualityPreferenceForTests("data_saver");
    await openAt((id) => `https://s/${id}.360.mp4`);
    for (const id of ["ref", "opp", "tk"]) expect(mockSign).toHaveBeenCalledWith({}, id, { rendition: "360" });
    expect(mockSign).not.toHaveBeenCalledWith({}, expect.anything(), { rendition: "720" });
  });

  it("a step-down reloads the visible slot in place behind a held frame, without switchStarted", async () => {
    signCopies({});
    const { result } = await openAt((id) => `https://s/${id}.720.mp4`);
    act(() => tick(P.ref, 10));
    clock += 5000;
    act(() => tick(P.ref, 15));
    stall("start");
    clock += 1000;
    act(() => tick(P.ref, 15.05));
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledWith("720", "360", "stall_long", expect.anything());
    expect(mockTelemetry.switchStarted).not.toHaveBeenCalled();
    await waitFor(() => expect(fakePlayers[P.ref].replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/ref.360.mp4" }));
    // Every slot follows the one level.
    await waitFor(() => expect(fakePlayers[P.opp].replaceAsync).toHaveBeenLastCalledWith({ uri: "https://s/opp.360.mp4" }));
    await waitFor(() => expect(result.current.heldFrame).not.toBeNull());
    // A reloading slot is not switchable.
    expect(result.current.angles.find((a) => a.id === "opp")?.switchable).toBe(false);
    act(() => readyPlayer(P.ref));
    const seekTo = fakePlayers[P.ref].seeks.at(-1)!;
    expect(seekTo).toBeGreaterThan(14.9);
    expect(mockTelemetry.qualitySwitchLanded).not.toHaveBeenCalled();
    act(() => tick(P.ref, seekTo + 0.05));
    expect(mockTelemetry.qualitySwitchLanded).toHaveBeenCalledTimes(1);
    expect(result.current.heldFrame).toBeNull();
    expect(mockTelemetry.switchLanded).not.toHaveBeenCalled();
    expect(fakePlayers[P.ref].playing).toBe(true);
  });

  it("review M2: a failed 360 re-sign keeps every slot on its old file (not dead) and playback goes on", async () => {
    signCopies({});
    const base = mockSign.getMockImplementation()!;
    mockSign.mockImplementation((c: unknown, id: string, o: { rendition: string }) =>
      o.rendition === "360" ? Promise.resolve({ ok: false, error: { code: "UNKNOWN", message: "down" } }) : base(c, id, o),
    );
    const { result } = await openAt((id) => `https://s/${id}.720.mp4`);
    act(() => tick(P.ref, 10));
    clock += 5000;
    act(() => tick(P.ref, 15));
    stall("start");
    clock += 1000;
    act(() => tick(P.ref, 15.05));
    expect(mockTelemetry.qualitySwitchStarted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.angles.every((a) => a.switchable)).toBe(true));
    expect(result.current.phase).toBe("ready");
    expect(result.current.heldFrame).toBeNull();
    expect(mockTelemetry.qualitySwitchLanded).not.toHaveBeenCalled();
    // No player got a new URL; the visible one plays on.
    expect(fakePlayers[P.ref].replaceAsync).toHaveBeenCalledTimes(1);
    expect(fakePlayers[P.ref].playing).toBe(true);
  });

  it("review M3: pausing during a long stall never steps down", async () => {
    signCopies({});
    mockTelemetry.playIntent.mockImplementation((want: boolean) => {
      if (!want) mockStallListeners.forEach((cb) => cb({ kind: "end", at: clock }));
    });
    const { result } = await openAt((id) => `https://s/${id}.720.mp4`);
    act(() => tick(P.ref, 10));
    clock += 5000;
    act(() => tick(P.ref, 15));
    stall("start");
    clock += 1500;
    act(() => result.current.toggle());
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
    mockTelemetry.playIntent.mockImplementation(() => undefined);
  });

  it("a switch to an original-only angle makes the controller inert there", async () => {
    signCopies({ opp: NONE });
    const { result } = await openAt((id) => `https://s/${id}.720.mp4`);
    // A seek switch to opp, landed by its 1.5 s timeout at the latest.
    act(() => {
      result.current.switchTo("opp");
    });
    await waitFor(() => expect(mockTelemetry.switchLanded).toHaveBeenCalled(), { timeout: 3000 });
    expect(mockTelemetry.renditionAttached).toHaveBeenLastCalledWith("original", null);
    clock += 5000;
    act(() => tick(P.opp, 20));
    stall("start");
    clock += 3000;
    act(() => tick(P.opp, 20.1));
    expect(mockTelemetry.qualitySwitchStarted).not.toHaveBeenCalled();
  });
});
