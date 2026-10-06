/**
 * The Syncing pill (jits-xfvd.16, contract 4.2; Motion registry "Syncing
 * pill"): 200 ms show delay, 400 ms minimum, label by sync, hidden from
 * screen readers, counted once per switch, static under Reduce Motion.
 */
import * as React from "react";
import { AppState } from "react-native";
import { act, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  return { ...mock, withRepeat: jest.fn(mock.withRepeat), cancelAnimation: jest.fn() };
});

import { cancelAnimation, withRepeat } from "react-native-reanimated";
import { SyncingPill, SYNCING_PILL_DELAY_MS, SYNCING_PILL_MIN_MS, type SyncingPillProps } from "@/components/film-room/syncing-pill";
import { duration, __resetAppActiveForTests } from "@/lib/motion";

const HIDDEN = { includeHiddenElements: true } as const;
const T0 = 1_000_000;
const mockWithRepeat = withRepeat as jest.Mock;

type S = SyncingPillProps["switchState"];
const IDLE: S = { phase: "idle", seq: 0, startedAt: null, approximate: false, restoring: false };
const pending = (patch: Partial<S> = {}): S => ({ phase: "pending", seq: 1, startedAt: Date.now(), approximate: false, restoring: false, ...patch });

function pill(s: S, opts: { reduceMotion?: boolean; onShown?: () => void } = {}) {
  return <SyncingPill switchState={s} reduceMotion={opts.reduceMotion ?? false} onShown={opts.onShown} />;
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

let appListeners: Array<(s: string) => void> = [];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  jest.clearAllMocks();
  appListeners = [];
  __resetAppActiveForTests();
  // The react-native jest mock has no real current state; start in the foreground.
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, l: (s: string) => void) => {
    appListeners.push(l);
    return { remove: () => (appListeners = appListeners.filter((x) => x !== l)) };
  }) as unknown as typeof AppState.addEventListener);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("SyncingPill", () => {
  it("never shows for a switch that lands within 200 ms", () => {
    const onShown = jest.fn();
    const s = render(pill(pending(), { onShown }));
    advance(SYNCING_PILL_DELAY_MS - 20);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    s.rerender(pill({ ...pending(), phase: "landing" }, { onShown }));
    advance(1000);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(onShown).not.toHaveBeenCalled();
  });

  it("shows 200 ms after the tap and stays at least 400 ms", () => {
    const onShown = jest.fn();
    const start = pending();
    const s = render(pill(start, { onShown }));
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toHaveTextContent("Syncing angle");
    expect(onShown).toHaveBeenCalledTimes(1);
    // Lands 50 ms after showing: still up until 400 ms have passed.
    advance(50);
    s.rerender(pill({ ...start, phase: "landing" }, { onShown }));
    advance(SYNCING_PILL_MIN_MS - 60);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    // Then it fades out over duration.fast and is gone.
    advance(10);
    advance(duration.fast);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it("stays up as long as the switch is pending", () => {
    const start = pending();
    const s = render(pill(start));
    advance(3000);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    s.rerender(pill({ ...start, phase: "idle" }));
    advance(0);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    advance(duration.fast);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
  });

  it("says Switching angle for an approximate switch, with no ellipsis", () => {
    const s = render(pill(pending({ approximate: true })));
    advance(SYNCING_PILL_DELAY_MS);
    const label = s.getByTestId("syncing-pill-label", HIDDEN);
    expect(label).toHaveTextContent("Switching angle");
    expect(String(label.props.children)).not.toMatch(/\.\.\.|…/);
  });

  it("a superseding switch keeps it up (no blink), relabels it and counts once per seq", () => {
    const onShown = jest.fn();
    const s = render(pill(pending(), { onShown }));
    advance(SYNCING_PILL_DELAY_MS);
    s.rerender(pill(pending({ seq: 2, approximate: true }), { onShown }));
    expect(s.getByTestId("syncing-pill", HIDDEN)).toHaveTextContent("Switching angle");
    expect(onShown).toHaveBeenCalledTimes(2);
    s.rerender(pill(pending({ seq: 2, approximate: true }), { onShown }));
    advance(500);
    expect(onShown).toHaveBeenCalledTimes(2);
  });

  it("reports itself up on show and gone only after the fade-out", () => {
    const onVisibleChange = jest.fn();
    const start = pending();
    const s = render(<SyncingPill switchState={start} reduceMotion={false} onVisibleChange={onVisibleChange} />);
    expect(onVisibleChange).not.toHaveBeenCalled();
    advance(SYNCING_PILL_DELAY_MS);
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
    s.rerender(<SyncingPill switchState={{ ...start, phase: "landing" }} reduceMotion={false} onVisibleChange={onVisibleChange} />);
    advance(SYNCING_PILL_MIN_MS - SYNCING_PILL_DELAY_MS);
    // Fading out: still up.
    expect(onVisibleChange).toHaveBeenCalledTimes(1);
    advance(SYNCING_PILL_DELAY_MS);
    advance(duration.fast);
    expect(onVisibleChange).toHaveBeenCalledTimes(2);
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
  });

  it("a failure removes it at once, with no minimum and no fade (P-AS-05)", () => {
    const onVisibleChange = jest.fn();
    const start = pending();
    const s = render(<SyncingPill switchState={start} reduceMotion={false} onVisibleChange={onVisibleChange} />);
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    s.rerender(<SyncingPill switchState={{ ...start, restoring: true }} reduceMotion={false} onVisibleChange={onVisibleChange} />);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);
    advance(1000);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
  });

  it("a failed switch with no restore (no angle to return to) removes it at once too", () => {
    const start = pending();
    const s = render(pill(start));
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    s.rerender(<SyncingPill switchState={{ ...start, phase: "idle", failed: { seq: 1, targetId: "b", at: Date.now() } }} reduceMotion={false} />);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
  });

  it("is not shown for a restore after a failure", () => {
    const s = render(pill(pending({ restoring: true })));
    advance(1000);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
    expect(render(pill(IDLE)).queryByTestId("syncing-pill", HIDDEN)).toBeNull();
  });

  it("is hidden from screen readers and never touchable", () => {
    const s = render(pill(pending()));
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.queryByTestId("syncing-pill")).toBeNull();
    const root = s.getByTestId("syncing-pill", HIDDEN);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(root.props.pointerEvents).toBe("none");
  });

  it("sweeps the sync bar on a 1400 ms linear loop while up", () => {
    const s = render(pill(pending()));
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.getByTestId("syncing-pill-bar-band", HIDDEN)).toBeTruthy();
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);
    expect(mockWithRepeat.mock.calls[0][1]).toBe(-1);
  });

  it("pauses the sweep while the app is in the background", () => {
    const s = render(pill(pending()));
    advance(SYNCING_PILL_DELAY_MS);
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);
    act(() => appListeners.forEach((l) => l("background")));
    expect(cancelAnimation).toHaveBeenCalled();
    act(() => appListeners.forEach((l) => l("active")));
    expect(mockWithRepeat).toHaveBeenCalledTimes(2);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
  });

  it("under Reduce Motion appears in place with a static full-width bar", () => {
    const s = render(pill(pending(), { reduceMotion: true }));
    advance(SYNCING_PILL_DELAY_MS);
    expect(s.getByTestId("syncing-pill", HIDDEN)).toBeTruthy();
    expect(s.getByTestId("syncing-pill-bar-static", HIDDEN)).toBeTruthy();
    expect(s.queryByTestId("syncing-pill-bar-band", HIDDEN)).toBeNull();
    expect(mockWithRepeat).not.toHaveBeenCalled();
    // And goes in place once the minimum has passed.
    s.rerender(pill({ ...pending(), phase: "idle" }, { reduceMotion: true }));
    advance(SYNCING_PILL_MIN_MS);
    expect(s.queryByTestId("syncing-pill", HIDDEN)).toBeNull();
  });
});
