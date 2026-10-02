/**
 * The error boundary's recovery buttons (WP3: SC-3, A1-1, BT-4): real
 * buttons with a role, on the ELO Button (Try again primary, Sign out
 * secondary), and both still work.
 */
import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockSignOut = jest.fn(() => Promise.resolve());
jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

import { ErrorBoundary } from "@/components/error-boundary";

let mockThrow = true;
function Boom() {
  if (mockThrow) throw new Error("boom");
  return null;
}

beforeEach(() => {
  mockThrow = true;
  mockSignOut.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

it("Try again and Sign out are buttons with names, primary and secondary", () => {
  const s = render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  const retry = s.getByRole("button", { name: "Try again" });
  const signOut = s.getByRole("button", { name: "Sign out" });
  expect(String(retry.props.className)).toMatch(/(^|\s)bg-cta(\s|$)/);
  expect(String(signOut.props.className)).not.toMatch(/bg-cta/);
});

it("Try again resets the boundary", () => {
  const s = render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  mockThrow = false;
  fireEvent.press(s.getByRole("button", { name: "Try again" }));
  expect(s.queryByText("SOMETHING WENT WRONG")).toBeNull();
});

it("Sign out signs out, then resets the boundary", async () => {
  const s = render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  );
  mockThrow = false;
  fireEvent.press(s.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(s.queryByText("SOMETHING WENT WRONG")).toBeNull());
});
