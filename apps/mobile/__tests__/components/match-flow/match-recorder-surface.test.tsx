/**
 * MatchRecorderCamera under the capture policy (timekeeper mode spec 13,
 * A21 to A23): the hint for each role (TK-REC2 for athletes and practice,
 * TK-REC1 / TK-REC1b plus TK-REC3 for the timekeeper), the 9:16 ready
 * preview, the flag's quality and the timekeeper's lens on the camera, and
 * the same capture reported to the recorder for the video row. Also the
 * dynamic capture bitrate (specs/dynamic-capture-bitrate): the `videoBitrate`
 * prop and the reported decision freeze with the quality at the lock.
 */
import * as React from "react";
import { act, render, within } from "@testing-library/react-native";
import type { RecordingCapture } from "@/lib/video/use-video-recorder";

/** The lenses the mocked iPhone lists (`getAvailableLensesAsync`). */
const mockLenses: { current: string[] } = { current: [] };
/** The props the last CameraView rendered with. */
const mockCameraProps: { current: Record<string, unknown> | null } = { current: null };
/** Every `videoBitrate` the CameraView rendered with, in order. */
const mockBitrates: unknown[] = [];
/** The recordable codecs the mocked iPhone lists (`getAvailableVideoCodecsAsync`). */
const mockCodecs: { current: string[] } = { current: ["hvc1", "avc1"] };
jest.mock("expo-camera", () => {
  const R = require("react");
  const CameraView = R.forwardRef((props: Record<string, unknown>, ref: { current: unknown } | null) => {
    R.useLayoutEffect(() => {
      if (ref) ref.current = { getAvailableLensesAsync: async () => mockLenses.current };
      return () => {
        if (ref) ref.current = null;
      };
    }, []);
    mockCameraProps.current = props;
    mockBitrates.push(props.videoBitrate);
    return null;
  });
  CameraView.getAvailableVideoCodecsAsync = async () => mockCodecs.current;
  return { CameraView };
});

const mockRecorder = {
  state: "idle",
  permission: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain: boolean } | null,
  cameraRef: { current: null as unknown },
  requestPermission: jest.fn(),
  markCameraReady: jest.fn(),
  releaseCamera: jest.fn(),
};
const mockCaptureRef: { current: RecordingCapture | null } = { current: null };
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  useMatchRecorder: () => mockRecorder,
  useMatchRecordingCapture: () => mockCaptureRef,
}));

const mockFlag: { current: { ok: boolean; data?: boolean } } = { current: { ok: true, data: false } };
/** `match_capture_bitrate_off`, the capture bitrate kill switch. */
const mockOffFlag: { current: { ok: boolean; data?: boolean } } = { current: { ok: true, data: false } };
/** Reads of `match_capture_1080p` only. */
const mockGetFeatureFlag = jest.fn(async () => mockFlag.current);
/** Reads of the kill switch only. */
const mockGetOffFlag = jest.fn(async () => mockOffFlag.current);
jest.mock("@jits/shared/api/location", () => ({
  getFeatureFlag: (_client: unknown, key: string) =>
    key === "match_capture_bitrate_off" ? mockGetOffFlag() : mockGetFeatureFlag(),
}));

const mockWindow = { width: 390, height: 844 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow, scale: 3, fontScale: 1 }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA4AE" }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy(
    {},
    { get: (_t, prop) => (prop === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${String(prop)}` })) },
  );
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";
import { MatchRecorderCamera, READY_HINT_TEST_ID } from "@/components/match-flow/match-recorder-surface";
import { __resetCaptureCodecsForTests, primeCaptureCodecCache } from "@/lib/video/capture-codecs";
import { __resetCaptureBitrateHookForTests } from "@/lib/video/use-capture-bitrate";
import { __resetCaptureHistoryForTests } from "@/lib/video/capture-bitrate-history";
import { CAPTURE_POLICY, PRACTICE_CAPTURE, type CapturePolicy } from "@/lib/match-flow/capture-policy";
import type { MatchStep } from "@/lib/match-flow/step-router";

const ATHLETE = CAPTURE_POLICY.self_run.challenger;
const TIMEKEEPER = CAPTURE_POLICY.timekeeper.timekeeper;
const IPHONE = ["Back Camera", "Back Dual Wide Camera", "Back Ultra Wide Camera"];

async function settle() {
  await act(async () => {
    // The capture bitrate inputs (NetInfo, storage, the codec query, the
    // kill switch) take a few more ticks than the quality flag alone.
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** The decision the mocked iPhone reaches on Wi-Fi with no history (hvc1 listed). */
const HEVC_WIFI = (quality: "720p" | "1080p", bitrateBps: number) =>
  expect.objectContaining({ managed: true, quality, codec: "hvc1", ladder: "hevc", level: "normal", bitrateBps, reason: "no_history_wifi" });

/** The native session reports ready (`CameraView onCameraReady`); the lens lookup starts there. */
async function cameraReady() {
  await act(async () => {
    (mockCameraProps.current!.onCameraReady as () => void)();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderCamera(capture: CapturePolicy, step: MatchStep | null = "ready", optedIn = true) {
  const utils = render(<MatchRecorderCamera step={step} capture={capture} optedIn={optedIn} />);
  return {
    ...utils,
    hint: () => utils.queryByTestId(READY_HINT_TEST_ID)?.props.children ?? null,
    step: (next: MatchStep | null, state = mockRecorder.state) => {
      mockRecorder.state = state;
      utils.rerender(<MatchRecorderCamera step={next} capture={capture} optedIn={optedIn} />);
    },
  };
}

beforeEach(async () => {
  mockWindow.width = 390;
  mockWindow.height = 844;
  mockGetFeatureFlag.mockClear();
  mockGetOffFlag.mockClear();
  mockOffFlag.current = { ok: true, data: false };
  mockCodecs.current = ["hvc1", "avc1"];
  mockBitrates.length = 0;
  __resetCaptureCodecsForTests();
  __resetCaptureBitrateHookForTests();
  __resetCaptureHistoryForTests();
  await AsyncStorage.clear();
  mockRecorder.markCameraReady.mockClear();
  mockRecorder.state = "idle";
  mockRecorder.permission = { granted: true, canAskAgain: true };
  mockRecorder.cameraRef = { current: null };
  mockCaptureRef.current = null;
  mockCameraProps.current = null;
  mockLenses.current = IPHONE;
  mockFlag.current = { ok: true, data: false };
});

describe("athletes, both modes and practice (A21, A23)", () => {
  it.each([
    ["two-athlete match", ATHLETE],
    ["timekeeper mode", CAPTURE_POLICY.timekeeper.opponent],
    ["practice", PRACTICE_CAPTURE],
  ])("%s: TK-REC2 beside the 9:16 preview, on the default lens at 720p", async (_name, capture) => {
    const s = renderCamera(capture);
    await settle();
    expect(s.hint()).toBe("Hold your phone upright and keep both of you in frame.");
    expect(s.getByTestId("camera-frame").props.style).toEqual({ aspectRatio: 9 / 16 });
    expect(s.queryByTestId("camera-wide-lens-tag")).toBeNull();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "720p", selectedLens: undefined }));
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "default", bitrate: HEVC_WIFI("720p", 3_000_000) });
  });

  it("the retired sideways hint is gone", async () => {
    const s = renderCamera(ATHLETE);
    await settle();
    expect(s.queryByText(/sideways/i)).toBeNull();
    expect(s.queryByTestId("ready-rotate-hint")).toBeNull();
  });
});

describe("the timekeeper (A21)", () => {
  it("an iPhone with an ultrawide: selected, tagged WIDE LENS, TK-REC1, and reported for the row", async () => {
    const s = renderCamera(TIMEKEEPER);
    await settle();
    await cameraReady();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ selectedLens: "Back Ultra Wide Camera" }));
    s.getByTestId("camera-wide-lens-tag");
    expect(s.hint()).toBe("Hold your phone upright. The wide lens keeps the whole mat in frame.");
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "ultrawide", bitrate: HEVC_WIFI("720p", 3_000_000) });
  });

  it("no ultrawide (iPhone SE): the default lens, TK-REC1b, no tag", async () => {
    mockLenses.current = ["Back Camera"];
    const s = renderCamera(TIMEKEEPER);
    await settle();
    await cameraReady();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ selectedLens: undefined }));
    expect(s.queryByTestId("camera-wide-lens-tag")).toBeNull();
    expect(s.hint()).toBe("Hold your phone upright. Step back so the whole mat fits.");
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "default", bitrate: HEVC_WIFI("720p", 3_000_000) });
  });

  it("no hint until the lens lookup answers, so an ultrawide iPhone never shows the step-back hint first", async () => {
    const s = renderCamera(TIMEKEEPER);
    await settle();
    expect(s.hint()).toBeNull();
    s.getByText("Preview only. Recording starts with the match.");
    await cameraReady();
    expect(s.hint()).toBe("Hold your phone upright. The wide lens keeps the whole mat in frame.");
  });

  it("the camera's ready still reaches the recorder (its deferred start resumes there)", async () => {
    renderCamera(TIMEKEEPER);
    await settle();
    await cameraReady();
    expect(mockRecorder.markCameraReady).toHaveBeenCalledTimes(1);
  });
});

describe("capture quality (A22)", () => {
  it("the flag ON records 1080p, and the row is told so", async () => {
    mockFlag.current = { ok: true, data: true };
    renderCamera(ATHLETE);
    await settle();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "1080p" }));
    expect(mockCaptureRef.current).toEqual({ quality: "1080p", lens: "default", bitrate: HEVC_WIFI("1080p", 4_500_000) });
  });

  it("read during the face-off, before the camera warms on ready", async () => {
    mockFlag.current = { ok: true, data: true };
    const s = renderCamera(ATHLETE, "weight");
    await settle();
    expect(mockCameraProps.current).toBeNull();
    s.step("ready");
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "1080p" }));
  });

  it("re-entering a live match (a relaunch): the clip records on the defaults, 720p and the default lens, since nothing may switch under it (trade-off on jits-o47s.14)", async () => {
    mockFlag.current = { ok: true, data: true };
    mockRecorder.state = "recording";
    const s = renderCamera(TIMEKEEPER, "live");
    await settle();
    await cameraReady();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    expect(mockGetOffFlag).not.toHaveBeenCalled();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "720p", selectedLens: undefined }));
    // No codec list cached on this "phone" yet: iOS records as today (D6).
    expect(mockCaptureRef.current).toEqual({
      quality: "720p",
      lens: "default",
      bitrate: expect.objectContaining({ managed: false, reason: "ios_codec_unknown" }),
    });
    expect(mockCameraProps.current?.videoBitrate).toBeUndefined();
    expect(s.queryByTestId("camera-wide-lens-tag")).toBeNull();
  });

  it("the value in effect on ready carries through live unchanged", async () => {
    mockFlag.current = { ok: true, data: true };
    const s = renderCamera(TIMEKEEPER);
    await settle();
    await cameraReady();
    s.step("live", "recording");
    await settle();
    expect(mockCameraProps.current).toEqual(
      expect.objectContaining({ videoQuality: "1080p", selectedLens: "Back Ultra Wide Camera" }),
    );
    expect(mockCaptureRef.current).toEqual({ quality: "1080p", lens: "ultrawide", bitrate: HEVC_WIFI("1080p", 4_500_000) });
    expect(mockCameraProps.current?.videoBitrate).toBe(4_500_000);
  });
});

describe("who reads the flag", () => {
  it("a viewer who does not record never reads it (no camera, no capture)", async () => {
    const s = renderCamera(ATHLETE, "weight", false);
    s.step("ready");
    await settle();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    expect(mockGetOffFlag).not.toHaveBeenCalled();
    expect(mockCameraProps.current).toBeNull();
  });

  it("one read per face-off for a viewer who records", async () => {
    const s = renderCamera(ATHLETE, "weight");
    s.step("ready");
    await settle();
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
    expect(mockGetOffFlag).toHaveBeenCalledTimes(1);
  });
});

// Dynamic capture bitrate (specs/dynamic-capture-bitrate, AC 7): the bitrate is
// decided on the face-off and frozen with the quality at the lock. On Android a
// new `videoBitrate` prop recreates the camera, so it must never change under a
// recording.
describe("capture bitrate", () => {
  it("no bitrate until the inputs land (today's recording), then the decision", async () => {
    const s = renderCamera(ATHLETE);
    expect(mockCameraProps.current?.videoBitrate).toBeUndefined();
    expect(mockCaptureRef.current?.bitrate).toEqual(expect.objectContaining({ managed: false, reason: "pending" }));
    await settle();
    expect(mockCameraProps.current?.videoBitrate).toBe(3_000_000);
    s.unmount();
  });

  it("frozen from the lock: the prop and the reported decision never change through the recording", async () => {
    const s = renderCamera(ATHLETE);
    await settle();
    s.step("live", "recording");
    const frozen = mockCaptureRef.current?.bitrate;
    const rendersAtLock = mockBitrates.length;
    // The network changes mid-match and the viewfinder re-renders.
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ type: "cellular", isInternetReachable: true, details: { cellularGeneration: "3g" } });
    mockFlag.current = { ok: true, data: true };
    s.step("live", "recording");
    await settle();
    s.step("live", "stopping");
    await settle();
    expect(mockBitrates.length).toBeGreaterThan(rendersAtLock);
    expect(new Set(mockBitrates.slice(rendersAtLock - 1))).toEqual(new Set([3_000_000]));
    expect(mockCaptureRef.current?.bitrate).toBe(frozen);
    expect(mockCaptureRef.current?.quality).toBe("720p");
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ type: "wifi", isConnected: true, isInternetReachable: true, details: null });
  });

  it("inputs and the 1080p answer landing after the lock are dropped: the clip records as it started", async () => {
    let answerQuality: (v: unknown) => void = () => undefined;
    let answerOff: (v: unknown) => void = () => undefined;
    mockGetFeatureFlag.mockImplementationOnce(() => new Promise((res) => (answerQuality = res)) as never);
    mockGetOffFlag.mockImplementationOnce(() => new Promise((res) => (answerOff = res)) as never);
    const s = renderCamera(ATHLETE);
    await settle();
    s.step("live", "recording");
    await act(async () => {
      answerQuality({ ok: true, data: true });
      answerOff({ ok: true, data: false });
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    s.step("live", "recording");
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "720p", videoBitrate: undefined }));
    expect(mockCaptureRef.current?.bitrate).toEqual(expect.objectContaining({ managed: false, reason: "pending" }));
  });

  it("re-entering a live match with the codec list cached: the weak level on the very first render, nothing read (D6)", async () => {
    await AsyncStorage.setItem(
      "elo-capture-codecs::v1",
      JSON.stringify({ os: String(Platform.Version), codecs: ["hvc1", "avc1"] }),
    );
    await primeCaptureCodecCache();
    mockRecorder.state = "recording";
    renderCamera(ATHLETE, "live");
    expect(mockBitrates[0]).toBe(2_500_000);
    await settle();
    expect(mockGetOffFlag).not.toHaveBeenCalled();
    expect(mockCaptureRef.current?.bitrate).toEqual(
      expect.objectContaining({ managed: true, codec: "hvc1", level: "weak", reason: "reentry", bitrateBps: 2_500_000 }),
    );
  });

  it("the kill switch on: no codec and no bitrate", async () => {
    mockOffFlag.current = { ok: true, data: true };
    renderCamera(ATHLETE);
    await settle();
    expect(mockCameraProps.current?.videoBitrate).toBeUndefined();
    expect(mockCaptureRef.current?.bitrate).toEqual(expect.objectContaining({ managed: false, reason: "disabled", codec: null }));
    // Reset the process-wide last-known value for the next suites.
    __resetCaptureBitrateHookForTests();
  });

  it("Android: decided during the weight check, the camera mounts on ready with the H.264 prop and no codec", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      const s = renderCamera(ATHLETE, "weight");
      await settle();
      s.step("ready");
      expect(mockBitrates[0]).toBe(4_000_000);
      expect(mockCaptureRef.current?.bitrate).toEqual(
        expect.objectContaining({ managed: true, codec: null, ladder: "h264", level: "normal", bitrateBps: 4_000_000 }),
      );
      s.step("live", "recording");
      await settle();
      expect(new Set(mockBitrates)).toEqual(new Set([4_000_000]));
    } finally {
      restore.restore();
    }
  });

  it("Android, camera up before the inputs land (a timekeeper, or a slow read): the prop never changes after the mount (review M1)", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      const s = renderCamera(TIMEKEEPER, "ready");
      await settle();
      await cameraReady();
      s.step("live", "recording");
      await settle();
      expect(mockBitrates.length).toBeGreaterThan(1);
      expect(new Set(mockBitrates)).toEqual(new Set([undefined]));
      expect(mockCaptureRef.current?.bitrate).toEqual(expect.objectContaining({ managed: false, reason: "pending" }));
    } finally {
      restore.restore();
    }
  });
});

// The ready step's controls never sit lower than under the shipped 16:9 card
// (M9 review round 1): the 9:16 card keeps its two lines beside it.
describe("the ready block", () => {
  it("portrait: the preview line and the hint sit beside the 9:16 card, in one row", async () => {
    const s = renderCamera(ATHLETE);
    await settle();
    const beside = s.getByTestId("ready-notes-beside");
    expect(beside.props.className).toContain("flex-1");
    expect(within(beside).getByTestId(READY_HINT_TEST_ID).props.children).toBe(
      "Hold your phone upright and keep both of you in frame.",
    );
    within(beside).getByText("Preview only. Recording starts with the match.");
    expect(s.getByTestId("camera-card").props.style).toEqual(expect.objectContaining({ alignSelf: "flex-start" }));
    expect(s.getByTestId("camera-card").props.style.width).toBeCloseTo(138.27, 2);
  });

  it("a landscape window keeps the lines under the 16:9 card", async () => {
    mockWindow.width = 844;
    mockWindow.height = 390;
    const s = renderCamera(ATHLETE);
    await settle();
    expect(s.queryByTestId("ready-notes-beside")).toBeNull();
    expect(s.hint()).toBe("Hold your phone upright and keep both of you in frame.");
  });

  it("a landscape capture policy keeps the full-width card with its line under it", async () => {
    const s = renderCamera({ ...ATHLETE, recordingOrientation: "landscape_locked" });
    await settle();
    expect(s.queryByTestId("ready-notes-beside")).toBeNull();
    s.getByText("Preview only. Recording starts with the match.");
  });
});

describe("where the hint shows", () => {
  it("only on the ready step, never over the live screen", async () => {
    const s = renderCamera(ATHLETE);
    await settle();
    expect(s.hint()).not.toBeNull();
    s.step("live", "recording");
    expect(s.hint()).toBeNull();
  });

  it("not under the permission card", async () => {
    mockRecorder.permission = { granted: false, canAskAgain: true };
    const s = renderCamera(TIMEKEEPER);
    await settle();
    expect(s.hint()).toBeNull();
    // No camera mounted, so no lens lookup either.
    expect(mockCameraProps.current).toBeNull();
  });

  it("a landscape capture policy (the spec 13.6 seam): the wide card and no portrait instruction", async () => {
    const s = renderCamera({ ...TIMEKEEPER, recordingOrientation: "landscape_locked" });
    await settle();
    expect(s.hint()).toBeNull();
    expect(s.getByTestId("camera-frame").props.style).toEqual({ aspectRatio: 16 / 9 });
  });
});
