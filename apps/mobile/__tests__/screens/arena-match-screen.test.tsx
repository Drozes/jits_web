/**
 * Sessionless match screen (app/(app)/match/[matchId].tsx).
 *
 * This is where an Arena challenge lands both parties. It mounts the same
 * wizard a session match does, with no sessionId anywhere, so the Arena
 * inherits recording, upload and playback with no Arena-specific video code.
 *
 * The exit is asserted through the shared constants rather than a re-spelled
 * literal: a guard that hardcodes its own copy of a route passes green while
 * the app navigates somewhere else.
 */
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";

// ---- mocks ----

jest.mock("expo-router", () => {
  const R = require("react");
  return {
    Stack: { Screen: () => R.createElement(R.Fragment, null) },
    useLocalSearchParams: () => ({ matchId: "M9" }),
  };
});

const mockUsePreventRemove = jest.fn();
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#9AA3AD" }),
}));

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ athlete: { id: "me-1" }, isLoading: false }),
}));

jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return { AppHeader: () => R.createElement(RN.View, { testID: "app-header" }) };
});

const mockWizardProps = jest.fn();
let mockOnStepChange: ((step: string | null) => void) | undefined;
jest.mock("@/components/match-flow/match-flow-wizard", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    MatchFlowWizard: (props: Record<string, unknown>) => {
      mockWizardProps(props);
      mockOnStepChange = props.onStepChange as typeof mockOnStepChange;
      return R.createElement(RN.View, { testID: "match-flow-wizard" });
    },
  };
});

import ArenaMatchScreen from "@/app/(app)/match/[matchId]";

beforeEach(() => {
  jest.clearAllMocks();
  mockOnStepChange = undefined;
});

describe("ArenaMatchScreen", () => {
  it("hands the wizard the Arena exit and no session", async () => {
    render(<ArenaMatchScreen />);

    await waitFor(() => expect(mockWizardProps).toHaveBeenCalled());
    const props = mockWizardProps.mock.calls[0][0];

    expect(props.exitHref).toBe(ARENA_HREF);
    expect(props.exitLabel).toBe(ARENA_EXIT_LABEL);
    expect(props.exitLabel).toBe("Back to Arena");
    expect(props.matchId).toBe("M9");
    expect(props.currentAthleteId).toBe("me-1");
    // A sessionless match must never reintroduce the prop jits-3929 removed.
    expect(props.sessionId).toBeUndefined();
  });

  it("blocks back navigation only while the match is in flight", async () => {
    const { rerender } = render(<ArenaMatchScreen />);
    await waitFor(() => expect(mockWizardProps).toHaveBeenCalled());

    // Early steps are safe to leave.
    expect(mockUsePreventRemove.mock.calls[0][0]).toBe(false);

    mockUsePreventRemove.mockClear();
    await waitFor(() => expect(mockOnStepChange).toBeDefined());
    act(() => {
      mockOnStepChange?.("live");
    });
    rerender(<ArenaMatchScreen />);

    // A live match left by a back gesture would strand as in_progress with no
    // resume path.
    expect(
      mockUsePreventRemove.mock.calls.some((c) => c[0] === true),
    ).toBe(true);
  });
});
