/** The state strip's copy per variant, the final-10 segments and the time-up drain. */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { StateStrip, stripAnnouncement } from "@/components/match-flow/live/state-strip";

it("paused: PAUSED | CAMERA STILL RECORDING on amber", () => {
  const s = render(<StateStrip variant="paused" remaining={252} />);
  s.getByText("PAUSED");
  s.getByText("CAMERA STILL RECORDING");
  expect(s.getByTestId("live-strip-paused").props.style).toEqual(
    expect.objectContaining({ backgroundColor: "#F59E0B" }),
  );
});

it("final 10: lights exactly as many of the 10 segments as seconds remain", () => {
  const s = render(<StateStrip variant="final10" remaining={7} />);
  s.getByText("FINAL 10 SECONDS");
  expect(s.getAllByTestId("final10-segment-lit")).toHaveLength(7);
  expect(s.getAllByTestId("final10-segment")).toHaveLength(3);
});

it("time up: TIME | ENDING MATCH with the drain bar", () => {
  jest.useFakeTimers();
  const s = render(<StateStrip variant="timeup" remaining={0} />);
  s.getByText("TIME");
  s.getByText("ENDING MATCH");
  s.getByTestId("timeup-drain");
  act(() => {
    jest.advanceTimersByTime(1_000);
  });
  s.unmount();
  jest.useRealTimers();
});

it("hold and starting copy", () => {
  const hold = render(<StateStrip variant="hold" remaining={206} />);
  hold.getByText("RELEASE TO CANCEL");
  hold.getByText("ENDING MATCH");
  const starting = render(<StateStrip variant="starting" remaining={596} />);
  starting.getByText("CAMERA STARTING");
  starting.getByText("CLOCK IS RUNNING");
});

it("is a polite live region and announces in sentence case", () => {
  const s = render(<StateStrip variant="paused" remaining={10} />);
  expect(s.getByTestId("live-strip-paused").props.accessibilityLiveRegion).toBe("polite");
  expect(stripAnnouncement("paused")).toBe("Paused. camera still recording");
  expect(stripAnnouncement("final10")).toBe("Final 10 seconds");
});
