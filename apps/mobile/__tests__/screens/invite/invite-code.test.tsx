/**
 * Code entry after a throttle (jr_be spec 016, contract 7): the countdown
 * shows while locked, and when it runs out the input is enabled with no
 * stale "Too many tries" message under it.
 *
 * Source: apps/mobile/app/(auth)/invite-code.tsx
 */
import * as React from "react";
import { act, render, screen } from "@testing-library/react-native";

const mockParams: { msg?: string; until?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textTertiary: "#999" }) }));

import InviteCodeScreen from "@/app/(auth)/invite-code";

const THROTTLE = "Too many tries. Try again in 1 minutes.";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("clears the throttle message once the lock runs out", () => {
  mockParams.msg = THROTTLE;
  mockParams.until = String(Date.now() + 2000);
  render(<InviteCodeScreen />);
  expect(screen.getByTestId("invite-code-throttled")).toBeTruthy();
  expect(screen.getByTestId("invite-code-input").props.editable).toBe(false);
  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.queryByTestId("invite-code-throttled")).toBeNull();
  expect(screen.queryByText(THROTTLE)).toBeNull();
  expect(screen.getByTestId("invite-code-input").props.editable).toBe(true);
});

it("a wrong-code message (no lock) stays until the athlete types", () => {
  mockParams.msg = "That code didn't work. 2 tries left.";
  mockParams.until = undefined;
  render(<InviteCodeScreen />);
  act(() => {
    jest.advanceTimersByTime(3000);
  });
  expect(screen.getByText("That code didn't work. 2 tries left.")).toBeTruthy();
});
