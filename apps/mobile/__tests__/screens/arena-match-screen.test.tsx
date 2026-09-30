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

const mockDismissTo = jest.fn();
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
    useRouter: () => ({ dismissTo: mockDismissTo, replace: jest.fn(), push: jest.fn() }),
  };
});

const mockUsePreventRemove = jest.fn();
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ textSecondary: "#9AA3AD" }),
}));

jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ athlete: { id: "me-1" }, isLoading: false }),
}));

const mockHeaderProps = jest.fn();
jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    AppHeader: (props: Record<string, unknown>) => {
      mockHeaderProps(props);
      return R.createElement(RN.View, { testID: "app-header" });
    },
  };
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
import { renderHook } from "@testing-library/react-native";
import {
  __resetArenaStoreForTests,
  getLeftMatchIds,
  useIsInArenaMatch,
} from "@/lib/arena/arena-store";

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
    expect(props.matchId).toBe("99999999-9999-4999-8999-999999999999");
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

  it("marks the athlete as in a match for exactly as long as it is mounted", () => {
    // That bit is what takes a live athlete offline and holds challenge
    // prompts back; every wizard exit unmounts this screen, which restores.
    const probe = renderHook(() => useIsInArenaMatch());
    const screen = render(<ArenaMatchScreen />);
    expect(probe.result.current).toBe(true);

    screen.unmount();
    expect(probe.result.current).toBe(false);
  });

  it("remembers its match id on the way out, so Home does not offer it back (jits-r9a)", () => {
    __resetArenaStoreForTests();
    const screen = render(<ArenaMatchScreen />);
    expect(getLeftMatchIds().has("99999999-9999-4999-8999-999999999999")).toBe(false);
    screen.unmount();
    expect(getLeftMatchIds().has("99999999-9999-4999-8999-999999999999")).toBe(true);
  });

  it("lets the face-off neither swipe back nor block its own exits (jits-bh2v)", async () => {
    render(<ArenaMatchScreen />);
    await waitFor(() => expect(mockOnStepChange).toBeDefined());
    mockUsePreventRemove.mockClear();
    mockScreenOptions.mockClear();
    act(() => {
      mockOnStepChange?.("weight");
    });
    // No preventRemove guard: Leave and a remote cancel must still navigate.
    expect(mockUsePreventRemove.mock.calls.every((c) => c[0] === false)).toBe(true);
    // But no swipe back, which used to orphan a pending match.
    expect(mockScreenOptions).toHaveBeenLastCalledWith(expect.objectContaining({ gestureEnabled: false }));
  });

  it("result and confirm stay guarded with no 'leave and confirm later' exit (jits-02vo.7)", async () => {
    render(<ArenaMatchScreen />);
    await waitFor(() => expect(mockOnStepChange).toBeDefined());
    for (const step of ["result", "confirm"] as const) {
      act(() => {
        mockOnStepChange?.(step);
      });
      expect(mockUsePreventRemove.mock.calls.at(-1)?.[0]).toBe(true);
    }
    expect(mockWizardProps.mock.calls.at(-1)?.[0]).not.toHaveProperty("onLeaveMatch");
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("drops the app header once a step is up (the steps carry their own chrome)", async () => {
    const screen = render(<ArenaMatchScreen />);
    expect(screen.queryByTestId("app-header")).toBeTruthy();
    await waitFor(() => expect(mockOnStepChange).toBeDefined());
    act(() => {
      mockOnStepChange?.("weight");
    });
    expect(screen.queryByTestId("app-header")).toBeNull();
  });

  it("uses the pushed-screen AppHeader, whose live dot has nothing to tap (never the interactive chip)", () => {
    render(<ArenaMatchScreen />);
    expect(mockHeaderProps).toHaveBeenCalledWith(expect.objectContaining({ title: "Match" }));
    expect(mockHeaderProps).not.toHaveBeenCalledWith(
      expect.objectContaining({ rightAction: expect.anything() }),
    );
  });
});
