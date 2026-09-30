/**
 * 3-2-1 before the clock, timed from the server `started_at` so both phones
 * agree; the live step (and so the recorder) mounts only at GO, with the
 * clock started at GO; one heavy haptic per numeral; re-entry past GO skips
 * it; a phone whose clock runs behind never shows it for longer than 3 s.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));
const mockTick = jest.fn(() => Promise.resolve());
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { countdownTick: () => mockTick() } }));
const mockLiveProps = jest.fn();
jest.mock("@/components/match-flow/steps/live-step", () => ({
  LiveStep: (p: Record<string, unknown>) => {
    mockLiveProps(p);
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "live-step" });
  },
}));

const mockWindow: { current: { width: number; height: number } } = { current: { width: 390, height: 844 } };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow.current, scale: 3, fontScale: 1 }),
}));

import { StyleSheet } from "react-native";
import { COUNTDOWN_MS, countdownNumeral, numeralSize } from "@/components/match-flow/countdown/countdown";
import { LiveStage, clockStartFor } from "@/components/match-flow/countdown/live-stage";

const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const who = (name: string) => ({ display_name: name, current_elo: 1500, current_weight: 170 });

function renderStage(startedAtMs: number, recording = true) {
  return render(
    <LiveStage
      matchId="M1"
      me={who("Kai Reyes")}
      opponent={who("Mina Park")}
      durationSeconds={600}
      startedAt={new Date(startedAtMs).toISOString()}
      pausedAt={null}
      totalPausedDuration={0}
      recorder={{} as never}
      recording={recording}
      myWeight={170}
      opponentWeight={168}
      onEnded={jest.fn()}
    />,
  );
}

beforeEach(() => {
  mockWindow.current = { width: 390, height: 844 };
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe("countdown math", () => {
  it("numerals by time left", () => {
    expect(countdownNumeral(3000)).toBe(3);
    expect(countdownNumeral(2001)).toBe(3);
    expect(countdownNumeral(2000)).toBe(2);
    expect(countdownNumeral(1)).toBe(1);
    expect(countdownNumeral(0)).toBe(0);
    expect(countdownNumeral(9000)).toBe(3);
  });

  it("the clock starts at GO: started_at + 3 s", () => {
    expect(clockStartFor("2026-09-27T12:00:00.000Z")).toBe("2026-09-27T12:00:03.000Z");
    expect(clockStartFor("not a date")).toBe("not a date");
  });
});

describe("LiveStage", () => {
  it("counts 3-2-1 from the server start, then mounts live at GO with the shifted clock", () => {
    const s = renderStage(NOW);
    s.getByTestId("match-countdown");
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("3");
    s.getByText("REC ARMS AT GO");
    s.getByText("RANKED");
    expect(mockLiveProps).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("1");
    expect(mockTick).toHaveBeenCalledTimes(3);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    s.getByTestId("live-step");
    expect(s.queryByTestId("match-countdown")).toBeNull();
    s.getByText("GRAPPLE");
    const props = mockLiveProps.mock.calls.at(-1)?.[0];
    expect(props.startedAt).toBe(new Date(NOW + COUNTDOWN_MS).toISOString());
    expect(props.recordingEnabled).toBe(true);
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(s.queryByText("GRAPPLE")).toBeNull();
  });

  it("the second phone, joining late, reaches GO at the same moment", () => {
    // timer_started arrived 1.4 s after the server start.
    const s = renderStage(NOW - 1_400);
    expect(s.getByTestId("countdown-numeral")).toHaveTextContent("2");
    act(() => {
      jest.advanceTimersByTime(1_600);
    });
    s.getByTestId("live-step");
  });

  it("re-entering a match already past GO goes straight to live", () => {
    const s = renderStage(NOW - 60_000);
    s.getByTestId("live-step");
    expect(s.queryByTestId("match-countdown")).toBeNull();
    expect(mockTick).not.toHaveBeenCalled();
  });

  it("never runs longer than one countdown on a phone whose clock is behind", () => {
    // The server start looks 10 s in the future on this phone.
    const s = renderStage(NOW + 10_000);
    act(() => {
      jest.advanceTimersByTime(COUNTDOWN_MS);
    });
    s.getByTestId("live-step");
  });

  it("not recording: says so, and live mounts with recording off", () => {
    const s = renderStage(NOW, false);
    s.getByText("NOT RECORDING");
    act(() => {
      jest.advanceTimersByTime(COUNTDOWN_MS);
    });
    expect(mockLiveProps.mock.calls.at(-1)?.[0].recordingEnabled).toBe(false);
  });
});

describe("orientation", () => {
  const fontSize = (el: { props: { style?: unknown } }) =>
    (StyleSheet.flatten(el.props.style as never) as { fontSize?: number }).fontSize;

  it("portrait: the 240 numeral, the caption and the athlete chip", () => {
    const s = renderStage(NOW);
    expect(fontSize(s.getByTestId("countdown-numeral"))).toBe(240);
    s.getByText("SYNCED TO SERVER CLOCK \u00b7 BOTH PHONES");
    s.getByTestId("countdown-chip");
    s.getByTestId("countdown-progress");
  });

  it("landscape: the numeral fits the height, no caption or chip to overlap it", () => {
    mockWindow.current = { width: 844, height: 390 };
    const s = renderStage(NOW);
    const size = fontSize(s.getByTestId("countdown-numeral"))!;
    expect(size).toBe(numeralSize(390));
    expect(size).toBeLessThan(390 * 0.6);
    expect(s.queryByText("SYNCED TO SERVER CLOCK \u00b7 BOTH PHONES")).toBeNull();
    expect(s.queryByTestId("countdown-chip")).toBeNull();
    s.getByTestId("countdown-progress");
  });

  it("numeral size is capped and floored", () => {
    expect(numeralSize(2000)).toBe(240);
    expect(numeralSize(100)).toBe(96);
  });
});
