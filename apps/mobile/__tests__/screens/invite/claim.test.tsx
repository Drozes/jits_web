/**
 * The invitee's claim screen (jr_be spec 016, AC3.3 and contract 7): a link
 * opened on an account older than the capture waits for "Signed in as" to be
 * confirmed, "Not you?" signs out keeping the pending invite and goes back to
 * the launch router, a new account runs at once, a wrong code goes back to
 * code entry, and a booked claim with location off says so.
 *
 * Source: apps/mobile/app/(app)/invite/claim.tsx
 */
import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PENDING_INVITE_KEY, makePendingInvite } from "@/lib/invites/pending-invite";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  Redirect: () => null,
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textSecondary: "#999" }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/arena/arena-store", () => ({ isInArenaMatch: () => false }));

const mockSignOut = jest.fn(() => Promise.resolve());
const mockRefreshSoft = jest.fn(() => Promise.resolve());
const mockAuth = {
  user: { id: "u1", created_at: "2026-01-01T00:00:00Z" },
  athlete: { id: "me", status: "active", display_name: "Sam K" },
};
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ ...mockAuth, signOut: mockSignOut, refreshAthleteSoft: mockRefreshSoft }),
}));
// The native date picker cannot be driven in Jest: a press picks an adult date.
jest.mock("@/components/profile-setup/date-of-birth-picker", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    DateOfBirthPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
      <Pressable testID="dob-picker" onPress={() => onChange("1990-05-01")}>
        <Text>{value || "Select your date of birth"}</Text>
      </Pressable>
    ),
  };
});

const mockReading = jest.fn();
jest.mock("@/lib/invites/location", () => ({ readLocationOnce: (...a: unknown[]) => mockReading(...a) }));
const mockClaim = jest.fn();
const mockJoin = jest.fn();
const mockSetDob = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  setMyDateOfBirth: (...a: unknown[]) => mockSetDob(...a),
  claimChallengeInvite: (...a: unknown[]) => mockClaim(...a),
  acceptJoinInvite: (...a: unknown[]) => mockJoin(...a),
  logInviteEvent: jest.fn(() => Promise.resolve({ ok: true, data: { logged: true } })),
}));

import InviteClaimScreen from "@/app/(app)/invite/claim";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";
const inviter = { athlete_id: "a1", first_name: "Alex", display_name: "Alex R" };

async function withPending(input: { token?: string; code?: string }, gateway: "universal_link" | "code") {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(makePendingInvite(input, gateway)));
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAuth.user.created_at = "2026-01-01T00:00:00Z";
  mockJoin.mockResolvedValue({ ok: true, data: { ok: false, code: "invalid" } });
  mockReading.mockResolvedValue({ status: "ok", reading: { lat: 1, lng: 2, accuracyM: 10 } });
});

it("an existing account must confirm before anything is claimed", async () => {
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteClaimScreen />);
  expect(await screen.findByTestId("claim-confirm")).toBeTruthy();
  expect(screen.getByText(/Signed in as Sam K/)).toBeTruthy();
  expect(mockJoin).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockReading).not.toHaveBeenCalled();
});

it("'Not you?' signs out, keeps the pending invite and returns to the launch router", async () => {
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteClaimScreen />);
  await screen.findByTestId("claim-confirm");
  fireEvent.press(screen.getByText("Sign out"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(mockSignOut).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).not.toBeNull();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockJoin).not.toHaveBeenCalled();
});

it("'Not now' drops the pending invite and goes to the Arena without claiming", async () => {
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteClaimScreen />);
  await screen.findByTestId("claim-confirm");
  fireEvent.press(screen.getByText("Not now"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/arena"));
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockClaim).not.toHaveBeenCalled();
  expect(mockJoin).not.toHaveBeenCalled();
});

it("Continue runs the invite: a join link makes friends without a location read", async () => {
  mockJoin.mockResolvedValue({ ok: true, data: { ok: true, result: "friends", inviter } });
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteClaimScreen />);
  fireEvent.press(await screen.findByText("Continue"));
  expect(await screen.findByText("You and Alex are now friends.")).toBeTruthy();
  expect(mockReading).not.toHaveBeenCalled();
});

it("an account created after the capture runs at once", async () => {
  mockAuth.user.created_at = new Date(Date.now() + 60_000).toISOString();
  mockClaim.mockResolvedValue({
    ok: true,
    data: { ok: true, result: "started", challenge_id: "c1", match_id: "m1", inviter, start_blocked_reason: null },
  });
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteClaimScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("m1")));
  expect(screen.queryByTestId("claim-confirm")).toBeNull();
});

it("a wrong code goes back to code entry with the copy", async () => {
  mockClaim.mockResolvedValue({ ok: true, data: { ok: false, code: "invalid", inviter: null, attempts_left: 3 } });
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteClaimScreen />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/invite-code", params: { msg: "That code didn't match. 3 tries left." } }),
    ),
  );
  expect(mockJoin).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});

it("a throttled code carries the countdown to code entry", async () => {
  mockClaim.mockResolvedValue({ ok: true, data: { ok: false, code: "throttled", inviter: null, retry_after_s: 120 } });
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteClaimScreen />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/invite-code", params: expect.objectContaining({ until: expect.any(String) }) }),
    ),
  );
});

it("a booked claim with location off shows the booking and the location state", async () => {
  mockReading.mockResolvedValue({ status: "denied", canAskAgain: false });
  mockClaim.mockResolvedValue({
    ok: true,
    data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "no_location" },
  });
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteClaimScreen />);
  expect(await screen.findByTestId("claim-booked")).toBeTruthy();
  expect(screen.getByTestId("claim-location-off")).toBeTruthy();
});

it("dob_required asks for the date of birth, saves it and claims again to the booking", async () => {
  await withPending({ code: "K7Q4M2" }, "code");
  mockClaim
    .mockResolvedValueOnce({ ok: true, data: { ok: false, code: "dob_required", inviter } })
    .mockResolvedValueOnce({
      ok: true,
      data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "far" },
    });
  mockSetDob.mockResolvedValue({ ok: true, data: { date_of_birth: "1990-05-01" } });
  render(<InviteClaimScreen />);
  expect(await screen.findByTestId("claim-dob")).toBeTruthy();
  expect(screen.getByText("Confirm your date of birth")).toBeTruthy();
  expect(screen.queryByText(/16 or older to compete/)).toBeNull();
  fireEvent.press(screen.getByTestId("dob-picker"));
  fireEvent.press(screen.getByTestId("claim-dob-save"));
  expect(await screen.findByTestId("claim-booked")).toBeTruthy();
  expect(mockSetDob).toHaveBeenCalledWith(expect.anything(), "me", "1990-05-01");
  expect(mockRefreshSoft).toHaveBeenCalled();
  expect(mockClaim).toHaveBeenCalledTimes(2);
});

it("dob_required: a failed save keeps the step with an error", async () => {
  await withPending({ code: "K7Q4M2" }, "code");
  mockClaim.mockResolvedValueOnce({ ok: true, data: { ok: false, code: "dob_required", inviter } });
  mockSetDob.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "offline" } });
  render(<InviteClaimScreen />);
  await screen.findByTestId("claim-dob");
  fireEvent.press(screen.getByTestId("dob-picker"));
  fireEvent.press(screen.getByTestId("claim-dob-save"));
  expect(await screen.findByTestId("claim-dob-error")).toBeTruthy();
  expect(screen.getByText("Couldn't save your date of birth. Check your connection and try again.")).toBeTruthy();
  expect(mockClaim).toHaveBeenCalledTimes(1);
});

it("dob_required: the picked date survives a failed save, so Save works again without re-picking", async () => {
  await withPending({ code: "K7Q4M2" }, "code");
  mockClaim
    .mockResolvedValueOnce({ ok: true, data: { ok: false, code: "dob_required", inviter } })
    .mockResolvedValueOnce({
      ok: true,
      data: { ok: true, result: "booked", challenge_id: "c1", match_id: null, inviter, start_blocked_reason: "far" },
    });
  let failSave: (v: unknown) => void = () => {};
  mockSetDob
    .mockImplementationOnce(() => new Promise((resolve) => (failSave = resolve)))
    .mockResolvedValueOnce({ ok: true, data: { date_of_birth: "1990-05-01" } });
  render(<InviteClaimScreen />);
  await screen.findByTestId("claim-dob");
  fireEvent.press(screen.getByTestId("dob-picker"));
  fireEvent.press(screen.getByTestId("claim-dob-save"));
  // While saving: the step stays on screen with the date, Save busy and disabled.
  await waitFor(() => expect(screen.getByText("Saving...")).toBeTruthy());
  expect(screen.getByTestId("claim-dob")).toBeTruthy();
  expect(screen.getByText("1990-05-01")).toBeTruthy();
  expect(screen.getByTestId("claim-dob-save").props.accessibilityState).toMatchObject({ disabled: true });
  failSave({ ok: false, error: { hint: "unknown", message: "offline" } });
  expect(await screen.findByTestId("claim-dob-error")).toBeTruthy();
  // The date is still picked and Save is enabled: re-submit without touching the picker.
  expect(screen.getByText("1990-05-01")).toBeTruthy();
  expect(screen.getByTestId("claim-dob-save").props.accessibilityState).toMatchObject({ disabled: false });
  fireEvent.press(screen.getByTestId("claim-dob-save"));
  expect(await screen.findByTestId("claim-booked")).toBeTruthy();
  expect(mockSetDob).toHaveBeenCalledTimes(2);
  expect(mockSetDob).toHaveBeenLastCalledWith(expect.anything(), "me", "1990-05-01");
  expect(mockClaim).toHaveBeenCalledTimes(2);
});
