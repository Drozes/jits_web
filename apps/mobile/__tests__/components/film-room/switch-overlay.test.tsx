/**
 * The held still of an angle switch (jits-xfvd.16, contract 4.1; Motion
 * registry "Held frame", "Angle crossfade", "Angle dip").
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => {
  const mock = require("react-native-reanimated/mock");
  return {
    ...mock,
    withTiming: jest.fn(mock.withTiming),
    withSequence: jest.fn(mock.withSequence),
    withDelay: jest.fn(mock.withDelay),
  };
});
// The hook module (for SWITCH_SETTLE_MS) reaches the Supabase client.
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: { testID?: string }) => R.createElement(RN.View, { testID: props.testID }) };
});

import { withDelay, withTiming } from "react-native-reanimated";
import { SwitchOverlay, type SwitchOverlayProps } from "@/components/film-room/switch-overlay";
import { duration, moment } from "@/lib/motion";
import { SWITCH_SETTLE_MS } from "@/lib/match-detail/use-video-playback";

const HIDDEN = { includeHiddenElements: true } as const;
const STILL = { width: 1920, height: 1080 } as unknown as NonNullable<SwitchOverlayProps["switchState"]["heldFrame"]>;
const mockWithTiming = withTiming as jest.Mock;
const mockWithDelay = withDelay as jest.Mock;

function state(patch: Partial<SwitchOverlayProps["switchState"]> = {}): SwitchOverlayProps["switchState"] {
  return { phase: "pending", seq: 1, heldFrame: STILL, approximate: false, restoring: false, ...patch };
}

function overlay(s: SwitchOverlayProps["switchState"], reduceMotion = false) {
  return <SwitchOverlay switchState={s} reduceMotion={reduceMotion} />;
}

beforeEach(() => jest.clearAllMocks());

describe("SwitchOverlay", () => {
  it("renders nothing at idle or without a still", () => {
    expect(render(overlay(state({ phase: "idle" }))).queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    expect(render(overlay(state({ heldFrame: null }))).queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    expect(render(overlay(state({ phase: "landing", heldFrame: null }))).queryByTestId("switch-overlay", HIDDEN)).toBeNull();
  });

  it("holds the still at full opacity while pending, untouchable and hidden from screen readers", () => {
    const s = render(overlay(state()));
    const root = s.getByTestId("switch-overlay", HIDDEN);
    expect(root.props.pointerEvents).toBe("none");
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(s.getByTestId("switch-overlay-hold", HIDDEN)).toBeTruthy();
    expect(s.getByTestId("switch-overlay-still", HIDDEN)).toBeTruthy();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it("removes the still at once when the cap clears it mid-switch (no fade)", () => {
    const s = render(overlay(state()));
    s.rerender(overlay(state({ heldFrame: null })));
    expect(s.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it("crossfades an exact-synced landing over duration.fast", () => {
    const s = render(overlay(state()));
    s.rerender(overlay(state({ phase: "landing" })));
    expect(s.getByTestId("switch-overlay-crossfade", HIDDEN)).toBeTruthy();
    expect(s.queryByTestId("switch-overlay-black", HIDDEN)).toBeNull();
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: duration.fast }));
    expect(duration.fast).toBeLessThanOrEqual(SWITCH_SETTLE_MS);
  });

  it("a restore landing crossfades too, even after an approximate switch", () => {
    const s = render(overlay(state({ phase: "landing", approximate: true, restoring: true })));
    expect(s.getByTestId("switch-overlay-crossfade", HIDDEN)).toBeTruthy();
  });

  it("dips an approximate landing through black, moment.angleDip each way", () => {
    const s = render(overlay(state({ approximate: true })));
    s.rerender(overlay(state({ phase: "landing", approximate: true })));
    expect(s.getByTestId("switch-overlay-dip", HIDDEN)).toBeTruthy();
    expect(s.getByTestId("switch-overlay-black", HIDDEN)).toBeTruthy();
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: moment.angleDip }));
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: moment.angleDip }));
    // The still goes at the darkest point.
    expect(mockWithDelay).toHaveBeenCalledWith(moment.angleDip, expect.anything());
    expect(moment.angleDip * 2).toBeLessThanOrEqual(SWITCH_SETTLE_MS);
  });

  it("cuts under Reduce Motion: the still goes at landing, with no animation", () => {
    const s = render(overlay(state({ approximate: true }), true));
    expect(s.getByTestId("switch-overlay-still", HIDDEN)).toBeTruthy();
    s.rerender(overlay(state({ phase: "landing", approximate: true }), true));
    expect(s.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    s.rerender(overlay(state({ phase: "landing" }), true));
    expect(s.queryByTestId("switch-overlay", HIDDEN)).toBeNull();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});
