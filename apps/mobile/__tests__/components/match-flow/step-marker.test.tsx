/**
 * The 1 px step marker the match-loop harness reads (by its accessibility
 * label first, the testID as fallback). Exposed to accessibility only in
 * dev builds (the harness drives a Metro dev build); hidden from VoiceOver
 * and TalkBack in release builds.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

import { StepMarker } from "@/components/match-flow/match-flow-wizard";

describe("StepMarker", () => {
  it("dev: the harness label and testID", () => {
    const s = render(<StepMarker step="confirm" exposed />);
    const el = s.getByTestId("match-step-confirm");
    expect(el.props.accessibilityLabel).toBe("Step 7 of 8, Confirm");
    expect(el.props.accessible).toBe(true);
  });

  it("release: hidden from screen readers, testID kept", () => {
    const s = render(<StepMarker step="live" exposed={false} />);
    const el = s.getByTestId("match-step-live", { includeHiddenElements: true });
    expect(el.props.accessibilityLabel).toBeUndefined();
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("defaults to __DEV__", () => {
    const s = render(<StepMarker step="ready" />);
    expect(s.getByTestId("match-step-ready", { includeHiddenElements: true }).props.accessible).toBe(__DEV__);
  });
});
