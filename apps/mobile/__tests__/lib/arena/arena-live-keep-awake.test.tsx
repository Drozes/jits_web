/**
 * A live athlete's screen stays awake.
 *
 * Auto-lock backgrounds the app and backgrounding takes the athlete out of
 * the lobby, so a phone left on the table silently stops being challengeable.
 * ArenaBootstrap holds an `arena-live` wake-lock while live and not in a
 * match (the match live step holds its own), and releases it on going
 * offline, entering a match, or unmounting.
 */
import * as React from "react";
import { act, render, renderHook } from "@testing-library/react-native";

const mockActivate = jest.fn((_tag: string) => Promise.resolve());
const mockDeactivate = jest.fn((_tag: string) => Promise.resolve());
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag: string) => mockActivate(tag),
  deactivateKeepAwake: (tag: string) => mockDeactivate(tag),
}));

jest.mock("@/components/arena/challenge-prompt-sheet", () => ({
  ChallengePromptSheet: () => null,
}));

let mockAthlete: Record<string, unknown> | null = null;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete, refreshAthleteSoft: () => Promise.resolve() }),
}));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: () => {},
  useLobbyIds: () => new Set<string>(),
}));
let mockIsLive = false;
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: () => ({ isLive: mockIsLive, isSaving: false, toggle: jest.fn(), goOffline: jest.fn() }),
}));
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: () => ({
    incoming: null,
    outgoing: null,
    isBusy: false,
    capReached: false,
    sendChallenge: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    cancelOutgoing: jest.fn(),
    clearCap: jest.fn(),
    offerIncoming: jest.fn(),
    restoreOutgoing: jest.fn(),
  }),
}));
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  usePendingChallengeRecovery: () => {},
}));

import { ArenaBootstrap } from "@/lib/arena/arena-bootstrap";
import { __resetArenaStoreForTests, useArenaMatchScreen } from "@/lib/arena/arena-store";

const ACTIVE = { id: "me-1", display_name: "Me", current_elo: 1200, current_weight: 180, status: "active" };
const TAG = "arena-live";

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  mockAthlete = { ...ACTIVE };
  mockIsLive = false;
});

describe("ArenaBootstrap keep-awake", () => {
  it("holds no wake-lock while offline", () => {
    render(<ArenaBootstrap />);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("holds the wake-lock while live and releases it on going offline", () => {
    mockIsLive = true;
    const r = render(<ArenaBootstrap />);
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockActivate).toHaveBeenCalledWith(TAG);

    mockIsLive = false;
    r.rerender(<ArenaBootstrap />);
    expect(mockDeactivate).toHaveBeenCalledWith(TAG);
  });

  it("releases it when a match starts (the live step owns that lock)", () => {
    mockIsLive = true;
    render(<ArenaBootstrap />);
    expect(mockActivate).toHaveBeenCalledTimes(1);

    renderHook(() => useArenaMatchScreen());
    expect(mockDeactivate).toHaveBeenCalledWith(TAG);
  });

  it("releases it on sign-out (the owner unmounts)", () => {
    mockIsLive = true;
    const r = render(<ArenaBootstrap />);
    mockAthlete = null;
    r.rerender(<ArenaBootstrap />);
    expect(mockDeactivate).toHaveBeenCalledWith(TAG);
  });

  it("never holds it for a pending athlete", () => {
    mockIsLive = true;
    mockAthlete = { ...ACTIVE, status: "pending" };
    render(<ArenaBootstrap />);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("survives a wake-lock that fails to activate", async () => {
    mockActivate.mockReturnValueOnce(Promise.reject(new Error("unsupported")));
    mockIsLive = true;
    render(<ArenaBootstrap />);
    await act(async () => {});
    expect(mockActivate).toHaveBeenCalledTimes(1);
  });
});
