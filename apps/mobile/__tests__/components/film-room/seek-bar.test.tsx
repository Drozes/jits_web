import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { SeekBar } from "@/components/film-room/seek-bar";

const MOMENTS = [
  { t: 27, label: "Takedown", kind: "score" as const, description: null },
  { t: 377, label: "Rear-naked choke", kind: "finish" as const, description: null },
];

function setup(positionS = 100) {
  const onSeek = jest.fn();
  const utils = render(<SeekBar positionS={positionS} durationS={400} moments={MOMENTS} onSeek={onSeek} />);
  const bar = utils.getByTestId("player-seek");
  act(() => {
    fireEvent(bar, "layout", { nativeEvent: { layout: { width: 200, height: 32, x: 0, y: 0 } } });
  });
  return { ...utils, bar, onSeek };
}

describe("SeekBar", () => {
  it("places a marker per moment, the finish a white square (never Gain Green, WP2 FR-1)", () => {
    const { getByTestId } = setup();
    expect(getByTestId("seek-marker-0", { includeHiddenElements: true }).props.style).toMatchObject({ left: "6.75%", backgroundColor: "#F59E0B" });
    expect(getByTestId("seek-marker-1", { includeHiddenElements: true }).props.style).toMatchObject({ left: "94.25%", backgroundColor: "#FFFFFF", borderColor: "#0D0F14", borderRadius: 1 });
  });

  it("seeks to the touched point on release", () => {
    const { bar, onSeek } = setup();
    const touch = { touchActive: true, startPageX: 50, startPageY: 0, startTimeStamp: 0, currentPageX: 50, currentPageY: 0, currentTimeStamp: 0, previousPageX: 50, previousPageY: 0, previousTimeStamp: 0 };
    const history = { touchBank: [touch], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 0 };
    const evt = { nativeEvent: { locationX: 50, pageX: 50, touches: [], changedTouches: [] }, touchHistory: history };
    act(() => {
      bar.props.onResponderGrant(evt);
    });
    act(() => {
      bar.props.onResponderRelease(evt);
    });
    // 50 of 200 px on a 400 s clip.
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("is adjustable by VoiceOver in 10 s steps with a spoken value", () => {
    const { bar, onSeek } = setup(100);
    expect(bar.props.accessibilityRole).toBe("adjustable");
    expect(bar.props.accessibilityValue).toMatchObject({ min: 0, max: 400, now: 100, text: "1 minute 40 seconds of 6 minutes 40 seconds" });
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onSeek).toHaveBeenLastCalledWith(110);
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(onSeek).toHaveBeenLastCalledWith(90);
  });
});
