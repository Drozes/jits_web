/**
 * Hold to end: a 1.2 s hold ends the match, releasing early cancels, a tap
 * does nothing, and screen reader users get "End match" actions instead.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});

import { HoldToEndButton } from "@/components/match-flow/live/hold-to-end-button";
import { HOLD_TO_END_MS } from "@/lib/match-flow/live-view-state";

function renderButton(props: Partial<React.ComponentProps<typeof HoldToEndButton>> = {}) {
  const onEnd = jest.fn();
  const onHoldChange = jest.fn();
  const element = (p: Partial<React.ComponentProps<typeof HoldToEndButton>>) => (
    <HoldToEndButton disabled={false} ending={false} onEnd={onEnd} onHoldChange={onHoldChange} {...props} {...p} />
  );
  const utils = render(element({}));
  const button = () => utils.getByTestId("live-end");
  return { ...utils, onEnd, onHoldChange, button, rerenderWith: (p: Partial<React.ComponentProps<typeof HoldToEndButton>>) => utils.rerender(element(p)) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("keeps a 1200 ms long press as a redundant completion trigger", () => {
  const s = renderButton();
  expect(HOLD_TO_END_MS).toBe(1200);
  expect(s.UNSAFE_getByProps({ testID: "live-end", delayLongPress: 1200 })).toBeTruthy();
});

it("ends once on a completed hold and reads KEEP HOLDING, then ENDING", () => {
  const s = renderButton();
  expect(s.button()).toHaveTextContent("HOLD TO END");

  fireEvent(s.button(), "pressIn");
  expect(s.button()).toHaveTextContent("KEEP HOLDING");
  expect(s.onHoldChange).toHaveBeenLastCalledWith(true);

  fireEvent(s.button(), "longPress");
  fireEvent(s.button(), "pressOut");
  expect(s.onEnd).toHaveBeenCalledTimes(1);
  expect(s.onHoldChange).toHaveBeenLastCalledWith(false);
  expect(s.button()).toHaveTextContent("ENDING");
  expect(s.button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

  // A second completion (or action) cannot end it twice.
  fireEvent(s.button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  expect(s.onEnd).toHaveBeenCalledTimes(1);
});

it("ends from its own 1200 ms timer with no long press event (finger drifted past 10 px)", () => {
  const s = renderButton();
  fireEvent(s.button(), "pressIn");
  // RN would cancel its long press timer on a 10 px drift; the component must not rely on it.
  fireEvent(s.button(), "responderMove", { nativeEvent: { pageX: 40, pageY: 0 } });
  act(() => {
    jest.advanceTimersByTime(HOLD_TO_END_MS - 1);
  });
  expect(s.onEnd).not.toHaveBeenCalled();
  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(s.onEnd).toHaveBeenCalledTimes(1);
  expect(s.button()).toHaveTextContent("ENDING");
  // A late long press after the timer finished cannot end twice.
  fireEvent(s.button(), "longPress");
  act(() => {
    jest.advanceTimersByTime(5_000);
  });
  expect(s.onEnd).toHaveBeenCalledTimes(1);
});

it("a timer hold that becomes disabled under the finger never ends", () => {
  const s = renderButton();
  fireEvent(s.button(), "pressIn");
  act(() => {
    jest.advanceTimersByTime(600);
  });
  s.rerenderWith({ disabled: true });
  s.rerenderWith({ disabled: false });
  act(() => {
    jest.advanceTimersByTime(2_000);
  });
  expect(s.onEnd).not.toHaveBeenCalled();
});

it("unmounting mid hold does not end", () => {
  const s = renderButton();
  fireEvent(s.button(), "pressIn");
  s.unmount();
  act(() => {
    jest.advanceTimersByTime(2_000);
  });
  expect(s.onEnd).not.toHaveBeenCalled();
});

it("releasing before 1200 ms does not end, and restores the idle label", () => {
  const s = renderButton();
  fireEvent(s.button(), "pressIn");
  act(() => {
    jest.advanceTimersByTime(700);
  });
  fireEvent(s.button(), "pressOut");
  act(() => {
    jest.advanceTimersByTime(1_000);
  });
  expect(s.onEnd).not.toHaveBeenCalled();
  expect(s.button()).toHaveTextContent("HOLD TO END");
  expect(s.onHoldChange).toHaveBeenLastCalledWith(false);
});

it("a short tap does nothing", () => {
  const s = renderButton();
  fireEvent.press(s.button());
  expect(s.onEnd).not.toHaveBeenCalled();
  expect(s.button()).toHaveTextContent("HOLD TO END");
});

it("ignores presses and actions while disabled", () => {
  const s = renderButton({ disabled: true });
  expect(s.button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  fireEvent(s.button(), "pressIn");
  fireEvent(s.button(), "longPress");
  fireEvent(s.button(), "accessibilityAction", { nativeEvent: { actionName: "activate" } });
  fireEvent(s.button(), "accessibilityAction", { nativeEvent: { actionName: "longpress" } });
  expect(s.onEnd).not.toHaveBeenCalled();
  expect(s.onHoldChange).not.toHaveBeenCalled();
});

it("cancels a hold that becomes disabled under the finger, even if re-enabled", () => {
  const s = renderButton();
  fireEvent(s.button(), "pressIn");
  s.rerenderWith({ disabled: true });
  expect(s.onHoldChange).toHaveBeenLastCalledWith(false);
  s.rerenderWith({ disabled: false });
  fireEvent(s.button(), "longPress");
  expect(s.onEnd).not.toHaveBeenCalled();
});

it.each(["activate", "longpress"])("the '%s' accessibility action ends the match", (actionName) => {
  const s = renderButton();
  fireEvent(s.button(), "accessibilityAction", { nativeEvent: { actionName } });
  expect(s.onEnd).toHaveBeenCalledTimes(1);
});

it("exposes End match actions and a hold label to screen readers", () => {
  const s = renderButton();
  const b = s.button();
  expect(b.props.accessibilityRole).toBe("button");
  expect(b.props.accessibilityLabel).toBe("Hold to end match");
  expect(b.props.accessibilityActions).toEqual([
    { name: "activate", label: "End match" },
    { name: "longpress", label: "End match" },
  ]);
});

it("reads ENDING while an end is pending", () => {
  const s = renderButton({ ending: true, disabled: true });
  expect(s.button()).toHaveTextContent("ENDING");
});
