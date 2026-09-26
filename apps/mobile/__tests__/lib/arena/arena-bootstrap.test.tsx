/**
 * The single app-wide Arena owner.
 *
 * Being live persists across tabs and a challenge must reach a live athlete
 * on ANY screen, so the live writer, the lobby channel, the challenge
 * listener and its prompt are mounted here exactly once, beside the Stack,
 * and published to the store the rest of the app reads.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef(
      (props: { children: React.ReactNode }, ref: unknown) => {
        R.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
        return R.createElement(RN.View, {}, props.children);
      },
    ),
    BottomSheetView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

let mockAthlete: Record<string, unknown> | null = null;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete }),
}));

const mockUseLobbyPresence = jest.fn();
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: (...a: unknown[]) => mockUseLobbyPresence(...a),
  useLobbyIds: () => new Set<string>(),
}));

const mockToggle = jest.fn().mockResolvedValue(undefined);
const mockGoOffline = jest.fn().mockResolvedValue(true);
const mockUseArenaLive = jest.fn();
let mockIsLive = false;
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: (args: unknown) => {
    mockUseArenaLive(args);
    return {
      isLive: mockIsLive,
      isSaving: false,
      toggle: mockToggle,
      goOffline: mockGoOffline,
    };
  },
}));

const mockAccept = jest.fn();
const mockDecline = jest.fn();
const mockUseArenaChallenge = jest.fn();
let mockIncoming: unknown = null;
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: (args: unknown) => {
    mockUseArenaChallenge(args);
    return {
      incoming: mockIncoming,
      outgoing: null,
      isBusy: false,
      capReached: false,
      sendChallenge: jest.fn(),
      accept: mockAccept,
      decline: mockDecline,
      cancelOutgoing: jest.fn(),
      clearCap: jest.fn(),
      offerIncoming: jest.fn(),
      restoreOutgoing: jest.fn(),
    };
  },
}));

const mockRecovery = jest.fn();
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  usePendingChallengeRecovery: (args: unknown) => mockRecovery(args),
}));

import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { renderHook } from "@testing-library/react-native";
import {
  __resetArenaStoreForTests,
  useArenaMatchScreen,
  arenaActions,
  notifyOpponentUnavailable,
  useArenaState,
} from "@/lib/arena/arena-store";

const ACTIVE = {
  id: "me-1",
  display_name: "Me",
  current_elo: 1200,
  current_weight: 180,
  looking_for_ranked: true,
  status: "active",
};

const RIVAL = {
  challengeId: "ch-1",
  challengerId: "a-9",
  challengerName: "Rival",
  challengerElo: 1350,
  challengerWeight: 190,
};

/** Reads the store the way a header or the Arena screen would. */
function StoreProbe({ onState }: { onState: (s: unknown) => void }) {
  onState(useArenaState());
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  mockAthlete = { ...ACTIVE };
  mockIsLive = false;
  mockIncoming = null;
});

describe("ArenaBootstrap", () => {
  it("mounts the live writer, lobby channel, challenge listener and recovery for the athlete", () => {
    render(<ArenaBootstrap />);

    expect(mockUseLobbyPresence).toHaveBeenCalledWith("me-1");
    expect(mockUseArenaLive).toHaveBeenLastCalledWith({
      athleteId: "me-1",
      displayName: "Me",
      currentElo: 1200,
      initialRanked: true,
      inMatch: false,
    });
    expect(mockUseArenaChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({ athleteId: "me-1", athleteWeight: 180, isLive: false }),
    );
    expect(mockRecovery).toHaveBeenLastCalledWith(
      expect.objectContaining({ athleteId: "me-1", isLive: false, hasIncoming: false }),
    );
  });

  it("owns nothing for a signed-out or not-yet-active athlete", () => {
    mockAthlete = null;
    const { rerender } = render(<ArenaBootstrap />);
    mockAthlete = { ...ACTIVE, status: "pending" };
    rerender(<ArenaBootstrap />);

    expect(mockUseArenaLive).not.toHaveBeenCalled();
    expect(mockUseLobbyPresence).not.toHaveBeenCalled();
    expect(mockUseArenaChallenge).not.toHaveBeenCalled();
  });

  it("raises the challenge prompt app-wide, with both answers wired", () => {
    // Rendered beside the Stack, not inside the Arena screen: a live athlete
    // on Home or Rankings gets the same prompt.
    mockIncoming = RIVAL;
    const { getByText, getByLabelText } = render(<ArenaBootstrap />);

    expect(getByText("Rival wants to roll")).toBeTruthy();
    expect(getByText("ELO 1350 · 190 lbs")).toBeTruthy();

    fireEvent.press(getByLabelText("Accept challenge"));
    expect(mockAccept).toHaveBeenCalled();
    fireEvent.press(getByLabelText("Decline challenge"));
    expect(mockDecline).toHaveBeenCalled();
  });

  it("publishes live and challenge state to the store", () => {
    mockIsLive = true;
    mockIncoming = RIVAL;
    const seen: unknown[] = [];
    render(
      <>
        <ArenaBootstrap />
        <StoreProbe onState={(s) => seen.push(s)} />
      </>,
    );

    expect(seen[seen.length - 1]).toMatchObject({ isLive: true, incoming: RIVAL });
  });

  it("routes the app's actions to its hooks while mounted, and resets on unmount", async () => {
    mockIsLive = true;
    const seen: { isLive: boolean }[] = [];
    const Probe = () => <StoreProbe onState={(s) => seen.push(s as { isLive: boolean })} />;
    const { rerender } = render(
      <>
        <ArenaBootstrap />
        <Probe />
      </>,
    );

    await act(async () => {
      await arenaActions.toggle();
      await arenaActions.goOffline();
    });
    expect(mockToggle).toHaveBeenCalled();
    expect(mockGoOffline).toHaveBeenCalled();

    // Sign-out: the athlete goes away and the owner unmounts.
    mockAthlete = null;
    rerender(
      <>
        <ArenaBootstrap />
        <Probe />
      </>,
    );
    expect(seen[seen.length - 1].isLive).toBe(false);

    mockToggle.mockClear();
    await act(async () => {
      await arenaActions.toggle();
    });
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it("passes the in-match bit to every hook and holds the prompt back mid-match", () => {
    mockIncoming = RIVAL;
    const { queryByText, getByText } = render(<ArenaBootstrap />);
    expect(getByText("Rival wants to roll")).toBeTruthy();

    const match = renderHook(() => useArenaMatchScreen());

    expect(mockUseArenaLive).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(mockUseArenaChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(mockRecovery).toHaveBeenLastCalledWith(
      expect.objectContaining({ inMatch: true }),
    );
    expect(queryByText("Rival wants to roll")).toBeNull();

    // Still pending after the match: it comes back.
    match.unmount();
    expect(getByText("Rival wants to roll")).toBeTruthy();
  });

  it("hands roster corrections through the store", () => {
    render(<ArenaBootstrap />);
    const args = mockUseArenaChallenge.mock.calls[0][0];

    expect(args.onOpponentUnavailable).toBe(notifyOpponentUnavailable);
  });
});
