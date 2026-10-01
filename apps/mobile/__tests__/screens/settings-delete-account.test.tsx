/**
 * Settings > Delete account: two-step confirmation, typed DELETE gate,
 * failure copy, and sign-out + return to login on success.
 */
import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));
const mockDelete = jest.fn();
jest.mock("@/lib/account/delete-account", () => {
  const actual = jest.requireActual("@/lib/account/delete-account");
  return { ...actual, deleteAccount: (...a: unknown[]) => mockDelete(...a) };
});

import DeleteAccountScreen from "@/app/(app)/settings/delete-account";

beforeEach(() => jest.clearAllMocks());

function toConfirm() {
  const s = render(<DeleteAccountScreen />);
  expect(s.getByText("This permanently deletes your profile, matches and ELO. This can't be undone.")).toBeTruthy();
  expect(s.queryByTestId("delete-confirm-input")).toBeNull();
  fireEvent.press(s.getByTestId("delete-continue"));
  return s;
}

it("needs Continue, then the exact typed word, before deleting", async () => {
  const s = toConfirm();
  fireEvent.press(s.getByTestId("delete-submit"));
  expect(mockDelete).not.toHaveBeenCalled();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "delete");
  fireEvent.press(s.getByTestId("delete-submit"));
  expect(mockDelete).not.toHaveBeenCalled();
});

it("signs out and returns to login on success", async () => {
  mockDelete.mockResolvedValue({ ok: true });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(mockSignOut).toHaveBeenCalled();
  expect(mockToast.success).toHaveBeenCalledWith("Your account was deleted.");
});

it("keeps the account and explains a failure", async () => {
  mockDelete.mockResolvedValue({ ok: false, code: "failed" });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() =>
    expect(mockToast.error).toHaveBeenCalledWith(
      "We couldn't delete your account. Check your connection and try again.",
    ),
  );
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it("asks to sign in again when the session expired", async () => {
  mockDelete.mockResolvedValue({ ok: false, code: "not_authenticated" });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() =>
    expect(mockToast.error).toHaveBeenCalledWith("Your session expired. Sign in again, then delete your account."),
  );
});

it("Keep my account goes back", () => {
  const s = render(<DeleteAccountScreen />);
  fireEvent.press(s.getByText("Keep my account"));
  expect(mockBack).toHaveBeenCalled();
});
