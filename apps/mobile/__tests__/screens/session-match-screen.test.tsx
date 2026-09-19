/**
 * Session match screen (app/(app)/session/[id]/match/[matchId].tsx).
 *
 * After jits-3929 the wizard no longer takes a `sessionId`, so the session
 * route is now the single place that knows a session match exits to its
 * lobby. This pins that: the route must hand the wizard the exact URL and
 * copy the wizard used to hardcode, so session behaviour is unchanged.
 */
import * as React from "react";
import { render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("expo-router", () => {
  const R = require("react");
  return {
    Stack: { Screen: () => R.createElement(R.Fragment, null) },
    useLocalSearchParams: () => ({ id: "S1", matchId: "M1" }),
  };
});

jest.mock("@react-navigation/native", () => ({
  usePreventRemove: jest.fn(),
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
jest.mock("@/components/match-flow/match-flow-wizard", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    MatchFlowWizard: (props: Record<string, unknown>) => {
      mockWizardProps(props);
      return R.createElement(RN.View, { testID: "match-flow-wizard" });
    },
  };
});

import SessionMatchScreen from "@/app/(app)/session/[id]/match/[matchId]";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionMatchScreen", () => {
  it("hands the wizard the session lobby exit, preserving today's behaviour", async () => {
    render(<SessionMatchScreen />);

    await waitFor(() => expect(mockWizardProps).toHaveBeenCalled());
    const props = mockWizardProps.mock.calls[0][0];

    expect(props.exitHref).toBe("/(app)/session/S1/lobby");
    expect(props.exitLabel).toBe("Back to Lobby");
    expect(props.matchId).toBe("M1");
    expect(props.currentAthleteId).toBe("me-1");
    // The prop this refactor removed must not creep back in.
    expect(props.sessionId).toBeUndefined();
  });
});
