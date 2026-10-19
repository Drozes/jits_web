/**
 * MatchOrientationController: ready rotates, live locks to the current
 * orientation, the lock holds while the recorder is stopping, everything
 * else and unmount is portrait, and it only calls when the target changes.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/orientation", () => ({
  allowRotation: jest.fn(async () => undefined),
  lockToCurrent: jest.fn(async () => "landscape"),
  lockPortrait: jest.fn(async () => undefined),
  lockLandscape: jest.fn(async () => undefined),
}));

const mockRecorder = { state: "idle" };
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  useMatchRecorder: () => mockRecorder,
}));

import { allowRotation, lockLandscape, lockPortrait, lockToCurrent } from "@/lib/orientation";
import {
  MatchOrientationController,
  orientationModeFor,
  type OrientationMode,
  type RecordingOrientation,
} from "@/components/match-flow/match-orientation-controller";

const calls = () => ({
  rotate: (allowRotation as jest.Mock).mock.calls.length,
  live: (lockToCurrent as jest.Mock).mock.calls.length,
  portrait: (lockPortrait as jest.Mock).mock.calls.length,
});

function renderWith(mode: OrientationMode, state = "idle") {
  mockRecorder.state = state;
  const utils = render(<MatchOrientationController mode={mode} />);
  return {
    ...utils,
    update: (m: OrientationMode, st = mockRecorder.state) => {
      mockRecorder.state = st;
      utils.rerender(<MatchOrientationController mode={m} />);
    },
  };
}

beforeEach(() => jest.clearAllMocks());

it("maps steps and phases onto modes", () => {
  expect(orientationModeFor("ready")).toBe("ready");
  expect(orientationModeFor("live")).toBe("live");
  for (const s of ["wait", "weight", "end", "result", "confirm", "summary", "offline", "lobby", null]) {
    expect(orientationModeFor(s)).toBe("other");
  }
});

it("portrait before ready, rotation on ready, the current-orientation lock on live", () => {
  const s = renderWith("other");
  expect(calls()).toEqual({ rotate: 0, live: 0, portrait: 1 });
  s.update("ready");
  expect(calls()).toEqual({ rotate: 1, live: 0, portrait: 1 });
  s.update("live", "recording");
  expect(calls()).toEqual({ rotate: 1, live: 1, portrait: 1 });
});

it("re-renders with the same target never call again", () => {
  const s = renderWith("ready");
  s.update("ready");
  s.update("ready");
  s.update("live", "recording");
  s.update("live", "recording");
  s.update("live", "stopping");
  expect(calls()).toEqual({ rotate: 1, live: 1, portrait: 0 });
});

it("holds the live lock after live while the recorder is stopping, then restores portrait", () => {
  const s = renderWith("live", "recording");
  s.update("other", "stopping");
  expect(calls()).toEqual({ rotate: 0, live: 1, portrait: 0 });
  s.update("other", "uploading");
  expect(calls()).toEqual({ rotate: 0, live: 1, portrait: 1 });
  s.update("other", "idle");
  expect(calls().portrait).toBe(1);
});

it("restores portrait on unmount from ready and from live", () => {
  const ready = renderWith("ready");
  ready.unmount();
  expect(calls().portrait).toBe(1);
  jest.clearAllMocks();
  const live = renderWith("live", "recording");
  live.unmount();
  expect(calls()).toEqual({ rotate: 0, live: 1, portrait: 1 });
});

// The recording-orientation input (timekeeper mode ARCHITECTURE 2.8, PR3):
// "free" is the default above; the capture policy may lock either way.
describe("recordingOrientation", () => {
  const all = () => ({ ...calls(), landscape: (lockLandscape as jest.Mock).mock.calls.length });

  function renderPolicy(recordingOrientation: RecordingOrientation, mode: OrientationMode = "other", state = "idle") {
    mockRecorder.state = state;
    const utils = render(<MatchOrientationController mode={mode} recordingOrientation={recordingOrientation} />);
    return {
      ...utils,
      update: (m: OrientationMode, st = mockRecorder.state) => {
        mockRecorder.state = st;
        utils.rerender(<MatchOrientationController mode={m} recordingOrientation={recordingOrientation} />);
      },
    };
  }

  it("free is the default: the same calls as no input", () => {
    const s = renderPolicy("free");
    s.update("ready");
    s.update("live", "recording");
    s.update("other", "stopping");
    s.update("other", "idle");
    expect(all()).toEqual({ rotate: 1, live: 1, portrait: 2, landscape: 0 });
  });

  it("portrait_locked: portrait on every face-off and live step, while stopping, and on unmount; never a rotation", () => {
    const s = renderPolicy("portrait_locked");
    expect(all()).toEqual({ rotate: 0, live: 0, portrait: 1, landscape: 0 });
    s.update("ready");
    s.update("live", "recording");
    s.update("other", "stopping");
    s.update("other", "idle");
    expect(all()).toEqual({ rotate: 0, live: 0, portrait: 1, landscape: 0 });
    s.unmount();
    expect(all()).toEqual({ rotate: 0, live: 0, portrait: 2, landscape: 0 });
  });

  it("portrait_locked from a ready or live mount locks portrait at once", () => {
    renderPolicy("portrait_locked", "ready").unmount();
    jest.clearAllMocks();
    renderPolicy("portrait_locked", "live", "recording");
    expect(all()).toEqual({ rotate: 0, live: 0, portrait: 1, landscape: 0 });
  });

  it("landscape_locked: landscape on ready, the current side on live (held while stopping), then portrait", () => {
    const s = renderPolicy("landscape_locked");
    s.update("ready");
    expect(all()).toEqual({ rotate: 0, live: 0, portrait: 1, landscape: 1 });
    s.update("live", "recording");
    s.update("other", "stopping");
    expect(all()).toEqual({ rotate: 0, live: 1, portrait: 1, landscape: 1 });
    s.update("other", "idle");
    expect(all()).toEqual({ rotate: 0, live: 1, portrait: 2, landscape: 1 });
  });
});
