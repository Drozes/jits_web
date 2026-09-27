/**
 * The live broadcast screen in a landscape window (Widescreen Sideline,
 * artboards R-L1..R-L4 plus the states with no landscape artboard): the same
 * pieces as portrait, reflowed. HUD top-left, lower-third bottom-left at a
 * fixed 320, Pause and Hold as tiles in a right rail.
 */
import * as React from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { completeHold } from "../../../support/complete-hold";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});

// A notched iPhone in landscape: 59 side insets, 21 at the home indicator.
const mockInsets = { top: 0, bottom: 21, left: 59, right: 59 };
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

const mockWindow = { width: 844, height: 390 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow, scale: 3, fontScale: 1 }),
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

const style = (s: ReturnType<typeof render>, id: string) => StyleSheet.flatten(s.getByTestId(id).props.style);

let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockWindow.width = 844;
  mockWindow.height = 390;
  Object.assign(mockInsets, { top: 0, bottom: 21, left: 59, right: 59 });
  requestPermission.mockClear();
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  announce.mockRestore();
});

describe("frame", () => {
  it("R-L1: HUD top-left, lower-third bottom-left 320 wide, rail with 112 x 112 Pause over 112 x 180 Hold", () => {
    const s = render(<LiveBroadcast {...props()} />);
    act(() => {
      jest.advanceTimersByTime(134_000);
    });
    expect(style(s, "live-hud")).toEqual(expect.objectContaining({ position: "absolute", left: 71, top: 16, height: 28 }));
    const hud = within(s.getByTestId("live-hud"));
    expect(hud.getByTestId("live-tally")).toHaveTextContent("REC 02:14");
    expect(hud.getByTestId("live-kind-tag")).toHaveTextContent("RANKED");

    expect(style(s, "live-lower-third")).toEqual(
      expect.objectContaining({ position: "absolute", left: 71, bottom: 21, width: 320 }),
    );
    const lower = within(s.getByTestId("live-lower-third"));
    lower.getByTestId("live-athlete-bar");
    lower.getByTestId("live-slab-live");
    expect(lower.queryByTestId("live-end")).toBeNull();
    expect(s.queryByTestId(/^live-strip-/)).toBeNull();

    expect(style(s, "live-rail")).toEqual(
      expect.objectContaining({ position: "absolute", right: 71, bottom: 21, width: 112, gap: 12 }),
    );
    const rail = within(s.getByTestId("live-rail"));
    const pause = StyleSheet.flatten(rail.getByTestId("live-pause-toggle").props.style);
    expect(pause).toEqual(expect.objectContaining({ width: 112, height: 112, flexDirection: "column" }));
    const hold = StyleSheet.flatten(rail.getByTestId("live-end").props.style);
    expect(hold).toEqual(expect.objectContaining({ width: 112, height: 180 }));
    expect(rail.getByTestId("live-end")).toHaveTextContent(/HOLD\s+TO END/);
    expect(s.getByLabelText("Hold to end match")).toBeTruthy();
    expect(s.getByLabelText("Pause match clock")).toBeTruthy();
  });

  it("uses the landscape scrims, not the portrait ones", () => {
    const s = render(<LiveBroadcast {...props()} />);
    expect(style(s, "live-scrim-left")).toEqual(expect.objectContaining({ left: 0, width: 440 }));
    expect(style(s, "live-scrim-right")).toEqual(expect.objectContaining({ right: 0, width: 220 }));
    expect(s.queryByTestId("live-scrim-top")).toBeNull();
    expect(s.queryByTestId("live-scrim-bottom")).toBeNull();
  });

  it("slab is 96 high with 80 px digits", () => {
    const s = render(<LiveBroadcast {...props()} />);
    expect(style(s, "live-clock-slab").height).toBe(96);
    expect(style(s, "live-timer")).toEqual(expect.objectContaining({ fontSize: 80, letterSpacing: -3.2 }));
  });

  it("keeps a 16 minimum side margin plus 12, and the 21 bottom, without insets", () => {
    Object.assign(mockInsets, { top: 0, bottom: 0, left: 0, right: 0 });
    mockWindow.width = 667;
    mockWindow.height = 375;
    const s = render(<LiveBroadcast {...props()} />);
    expect(style(s, "live-hud").left).toBe(28);
    expect(style(s, "live-lower-third")).toEqual(expect.objectContaining({ left: 28, bottom: 21 }));
    expect(style(s, "live-rail")).toEqual(expect.objectContaining({ right: 28, bottom: 21 }));
  });

  it("clears a visible landscape status bar (iPad) with insets.top", () => {
    Object.assign(mockInsets, { top: 24, bottom: 20, left: 0, right: 0 });
    mockWindow.width = 1194;
    mockWindow.height = 834;
    const s = render(<LiveBroadcast {...props()} />);
    expect(style(s, "live-hud").top).toBe(40);
  });

  it("a portrait window keeps the shipped portrait layout", () => {
    mockWindow.width = 390;
    mockWindow.height = 844;
    const s = render(<LiveBroadcast {...props()} />);
    expect(s.queryByTestId("live-rail")).toBeNull();
    expect(s.queryByTestId("live-hud")).toBeNull();
    s.getByTestId("live-scrim-top");
    expect(style(s, "live-clock-slab").height).toBe(104);
    expect(style(s, "live-timer").fontSize).toBe(88);
    expect(StyleSheet.flatten(s.getByTestId("live-end").props.style).height).toBe(64);
    expect(s.getByTestId("live-end")).toHaveTextContent("HOLD TO END");
  });
});

describe("hold tile", () => {
  it("R-L4: KEEP / HOLDING, the hold strip, and a fill that grows bottom to top", () => {
    const s = render(<LiveBroadcast {...props({ formatted: "03:26", remaining: 206 })} />);
    fireEvent(s.getByTestId("live-end"), "pressIn");
    expect(s.getByTestId("live-end")).toHaveTextContent(/KEEP\s+HOLDING/);
    within(s.getByTestId("live-lower-third")).getByTestId("live-strip-hold");
    s.getByText("RELEASE TO CANCEL");
    s.getByText("ENDING MATCH");
    const fill = StyleSheet.flatten(s.getByTestId("live-end-fill").props.style);
    expect(fill).toEqual(expect.objectContaining({ position: "absolute", left: 0, right: 0, bottom: 0 }));
    expect(fill).toHaveProperty("height");
    expect(fill).not.toHaveProperty("width");
    expect(StyleSheet.flatten(s.getByTestId("live-end").props.style).transform).toEqual([{ scale: 0.98 }]);
  });

  it("releasing early cancels; a completed hold ends once and reads ENDING", () => {
    const onEnd = jest.fn();
    const s = render(<LiveBroadcast {...props({ onEnd })} />);
    fireEvent(s.getByTestId("live-end"), "pressIn");
    act(() => {
      jest.advanceTimersByTime(600);
    });
    fireEvent(s.getByTestId("live-end"), "pressOut");
    expect(onEnd).not.toHaveBeenCalled();
    expect(s.queryByTestId("live-strip-hold")).toBeNull();
    expect(s.getByTestId("live-end")).toHaveTextContent(/HOLD\s+TO END/);

    completeHold(s.getByTestId("live-end"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("live-end")).toHaveTextContent("ENDING");
  });

  it("keeps the screen reader End match action", () => {
    const onEnd = jest.fn();
    const s = render(<LiveBroadcast {...props({ onEnd })} />);
    const button = s.getByLabelText("Hold to end match");
    expect(button.props.accessibilityActions).toEqual([
      { name: "activate", label: "End match" },
      { name: "longpress", label: "End match" },
    ]);
    fireEvent(button, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("states", () => {
  it("R-L2 paused: amber strip, PAUSED slab, Resume tile with the amber fill and border", () => {
    const s = render(<LiveBroadcast {...props({ paused: true, formatted: "04:12", remaining: 252 })} />);
    within(s.getByTestId("live-lower-third")).getByTestId("live-strip-paused");
    s.getByText("CAMERA STILL RECORDING");
    s.getByTestId("live-slab-paused");
    const resume = s.getByLabelText("Resume match clock");
    expect(resume).toHaveTextContent("RESUME");
    expect(StyleSheet.flatten(resume.props.style)).toEqual(
      expect.objectContaining({ width: 112, borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.16)" }),
    );
  });

  it("R-L3 final 10: segments in the strip, LIVE slab, rail normal", () => {
    const s = render(<LiveBroadcast {...props({ formatted: "00:07", remaining: 7 })} />);
    s.getByText("FINAL 10 SECONDS");
    expect(s.getAllByTestId("final10-segment-lit")).toHaveLength(7);
    expect(s.getAllByTestId("final10-segment")).toHaveLength(3);
    s.getByTestId("live-slab-live");
    expect(s.getByTestId("live-pause-toggle")).toHaveTextContent("PAUSE");
  });

  it("time up: TIME strip with the drain bar, TIME slab, Hold disabled ENDING, Pause enabled", () => {
    const s = render(<LiveBroadcast {...props({ formatted: "00:00", remaining: 0 })} />);
    s.getByTestId("live-strip-timeup");
    s.getByTestId("timeup-drain");
    s.getByTestId("live-slab-time");
    const hold = s.getByTestId("live-end");
    expect(hold).toHaveTextContent("ENDING");
    expect(hold.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(StyleSheet.flatten(hold.props.style).opacity).toBe(0.5);
    expect(s.getByTestId("live-pause-toggle").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it("camera starting: starting tally, strip and dim, LIVE slab, rail enabled", () => {
    const s = render(<LiveBroadcast {...props({ state: "idle", formatted: "09:56", remaining: 596 })} />);
    expect(within(s.getByTestId("live-hud")).getByTestId("live-tally")).toHaveTextContent("CAMERA STARTING");
    s.getByTestId("live-strip-starting");
    s.getByText("CLOCK IS RUNNING");
    s.getByTestId("live-dim-starting-dim");
    s.getByTestId("live-slab-live");
    expect(s.getByTestId("live-end").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("opponent ended: rail hidden, MATCH OVER plate above the athlete bar in the left column", () => {
    const s = render(
      <LiveBroadcast
        {...props({
          state: "stopping",
          opponentEnded: { name: "M. Park", finalFormatted: "06:18", finalRemaining: 378 },
        })}
      />,
    );
    expect(s.queryByTestId("live-rail")).toBeNull();
    expect(s.queryByTestId("live-end")).toBeNull();
    expect(s.queryByTestId("live-pause-toggle")).toBeNull();
    const lower = within(s.getByTestId("live-lower-third"));
    lower.getByTestId("live-opponent-ended");
    lower.getByTestId("live-athlete-bar");
    expect(style(s, "live-lower-third").gap).toBe(12);
    expect(s.getByTestId("live-opponent-ended-headline").props.numberOfLines).toBe(2);
    expect(s.getByTestId("live-tally")).toHaveTextContent("SAVING VIDEO");
    s.getByTestId("live-dim-saving-dim");
    s.getByTestId("live-slab-final");
    expect(s.getByTestId("live-timer")).toHaveTextContent("06:18");
    expect(announce).toHaveBeenCalledWith("M. Park ended the match. Final clock 06:18");
  });

  it("practice: PRACTICE tag and the EXIT pill in the top-left HUD row", () => {
    const onExit = jest.fn();
    const { Pressable } = require("react-native");
    const s = render(
      <LiveBroadcast
        {...props({
          kindLabel: "PRACTICE",
          practice: true,
          hudExtra: (
            <Pressable testID="practice-exit" accessibilityLabel="Exit practice" onPress={onExit}>
              <Text>EXIT</Text>
            </Pressable>
          ),
        })}
      />,
    );
    const hud = within(s.getByTestId("live-hud"));
    expect(hud.getByTestId("live-kind-tag")).toHaveTextContent("PRACTICE");
    fireEvent.press(hud.getByTestId("practice-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("no video", () => {
  function region(s: ReturnType<typeof render>) {
    return style(s, "live-no-video-region");
  }

  it.each([
    ["denied", { granted: false, canAskAgain: false }, "idle", "NO VIDEO FOR THIS MATCH"],
    ["canAsk", { granted: false, canAskAgain: true }, "idle", "CAMERA ACCESS NEEDED"],
    ["error", { granted: true, canAskAgain: true }, "error", "NO VIDEO FOR THIS MATCH"],
  ] as const)("%s: ground, NO VIDEO tally, compact plate in the free region", (variant, permission, state, heading) => {
    const s = render(<LiveBroadcast {...props({ state, permission })} />);
    s.getByTestId("live-ground");
    expect(s.queryByTestId("live-scrim-left")).toBeNull();
    expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
    const plate = within(s.getByTestId("live-no-video-region")).getByTestId(`live-no-video-${variant}`);
    expect(plate).toBeTruthy();
    expect(StyleSheet.flatten(s.getByText(heading).props.style).fontSize).toBe(28);
    // Between the lower-third's right edge + 16 and the rail's left edge - 16,
    // under the HUD + 12.
    expect(region(s)).toEqual(expect.objectContaining({ left: 71 + 320 + 16, right: 71 + 112 + 16, top: 56, bottom: 0 }));
  });

  it("can ask: ALLOW CAMERA requests permission and fits the region", () => {
    const s = render(<LiveBroadcast {...props({ state: "idle", permission: { granted: false, canAskAgain: true } })} />);
    fireEvent.press(s.getByTestId("live-allow-camera"));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["iPhone SE", 667, 375, { top: 0, bottom: 0, left: 0, right: 0 }],
    ["Pro Max", 932, 430, { top: 0, bottom: 21, left: 59, right: 59 }],
  ])("%s: the plate and ALLOW CAMERA stay inside the region, clear of the lower-third and rail", (_n, w, h, insets) => {
    mockWindow.width = w;
    mockWindow.height = h;
    Object.assign(mockInsets, insets);
    const s = render(<LiveBroadcast {...props({ state: "idle", permission: { granted: false, canAskAgain: true } })} />);
    const r = region(s);
    const lower = style(s, "live-lower-third");
    const rail = style(s, "live-rail");
    const regionWidth = w - (r.left as number) - (r.right as number);
    expect(r.left).toBeGreaterThanOrEqual((lower.left as number) + 320 + 16);
    expect(r.right).toBeGreaterThanOrEqual((rail.right as number) + 112 + 16);
    expect(regionWidth).toBeGreaterThan(0);
    const plateMax = style(s, "live-no-video-canAsk").maxWidth as number;
    expect(plateMax).toBeLessThanOrEqual(Math.min(300, regionWidth));
    const button = style(s, "live-allow-camera");
    expect(button.width).toBeLessThanOrEqual(Math.min(180, regionWidth));
  });
});
