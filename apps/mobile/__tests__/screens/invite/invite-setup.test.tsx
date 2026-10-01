/**
 * One-screen invite setup (jr_be spec 016, AC2.4 and AC2.5): attribution runs
 * once per pending invite (a code attribution counts against the throttle),
 * a wrong or throttled code goes back to code entry before setup, the waiver
 * and the 16+ rule gate saving, an active athlete is sent on, and the banner
 * reads as setup copy (the account already exists).
 *
 * Source: apps/mobile/app/invite-setup.tsx
 */
import * as React from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PENDING_INVITE_KEY, makePendingInvite } from "@/lib/invites/pending-invite";

const mockReplace = jest.fn();
jest.mock("expo-router", () => {
  const RN = require("react-native");
  const R = require("react");
  return {
    useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
    Redirect: ({ href }: { href: string }) => R.createElement(RN.Text, null, `redirect:${href}`),
  };
});
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textSecondary: "#999" }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockAuth: { user: { id: string; user_metadata: Record<string, unknown> } | null; athlete: { status: string } | null } = {
  user: { id: "u1", user_metadata: {} },
  athlete: null,
};
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ ...mockAuth, signOut: jest.fn() }) }));

const mockValues = { dob: "1990-01-01" };
jest.mock("@/lib/profile-setup/use-setup-data", () => ({
  useSetupData: () => ({
    data: {
      athlete: { id: "a1", first_name: "Sam", last_name: "K", current_weight: 170, gender: "male", date_of_birth: mockValues.dob, city: null },
      waiverId: "w1",
    },
    error: null,
    reload: jest.fn(),
  }),
}));
const mockSubmit = jest.fn();
jest.mock("@/lib/profile-setup/use-setup-submit", () => ({
  useSetupSubmit: () => ({ loading: false, error: null, submit: mockSubmit }),
}));
jest.mock("@/components/profile-setup/identity-step", () => {
  const RN = require("react-native");
  const R = require("react");
  return {
    IdentityStep: ({ onNext }: { onNext: () => void }) =>
      R.createElement(RN.Pressable, { onPress: onNext, testID: "identity-next" }, R.createElement(RN.Text, null, "Next")),
  };
});

const mockAttribution = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  recordInviteAttribution: (...a: unknown[]) => mockAttribution(...a),
}));

import InviteSetupScreen from "@/app/invite-setup";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAuth.user = { id: "u1", user_metadata: {} };
  mockAuth.athlete = null;
  mockValues.dob = "1990-01-01";
  mockAttribution.mockResolvedValue({ ok: true, data: { ok: true, result: "attributed" } });
});

async function withPending(input: { token?: string; code?: string }, gateway: "universal_link" | "code") {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(makePendingInvite(input, gateway)));
}

it("attributes once, even when the user object changes identity (token refresh)", async () => {
  await withPending({ token: TOKEN }, "universal_link");
  const view = render(<InviteSetupScreen />);
  await waitFor(() => expect(mockAttribution).toHaveBeenCalledTimes(1));
  mockAuth.user = { id: "u1", user_metadata: {} };
  view.rerender(<InviteSetupScreen />);
  await screen.findByTestId("invite-setup-banner");
  expect(mockAttribution).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Finish your profile and we'll open your invite.")).toBeTruthy();
});

it("a wrong code goes back to code entry before setup", async () => {
  mockAttribution.mockResolvedValue({ ok: true, data: { ok: true, result: "invalid" } });
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteSetupScreen />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/invite-code",
      params: { msg: "That code didn't match. Check it and try again." },
    }),
  );
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});

it("a throttled code carries the countdown", async () => {
  mockAttribution.mockResolvedValue({ ok: true, data: { ok: false, code: "throttled", retry_after_s: 300 } });
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteSetupScreen />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/invite-code",
        params: expect.objectContaining({ msg: "Too many tries. Try again in 5 minutes.", until: expect.any(String) }),
      }),
    ),
  );
});

it("a valid code shows the challenge setup banner and stays", async () => {
  await withPending({ code: "K7Q4M2" }, "code");
  render(<InviteSetupScreen />);
  expect(await screen.findByText("Finish your profile to accept the challenge.")).toBeTruthy();
  await waitFor(() => expect(mockAttribution).toHaveBeenCalled());
  expect(mockReplace).not.toHaveBeenCalled();
});

it("saving waits for the waiver", async () => {
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteSetupScreen />);
  fireEvent.press(await screen.findByTestId("identity-next"));
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("invite-setup-waiver"));
  fireEvent.press(screen.getByTestId("identity-next"));
  expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Sam" }));
});

it("blocks an athlete under 16", async () => {
  const d = new Date();
  mockValues.dob = `${d.getFullYear() - 15}-01-01`;
  await withPending({ token: TOKEN }, "universal_link");
  render(<InviteSetupScreen />);
  expect(await screen.findByTestId("invite-setup-underage")).toBeTruthy();
  fireEvent.press(screen.getByTestId("invite-setup-waiver"));
  fireEvent.press(screen.getByTestId("identity-next"));
  expect(mockSubmit).not.toHaveBeenCalled();
});

it("an active athlete is sent on to the launch router", async () => {
  mockAuth.athlete = { status: "active" };
  render(<InviteSetupScreen />);
  expect(screen.getByText("redirect:/")).toBeTruthy();
});

