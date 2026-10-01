/**
 * The inviter screen (jr_be spec 016, AC1.2 to AC1.6): phase rendering, the
 * open-challenges list behind `too_many_open_invites`, revoke failures with
 * copy, the stale-code state, the started fallback while already in a match,
 * and the leave prompt for an unshared invite.
 *
 * Source: apps/mobile/app/(app)/invite/index.tsx
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
type Listener = (e: { preventDefault: () => void; data: { action: unknown } }) => void;
const mockListeners: Record<string, Listener> = {};
const mockDispatch = jest.fn();
// match_location_required: on (these suites were written for it) unless a test turns it off.
let mockLocationRequired = true;
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  useMatchLocationFlag: () => ({ required: mockLocationRequired, known: true }),
  readMatchLocationRequired: () => Promise.resolve(mockLocationRequired),
  markMatchLocationRequired: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ from: "arena" }),
  useNavigation: () => ({
    addListener: (name: string, l: Listener) => {
      mockListeners[name] = l;
      return () => undefined;
    },
    dispatch: mockDispatch,
  }),
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textSecondary: "#999" }) }));
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me", first_name: "Alex" } }) }));
jest.mock("@/components/invite/invite-qr", () => ({ InviteQr: () => null }));
jest.mock("@/components/invite/share-row", () => {
  const RN = require("react-native");
  const R = require("react");
  return {
    InviteShareRow: ({ onShared }: { onShared?: () => void }) =>
      R.createElement(RN.Pressable, { testID: "share", onPress: onShared }, R.createElement(RN.Text, null, "Share")),
  };
});
jest.mock("@/components/invite/open-challenges", () => {
  const RN = require("react-native");
  const R = require("react");
  return { OpenChallenges: ({ title }: { title?: string }) => R.createElement(RN.Text, { testID: "open-challenges" }, title ?? "open") };
});
const mockInMatch = { value: false };
jest.mock("@/lib/arena/arena-store", () => ({ isInArenaMatch: () => mockInMatch.value }));

const mockHook = {
  invite: null as null | Record<string, string>,
  phase: { kind: "creating" } as Record<string, unknown>,
  locationDenied: false,
  codeStale: false,
  revoke: jest.fn(),
  retry: jest.fn(),
  keepOpen: jest.fn(),
  wouldWithdrawOnLeave: jest.fn(() => true),
  start: jest.fn(),
};
jest.mock("@/lib/invites/use-challenge-invite", () => ({ useChallengeInvite: () => mockHook }));

import InviteScreen from "@/app/(app)/invite/index";

const INVITE = {
  invite_id: "i1",
  url: "https://elorated.com/c/t",
  short_code: "K7Q4M2",
  short_code_display: "K7Q-4M2",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInMatch.value = false;
  mockHook.invite = INVITE;
  mockHook.phase = { kind: "open" };
  mockHook.codeStale = false;
  mockHook.wouldWithdrawOnLeave.mockReturnValue(true);
  mockLocationRequired = true;
});

it("too_many_open_invites lists the open challenges so one can be withdrawn", () => {
  mockHook.invite = null;
  mockHook.phase = { kind: "error", hint: "too_many_open_invites", message: "You have 5 open challenges. Revoke one to send another." };
  render(<InviteScreen />);
  expect(screen.getByTestId("invite-error")).toBeTruthy();
  expect(screen.getByTestId("open-challenges")).toBeTruthy();
});

it("other errors do not show the list", () => {
  mockHook.invite = null;
  mockHook.phase = { kind: "error", hint: "daily_invite_limit", message: "x" };
  render(<InviteScreen />);
  expect(screen.queryByTestId("open-challenges")).toBeNull();
});

it("an open invite shows the code, the other open challenges and Withdraw", () => {
  render(<InviteScreen />);
  expect(screen.getByTestId("invite-code")).toHaveTextContent("K7Q-4M2");
  expect(screen.getByText("Your other open challenges")).toBeTruthy();
  expect(screen.getByText("Withdraw challenge")).toBeTruthy();
});

it("a stale code is marked", () => {
  mockHook.codeStale = true;
  render(<InviteScreen />);
  expect(screen.getByTestId("invite-code-stale")).toBeTruthy();
});

it("sharing keeps the invite open", () => {
  render(<InviteScreen />);
  fireEvent.press(screen.getByTestId("share"));
  expect(mockHook.keepOpen).toHaveBeenCalled();
});

it("a failed withdraw says why", async () => {
  const alert = jest.spyOn(Alert, "alert");
  mockHook.revoke.mockResolvedValue({ ok: false, hint: "unknown", message: "Couldn't withdraw the challenge. Check your connection and try again." });
  render(<InviteScreen />);
  fireEvent.press(screen.getByText("Withdraw challenge"));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await act(async () => {
    await buttons.find((b) => b.text === "Withdraw")?.onPress?.();
  });
  expect(alert).toHaveBeenLastCalledWith("Couldn't withdraw", "Couldn't withdraw the challenge. Check your connection and try again.");
});

it("leaving an unshared open invite asks; Keep open keeps it", () => {
  const alert = jest.spyOn(Alert, "alert");
  render(<InviteScreen />);
  const preventDefault = jest.fn();
  mockListeners.beforeRemove({ preventDefault, data: { action: { type: "GO_BACK" } } });
  expect(preventDefault).toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === "Keep open")?.onPress?.();
  expect(mockHook.keepOpen).toHaveBeenCalled();
  expect(mockDispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
});

it("leaving a shared or claimed invite does not ask", () => {
  mockHook.wouldWithdrawOnLeave.mockReturnValue(false);
  const alert = jest.spyOn(Alert, "alert");
  render(<InviteScreen />);
  const preventDefault = jest.fn();
  mockListeners.beforeRemove({ preventDefault, data: { action: {} } });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

it("started routes to the face-off", () => {
  mockHook.phase = { kind: "started", matchId: "m1" };
  render(<InviteScreen />);
  expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("m1"));
});

it("started while already in a match shows a ready card instead of an empty screen", () => {
  mockInMatch.value = true;
  mockHook.phase = { kind: "started", matchId: "m1" };
  render(<InviteScreen />);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByTestId("invite-started")).toBeTruthy();
});

it("claimed shows the claimer's name once known", () => {
  mockHook.phase = { kind: "claimed", claimerName: "Sam" };
  render(<InviteScreen />);
  expect(screen.getByText("Waiting for Sam...")).toBeTruthy();
});

it("booked shows the booking with the Arena link", () => {
  mockHook.phase = { kind: "booked", challengeId: "c1", opponentName: "Sam" };
  render(<InviteScreen />);
  expect(screen.getByTestId("invite-booked")).toBeTruthy();
  expect(screen.getByText("You're booked: Alex vs Sam")).toBeTruthy();
});

describe("booked, match_location_required", () => {
  const BOOKED = { kind: "booked", challengeId: "c1", opponentName: "Sam" };

  it("flag on: the proximity copy and no Start match", () => {
    mockHook.phase = BOOKED;
    render(<InviteScreen />);
    expect(screen.getByText("You're booked. The match starts when you're both on the mat.")).toBeTruthy();
    expect(screen.queryByText("Start match")).toBeNull();
  });

  it("flag off: Start match (secondary) starts the booking", () => {
    mockLocationRequired = false;
    mockHook.phase = BOOKED;
    render(<InviteScreen />);
    expect(screen.getByText("You're booked. Tap Start match when you're both on the mat.")).toBeTruthy();
    fireEvent.press(screen.getByText("Start match"));
    expect(mockHook.start).toHaveBeenCalled();
    // Red stays the one CTA on the plate.
    expect(screen.getByText("Go to the Arena")).toBeTruthy();
  });

  it("flag off: a refused start says why", () => {
    mockLocationRequired = false;
    mockHook.phase = { ...BOOKED, startError: "Sam is mid-match. We'll hold your spot." };
    render(<InviteScreen />);
    expect(screen.getByTestId("invite-start-error")).toHaveTextContent("Sam is mid-match. We'll hold your spot.");
  });

  it("flag off: Start match is disabled while starting", () => {
    mockLocationRequired = false;
    mockHook.phase = { ...BOOKED, starting: true };
    render(<InviteScreen />);
    fireEvent.press(screen.getByText("Starting..."));
    expect(mockHook.start).not.toHaveBeenCalled();
  });

  it("a cancelled booking says so", () => {
    mockHook.phase = { kind: "closed" };
    render(<InviteScreen />);
    expect(screen.getByTestId("invite-booking-closed")).toHaveTextContent(/^This booking was cancelled\./);
  });
});
