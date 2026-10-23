/**
 * The live screen's two timekeeper-mode slots on `LiveBroadcast` (slice M4):
 * `banner` sits above the athlete bar in the lower-third, in portrait and in
 * the landscape lower-third alike, and goes once the ended plate shows;
 * `hideNoVideoPlate` leaves out the centred no-video plate (the timekeeper's
 * camera banner replaces it) and keeps the NO VIDEO tally; `holdKey` gives a
 * fresh hold-to-end after a failed server end. Absent, the screen is the
 * two-athlete one.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, render, within } from "@testing-library/react-native";
import { completeHold } from "../../../support/complete-hold";

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

const BANNER = <Text testID="test-banner">J. CRUZ IS OFFLINE</Text>;
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

  it("the banner sits in the lower-third, above the athlete bar", () => {
    const s = render(<LiveBroadcast {...props({ banner: BANNER })} />);
    const banner = s.getByTestId("test-banner");
    if (landscape) within(s.getByTestId("live-lower-third")).getByTestId("test-banner");
    // Above the athlete bar: earlier in the same column.
    const order = JSON.stringify(s.toJSON());
    expect(order.indexOf("test-banner")).toBeLessThan(order.indexOf("live-me-name"));
    expect(banner).toHaveTextContent("J. CRUZ IS OFFLINE");
  });

  it("no banner: nothing above the athlete bar (the two-athlete screen)", () => {
    const s = render(<LiveBroadcast {...props()} />);
    expect(s.queryByTestId("test-banner")).toBeNull();
  });

  it("goes once the ended plate shows", () => {
    const s = render(<LiveBroadcast {...props({ banner: BANNER, opponentEnded: ENDED })} />);
    expect(s.queryByTestId("test-banner")).toBeNull();
  });

  describe("a failed camera (the recorder errored with the camera allowed)", () => {
    const failed = (o: Partial<LiveBroadcastProps> = {}) =>
      props({ recorder: { ...props().recorder, state: "error" } as LiveBroadcastProps["recorder"], ...o });

    it("shows the shipped no-video plate by default", () => {
      const s = render(<LiveBroadcast {...failed()} />);
      s.getByTestId("live-no-video-error");
      s.getByText("NO VIDEO FOR THIS MATCH");
      expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
    });

    it("hideNoVideoPlate: no plate and no plate copy, the NO VIDEO tally and the banner stay", () => {
      const s = render(<LiveBroadcast {...failed({ hideNoVideoPlate: true, banner: BANNER })} />);
      expect(s.queryByTestId("live-no-video-error")).toBeNull();
      expect(s.queryByText("NO VIDEO FOR THIS MATCH")).toBeNull();
      expect(s.queryByText(/your result still counts/)).toBeNull();
      expect(s.getByTestId("live-tally")).toHaveTextContent("NO VIDEO");
      s.getByTestId("test-banner");
      // The clock and its controls are untouched.
      s.getByTestId("live-pause-toggle");
      s.getByTestId("live-end");
    });
  });
});

describe("holdKey", () => {
  it("a new key gives a fresh hold after a completed one", async () => {
    const onEnd = jest.fn();
    const s = render(<LiveBroadcast {...props({ onEnd, holdKey: 0 })} />);
    await act(async () => completeHold(s.getByTestId("live-end")));
    expect(onEnd).toHaveBeenCalledTimes(1);
    // The server end failed and the hold is offered again.
    s.rerender(<LiveBroadcast {...props({ onEnd, holdKey: 1 })} />);
    await act(async () => completeHold(s.getByTestId("live-end")));
    expect(onEnd).toHaveBeenCalledTimes(2);
  });
});
