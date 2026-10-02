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
  expect(s.getByText("This permanently deletes your profile, photos and ELO. Your past matches stay in your opponents' history as a deleted athlete. This can't be undone.")).toBeTruthy();
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

it("treats not_authenticated as terminal: signs out locally with neutral copy", async () => {
  mockDelete.mockResolvedValue({ ok: false, code: "not_authenticated" });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(mockSignOut).toHaveBeenCalled();
  expect(mockToast.error).toHaveBeenCalledWith("You're signed out. If your account still exists, sign in to delete it.");
  expect(mockToast.success).not.toHaveBeenCalled();
});

it("refuses during a live match and keeps the account", async () => {
  mockDelete.mockResolvedValue({ ok: false, code: "match_in_progress" });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Finish your match first. You can delete your account once it ends."));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(s.getByTestId("delete-submit")).toBeTruthy();
});

it("shows confirm copy, not the connection copy, for confirm_required", async () => {
  mockDelete.mockResolvedValue({ ok: false, code: "confirm_required" });
  const s = toConfirm();
  fireEvent.changeText(s.getByTestId("delete-confirm-input"), "DELETE");
  fireEvent.press(s.getByTestId("delete-submit"));
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Type DELETE exactly to confirm."));
  expect(mockSignOut).not.toHaveBeenCalled();
});

it("does not claim match records, weigh-ins or videos are erased", () => {
  const s = render(<DeleteAccountScreen />);
  expect(
    s.getByText(/Match records \(including weigh-ins, videos and stills\) stay with the matches they belong to, under a deleted athlete\./),
  ).toBeTruthy();
  expect(s.getByText(/the messages and chat photos you sent are erased/)).toBeTruthy();
  expect(s.getByText(/open invites/)).toBeTruthy();
});

it("uses the destructive button (an outline in negative, WP3), not the accent CTA, for the final delete", () => {
  const s = toConfirm();
  const cls = String(s.getByTestId("delete-submit").props.className ?? "");
  expect(cls).toContain("border-negative");
  expect(cls).not.toContain("bg-cta");
  expect(cls).not.toContain("bg-destructive");
});

it("Keep my account goes back", () => {
  const s = render(<DeleteAccountScreen />);
  fireEvent.press(s.getByText("Keep my account"));
  expect(mockBack).toHaveBeenCalled();
});
