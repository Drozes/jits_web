/**
 * The match screen (`app/(app)/match/[matchId]/index.tsx`) and the steps
 * before the start: timekeeper mode's pick (`crew`, M1) joins the face-off
 * (`weight`, `ready`) in `NO_SWIPE_STEPS`. On each of them the iOS swipe back
 * is off, since leaving there without cancelling left the match pending with
 * nobody in it (jits-bh2v), but no preventRemove guard is set, so the step's
 * own exits (its Leave, a remote cancel) still navigate. The two-athlete
 * face-off case is pinned in `screens/arena-match-screen.test.tsx`; this adds
 * the step timekeeper mode brings, with the same mocks.
 */
import * as React from "react";
import { act, render, waitFor } from "@testing-library/react-native";

const mockScreenOptions = jest.fn();
jest.mock("expo-router", () => {
  const R = require("react");
  return {
    Stack: {
      Screen: (props: { options?: unknown }) => {
        mockScreenOptions(props.options);
        return R.createElement(R.Fragment, null);
      },
    },
    useLocalSearchParams: () => ({ matchId: "99999999-9999-4999-8999-999999999999" }),
    useRouter: () => ({ dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  };
});

const mockUsePreventRemove = jest.fn();
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
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

let mockOnStepChange: ((step: string | null) => void) | undefined;
jest.mock("@/components/match-flow/match-flow-wizard", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    MatchFlowWizard: (props: { onStepChange?: (step: string | null) => void }) => {
      mockOnStepChange = props.onStepChange;
      return R.createElement(RN.View, { testID: "match-flow-wizard" });
    },
  };
});

import ArenaMatchScreen from "@/app/(app)/match/[matchId]/index";

beforeEach(() => {
  jest.clearAllMocks();
  mockOnStepChange = undefined;
});

async function onStep(step: string) {
  render(<ArenaMatchScreen />);
  await waitFor(() => expect(mockOnStepChange).toBeDefined());
  mockUsePreventRemove.mockClear();
  mockScreenOptions.mockClear();
  act(() => {
    mockOnStepChange?.(step);
  });
}

describe("the steps before the start: no swipe back, no remove guard", () => {
  it.each(["crew", "weight", "ready"])("%s turns the iOS back gesture off and leaves the exits free", async (step) => {
    await onStep(step);
    expect(mockScreenOptions).toHaveBeenLastCalledWith(expect.objectContaining({ gestureEnabled: false }));
    expect(mockUsePreventRemove.mock.calls.length).toBeGreaterThan(0);
    expect(mockUsePreventRemove.mock.calls.every((c) => c[0] === false)).toBe(true);
  });

  it("the verdict can still be swiped away (control)", async () => {
    await onStep("summary");
    expect(mockScreenOptions).toHaveBeenLastCalledWith(expect.objectContaining({ gestureEnabled: true }));
  });
});
