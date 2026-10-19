/**
 * The live screen's controls seam (timekeeper mode ARCHITECTURE 2.3, PR3):
 * "full", the default, is today's Pause and Hold to end; "none" draws no
 * controls and puts the given strip in their place, in portrait and in the
 * landscape rail. The opponent-ended plate still replaces both.
 */
import * as React from "react";
import { Text } from "react-native";
import { render, within } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 54, bottom: 34, left: 0, right: 0 }),
}));

const mockWindow = { width: 390, height: 844 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow, scale: 3, fontScale: 1 }),
}));

import { LiveBroadcast, type LiveBroadcastProps } from "@/components/match-flow/live/live-broadcast";

function props(o: Partial<LiveBroadcastProps> = {}): LiveBroadcastProps {
  return {
    me: { name: "K. Reyes", meta: "1512 · 77 LBS" },
    opponent: { name: "M. Park", meta: "1498 · 76 LBS" },
    durationSeconds: 600,
    formatted: "07:43",
    remaining: 463,
    paused: false,
    recorder: {
      state: "recording",
      error: null,
      permission: { granted: true, canAskAgain: true },
      requestPermission: jest.fn(),
    } as unknown as LiveBroadcastProps["recorder"],
    controlsDisabled: false,
    endPending: false,
    onPauseResume: jest.fn(),
    onEnd: jest.fn(),
    ...o,
  };
}

const STRIP = <Text testID="test-controls-strip">J. CRUZ RUNS THE CLOCK</Text>;
const ENDED = { name: "J. Cruz", finalFormatted: "06:18", finalRemaining: 378 };

function setWindow(landscape: boolean) {
  mockWindow.width = landscape ? 844 : 390;
  mockWindow.height = landscape ? 390 : 844;
}

afterEach(() => setWindow(false));

describe.each([
  ["portrait", false],
  ["landscape", true],
])("%s", (_name, landscape) => {
  beforeEach(() => setWindow(landscape));

  it("defaults to the full controls, and an unused strip never shows", () => {
    const s = render(<LiveBroadcast {...props({ controlsStrip: STRIP })} />);
    s.getByTestId("live-pause-toggle");
    s.getByTestId("live-end");
    expect(s.queryByTestId("test-controls-strip")).toBeNull();
  });

  it("controls none: no Pause and no Hold to end, the strip in their place", () => {
    const s = render(<LiveBroadcast {...props({ controls: "none", controlsStrip: STRIP })} />);
    expect(s.queryByTestId("live-pause-toggle")).toBeNull();
    expect(s.queryByTestId("live-end")).toBeNull();
    const strip = landscape ? within(s.getByTestId("live-rail")).getByTestId("test-controls-strip") : s.getByTestId("test-controls-strip");
    expect(strip).toHaveTextContent("J. CRUZ RUNS THE CLOCK");
    // The clock and the athletes are the same read-only screen.
    expect(s.getByTestId("live-timer")).toHaveTextContent("07:43");
    s.getByTestId("live-me-name");
  });

  it("controls none without a strip: nothing where the controls were", () => {
    const s = render(<LiveBroadcast {...props({ controls: "none" })} />);
    expect(s.queryByTestId("live-pause-toggle")).toBeNull();
    expect(s.queryByTestId("live-end")).toBeNull();
    if (landscape) expect(s.queryByTestId("live-rail")).toBeNull();
  });

  it("the ended plate replaces the controls and the strip alike", () => {
    for (const controls of ["full", "none"] as const) {
      const s = render(<LiveBroadcast {...props({ controls, controlsStrip: STRIP, opponentEnded: ENDED })} />);
      expect(s.queryByTestId("live-pause-toggle")).toBeNull();
      expect(s.queryByTestId("live-end")).toBeNull();
      expect(s.queryByTestId("test-controls-strip")).toBeNull();
      s.unmount();
    }
  });
});
