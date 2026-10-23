/**
 * MatchRecorderCamera under the capture policy (timekeeper mode spec 13,
 * A21 to A23): the hint for each role (TK-REC2 for athletes and practice,
 * TK-REC1 / TK-REC1b plus TK-REC3 for the timekeeper), the 9:16 ready
 * preview, the flag's quality and the timekeeper's lens on the camera, and
 * the same capture reported to the recorder for the video row.
 */
import * as React from "react";
import { act, render, within } from "@testing-library/react-native";
import type { RecordingCapture } from "@/lib/video/use-video-recorder";

/** The lenses the mocked iPhone lists (`getAvailableLensesAsync`). */
const mockLenses: { current: string[] } = { current: [] };
/** The props the last CameraView rendered with. */
const mockCameraProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("expo-camera", () => {
  const R = require("react");
  return {
    CameraView: R.forwardRef((props: Record<string, unknown>, ref: { current: unknown } | null) => {
      R.useLayoutEffect(() => {
        if (ref) ref.current = { getAvailableLensesAsync: async () => mockLenses.current };
        return () => {
          if (ref) ref.current = null;
        };
      }, []);
      mockCameraProps.current = props;
      return null;
    }),
  };
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
const mockGetFeatureFlag = jest.fn(async () => mockFlag.current);
jest.mock("@jits/shared/api/location", () => ({
  getFeatureFlag: () => mockGetFeatureFlag(),
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

import { MatchRecorderCamera, READY_HINT_TEST_ID } from "@/components/match-flow/match-recorder-surface";
import { CAPTURE_POLICY, PRACTICE_CAPTURE, type CapturePolicy } from "@/lib/match-flow/capture-policy";
import type { MatchStep } from "@/lib/match-flow/step-router";

const ATHLETE = CAPTURE_POLICY.self_run.challenger;
const TIMEKEEPER = CAPTURE_POLICY.timekeeper.timekeeper;
const IPHONE = ["Back Camera", "Back Dual Wide Camera", "Back Ultra Wide Camera"];

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

beforeEach(() => {
  mockWindow.width = 390;
  mockWindow.height = 844;
  mockGetFeatureFlag.mockClear();
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
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "default" });
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
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "ultrawide" });
  });

  it("no ultrawide (iPhone SE): the default lens, TK-REC1b, no tag", async () => {
    mockLenses.current = ["Back Camera"];
    const s = renderCamera(TIMEKEEPER);
    await settle();
    await cameraReady();
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ selectedLens: undefined }));
    expect(s.queryByTestId("camera-wide-lens-tag")).toBeNull();
    expect(s.hint()).toBe("Hold your phone upright. Step back so the whole mat fits.");
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "default" });
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
    expect(mockCaptureRef.current).toEqual({ quality: "1080p", lens: "default" });
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
    expect(mockCameraProps.current).toEqual(expect.objectContaining({ videoQuality: "720p", selectedLens: undefined }));
    expect(mockCaptureRef.current).toEqual({ quality: "720p", lens: "default" });
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
    expect(mockCaptureRef.current).toEqual({ quality: "1080p", lens: "ultrawide" });
  });
});

describe("who reads the flag", () => {
  it("a viewer who does not record never reads it (no camera, no capture)", async () => {
    const s = renderCamera(ATHLETE, "weight", false);
    s.step("ready");
    await settle();
    expect(mockGetFeatureFlag).not.toHaveBeenCalled();
    expect(mockCameraProps.current).toBeNull();
  });

  it("one read per face-off for a viewer who records", async () => {
    const s = renderCamera(ATHLETE, "weight");
    s.step("ready");
    await settle();
    expect(mockGetFeatureFlag).toHaveBeenCalledTimes(1);
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
