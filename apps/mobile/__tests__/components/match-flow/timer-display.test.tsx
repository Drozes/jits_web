/**
 * Live timer colours and caption (jits-plt6, jits-4zp.2).
 *
 * The numeral is data: ink at every value, including 00:00. PAUSED and the
 * time-up caption are pressure, so amber, never Signal Red. The caption names
 * the opponent.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
}));

jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  return { LivePill: () => R.createElement(RN.View, { testID: "live-pill" }) };
});

import { TimerDisplay } from "@/components/match-flow/steps/timer-display";

type Props = React.ComponentProps<typeof TimerDisplay>;

function renderTimer(overrides: Partial<Props> = {}) {
  return render(
    <TimerDisplay
      formatted="04:59"
      remaining={299}
      paused={false}
      matchType="ranked"
      opponentName="Demo Red"
      {...overrides}
    />,
  );
}

it("keeps the numeral ink while running and at 00:00", () => {
  const running = renderTimer();
  expect(running.getByTestId("live-timer").props.className).toContain("text-ink");
  expect(running.getByTestId("live-timer").props.className).not.toContain("text-negative");

  const zero = renderTimer({ formatted: "00:00", remaining: 0 });
  expect(zero.getByTestId("live-timer").props.className).toContain("text-ink");
  expect(zero.getByTestId("live-timer").props.className).not.toContain("text-negative");
});

it("shows an amber TIME caption at 00:00", () => {
  const s = renderTimer({ formatted: "00:00", remaining: 0 });
  const time = s.getByTestId("live-time-up");
  expect(time.props.children).toBe("Time");
  expect(time.props.className).toContain("text-amber-500");
  expect(time.props.className).not.toContain("text-negative");
  expect(s.queryByTestId("live-paused")).toBeNull();
});

it("shows an amber PAUSED caption (and not TIME) while paused, even at 00:00", () => {
  const s = renderTimer({ formatted: "00:00", remaining: 0, paused: true });
  const paused = s.getByTestId("live-paused");
  expect(paused.props.children).toBe("Paused");
  expect(paused.props.className).toContain("text-amber-500");
  expect(paused.props.className).not.toContain("text-negative");
  expect(s.queryByTestId("live-time-up")).toBeNull();
});

it("shows no pressure caption while running", () => {
  const s = renderTimer();
  expect(s.queryByTestId("live-paused")).toBeNull();
  expect(s.queryByTestId("live-time-up")).toBeNull();
});

it("names the opponent under the clock", () => {
  expect(renderTimer().getByText("Ranked · vs Demo Red")).toBeTruthy();
  expect(renderTimer({ matchType: "casual" }).getByText("Casual · vs Demo Red")).toBeTruthy();
});

it("falls back to the match type alone without a name", () => {
  expect(renderTimer({ opponentName: null }).getByText("Ranked Match")).toBeTruthy();
  expect(renderTimer({ opponentName: " " }).getByText("Ranked Match")).toBeTruthy();
});
