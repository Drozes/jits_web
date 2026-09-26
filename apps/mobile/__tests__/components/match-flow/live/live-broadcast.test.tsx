/**
 * The live broadcast screen across the portrait artboards R-P1..R-P8, driven
 * by props alone (the steps own the clock and the recorder).
 */
import * as React from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 54, bottom: 34, left: 0, right: 0 }),
}));

import { LiveBroadcast, type LiveBroadcastProps } from "@/components/match-flow/live/live-broadcast";
import type { RecordingState } from "@/lib/video/use-video-recorder";

type Overrides = Partial<Omit<LiveBroadcastProps, "recorder">> & {
  state?: RecordingState;
  permission?: { granted: boolean; canAskAgain: boolean } | null;
};

const requestPermission = jest.fn(() => Promise.resolve());

function props(o: Overrides = {}): LiveBroadcastProps {
  const { state = "recording", permission = { granted: true, canAskAgain: true }, ...rest } = o;
  return {
    kindLabel: "RANKED",
    me: { name: "K. Reyes", meta: "1512 · 77 KG" },
    opponent: { name: "M. Park", meta: "1498 · 76 KG" },
    durationSeconds: 600,
    formatted: "07:43",
    remaining: 463,
    paused: false,
    recorder: { state, error: null, permission, requestPermission } as unknown as LiveBroadcastProps["recorder"],
    controlsDisabled: false,
    endPending: false,
    onPauseResume: jest.fn(),
    onEnd: jest.fn(),
    ...rest,
  };
}

function digitsColor(s: ReturnType<typeof render>) {
  return StyleSheet.flatten(s.getByTestId("live-timer").props.style).color;
}

let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  requestPermission.mockClear();
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  announce.mockRestore();
});

it("R-P1 recording: REC tally, RANKED tag, athletes, LIVE slab, controls", () => {
  const s = render(<LiveBroadcast {...props()} />);
  act(() => {
    jest.advanceTimersByTime(134_000);
  });
  expect(s.getByTestId("live-tally")).toHaveTextContent("REC 02:14");
  expect(s.getByLabelText("Recording, 2 minutes 14 seconds")).toBeTruthy();
  expect(s.getByTestId("live-kind-tag")).toHaveTextContent("RANKED");
  expect(s.getByTestId("live-me-name")).toHaveTextContent("K. REYES");
  expect(s.getByTestId("live-opponent-name")).toHaveTextContent("M. PARK");
  s.getByTestId("live-slab-live");
  s.getByText("OF 10:00");
  expect(s.getByTestId("live-timer")).toHaveTextContent("07:43");
  expect(s.getByLabelText("7 minutes 43 seconds remaining")).toBeTruthy();
  expect(s.getByTestId("live-pause-toggle")).toHaveTextContent("PAUSE");
  expect(s.getByLabelText("Pause match clock")).toBeTruthy();
  expect(s.getByTestId("live-end")).toHaveTextContent("HOLD TO END");
  expect(s.queryByTestId(/^live-strip-/)).toBeNull();
  s.getByTestId("live-scrim-top");
  s.getByTestId("live-scrim-bottom");
  expect(announce).not.toHaveBeenCalled();
});

it("R-P2 hold in progress: KEEP HOLDING and the hold strip, announced once", () => {
  const s = render(<LiveBroadcast {...props({ formatted: "03:26", remaining: 206 })} />);
  fireEvent(s.getByTestId("live-end"), "pressIn");
  expect(s.getByTestId("live-end")).toHaveTextContent("KEEP HOLDING");
  s.getByTestId("live-strip-hold");
  s.getByText("RELEASE TO CANCEL");
  expect(announce).toHaveBeenCalledTimes(1);
  fireEvent(s.getByTestId("live-end"), "pressOut");
  expect(s.queryByTestId("live-strip-hold")).toBeNull();
});

it("R-P3 paused: amber strip, PAUSED slab, Resume variant, hold still enabled", () => {
  const onEnd = jest.fn();
  const s = render(<LiveBroadcast {...props({ paused: true, formatted: "04:12", remaining: 252, onEnd })} />);
  s.getByTestId("live-strip-paused");
  s.getByText("CAMERA STILL RECORDING");
  s.getByTestId("live-slab-paused");
  expect(s.getByTestId("live-pause-toggle")).toHaveTextContent("RESUME");
  expect(s.getByLabelText("Resume match clock")).toBeTruthy();
  expect(s.getByTestId("live-end").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  expect(announce).toHaveBeenCalledWith("Paused. camera still recording");
});

it("R-P4 final 10: segments step with the clock; a segment change is not announced", () => {
  const s = render(<LiveBroadcast {...props({ formatted: "00:07", remaining: 7 })} />);
  s.getByText("FINAL 10 SECONDS");
  expect(s.getAllByTestId("final10-segment-lit")).toHaveLength(7);
  s.getByTestId("live-slab-live");
  expect(announce).toHaveBeenCalledTimes(1);
  s.rerender(<LiveBroadcast {...props({ formatted: "00:06", remaining: 6 })} />);
  expect(s.getAllByTestId("final10-segment-lit")).toHaveLength(6);
  expect(announce).toHaveBeenCalledTimes(1);
});

it("R-P5 time up: TIME strip and slab, hold disabled and ENDING, pause enabled", () => {
  const s = render(<LiveBroadcast {...props({ formatted: "00:00", remaining: 0 })} />);
  s.getByTestId("live-strip-timeup");
  s.getByTestId("timeup-drain");
  s.getByTestId("live-slab-time");
  expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
  expect(s.getByTestId("live-end").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  expect(s.getByTestId("live-pause-toggle").props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: false }),
  );
});

it("R-P6 camera starting: starting tally and strip, 35 percent dim, controls enabled", () => {
  const s = render(<LiveBroadcast {...props({ state: "idle", formatted: "09:56", remaining: 596 })} />);
  expect(s.getByTestId("live-tally")).toHaveTextContent("CAMERA STARTING");
  expect(s.queryByText(/^REC/)).toBeNull();
  s.getByTestId("live-strip-starting");
  s.getByText("CLOCK IS RUNNING");
  s.getByTestId("live-dim-starting-dim");
  s.getByTestId("live-slab-live");
  expect(s.getByTestId("live-end").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));

  s.rerender(<LiveBroadcast {...props({ state: "recording", formatted: "09:55", remaining: 595 })} />);
  expect(s.queryByTestId("live-strip-starting")).toBeNull();
  expect(s.getByTestId("live-tally")).toHaveTextContent(/^REC/);
});

describe("R-P7 camera unavailable", () => {
  it("denied: solid ground, no scrims, NO VIDEO, denied copy, no Settings button", () => {
    const s = render(<LiveBroadcast {...props({ state: "idle", permission: { granted: false, canAskAgain: false } })} />);
    s.getByTestId("live-ground");
    expect(s.queryByTestId("live-scrim-top")).toBeNull();
    expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
    s.getByText("NO VIDEO FOR THIS MATCH");
    s.getByText(/Camera access is off\. The clock runs as normal and your result still counts\./);
    expect(s.queryByText(/settings/i, { exact: false })).toBeTruthy(); // copy mentions Settings
    expect(s.queryByRole("button", { name: /settings/i })).toBeNull();
    expect(s.queryByTestId("live-allow-camera")).toBeNull();
    s.getByTestId("live-slab-live");
  });

  it("can ask: CAMERA ACCESS NEEDED with ALLOW CAMERA that requests permission", () => {
    const s = render(<LiveBroadcast {...props({ state: "idle", permission: { granted: false, canAskAgain: true } })} />);
    s.getByText("CAMERA ACCESS NEEDED");
    fireEvent.press(s.getByTestId("live-allow-camera"));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("recorder error: solid ground over the camera, error copy", () => {
    const s = render(<LiveBroadcast {...props({ state: "error" })} />);
    s.getByTestId("live-ground");
    expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
    s.getByText("The camera could not start. The clock runs as normal and your result still counts.");
  });

  it("practice drops the result-still-counts line", () => {
    const s = render(
      <LiveBroadcast {...props({ practice: true, kindLabel: "PRACTICE", state: "error" })} />,
    );
    s.getByText("The camera could not start. The clock runs as normal.");
  });
});

it("R-P8 opponent ended: plate, 55 percent dim, SAVING VIDEO, FINAL slab with the frozen clock, no controls", () => {
  const s = render(
    <LiveBroadcast
      {...props({
        state: "stopping",
        formatted: "06:10",
        remaining: 370,
        opponentEnded: { name: "M. Park", finalFormatted: "06:18" },
      })}
    />,
  );
  expect(s.getByTestId("live-opponent-ended").props.accessibilityRole).toBe("alert");
  s.getByText("MATCH OVER");
  s.getByText("M. PARK ENDED THE MATCH");
  s.getByText("FINAL CLOCK 06:18 OF 10:00");
  s.getByTestId("live-dim-saving-dim");
  expect(s.getByTestId("live-tally")).toHaveTextContent("SAVING VIDEO");
  s.getByTestId("live-slab-final");
  expect(s.getByTestId("live-timer")).toHaveTextContent("06:18");
  expect(s.queryByTestId("live-end")).toBeNull();
  expect(s.queryByTestId("live-pause-toggle")).toBeNull();
});

it("keeps the digits one color in every state (never amber or red)", () => {
  const colors = [
    props(),
    props({ paused: true }),
    props({ formatted: "00:07", remaining: 7 }),
    props({ formatted: "00:00", remaining: 0 }),
    props({ state: "idle" }),
    props({ state: "error" }),
    props({ opponentEnded: { name: "M. Park", finalFormatted: "06:18" } }),
  ].map((p) => digitsColor(render(<LiveBroadcast {...p} />)));
  expect(new Set(colors)).toEqual(new Set(["#E8EDF2"]));
});

it("shows CASUAL and the practice HUD extra", () => {
  const casual = render(<LiveBroadcast {...props({ kindLabel: "CASUAL" })} />);
  expect(casual.getByTestId("live-kind-tag")).toHaveTextContent("CASUAL");
  const { Text } = require("react-native");
  const practice = render(
    <LiveBroadcast {...props({ kindLabel: "PRACTICE", hudExtra: <Text testID="extra">EXIT</Text> })} />,
  );
  expect(practice.getByTestId("live-kind-tag")).toHaveTextContent("PRACTICE");
  practice.getByTestId("extra");
});

it("dims both buttons and reads ENDING while the end is pending", () => {
  const s = render(<LiveBroadcast {...props({ endPending: true, controlsDisabled: true })} />);
  expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
  expect(s.getByTestId("live-pause-toggle").props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true }),
  );
});
