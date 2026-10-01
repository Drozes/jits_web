/**
 * Sign in with Apple is gated by the OTA-flippable `APPLE_SIGN_IN_ENABLED`
 * constant (off until the prod Supabase Apple provider is configured): the
 * button is absent from login and signup by default and present when enabled.
 * `parseBooleanFlag` backs the `EXPO_PUBLIC_APPLE_SIGN_IN` bundle-time override.
 *
 * Source: apps/mobile/lib/env.ts, app/(auth)/login.tsx, app/(auth)/signup.tsx
 */
import * as React from "react";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signInWithGoogle: jest.fn(),
  }),
}));
jest.mock("@/lib/invites/use-pending-invite", () => ({
  usePendingInvite: () => ({ invite: null, preview: null, isLoading: false }),
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/app-version-label", () => ({ AppVersionLabel: () => null }));
jest.mock("@/components/invite/invite-banner", () => ({ InviteBanner: () => null }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#999", textSecondary: "#888" }),
  useResolvedColorScheme: () => "dark",
}));
// The real button renders nothing off iOS; stand in for it so presence is observable.
jest.mock("@/components/auth/AppleSignInButton", () => {
  const { Text: RNText } = jest.requireActual("react-native");
  return {
    AppleSignInButton: ({ variant }: { variant?: string }) => (
      <RNText testID="apple-sign-in">{variant ?? "sign-in"}</RNText>
    ),
  };
});

const { APPLE_SIGN_IN_ENABLED, parseBooleanFlag } = jest.requireActual("@/lib/env") as typeof import("@/lib/env");

// A mutable stand-in for the env module: the screens read the flag at render.
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  APPLE_SIGN_IN_ENABLED: false,
}));
const mockEnv = jest.requireMock("@/lib/env") as { APPLE_SIGN_IN_ENABLED: boolean };

import LoginScreen from "@/app/(auth)/login";
import SignupScreen from "@/app/(auth)/signup";

afterEach(() => {
  mockEnv.APPLE_SIGN_IN_ENABLED = false;
});

describe("APPLE_SIGN_IN_ENABLED", () => {
  it("defaults to false (no EXPO_PUBLIC_APPLE_SIGN_IN in the test bundle)", () => {
    expect(APPLE_SIGN_IN_ENABLED).toBe(false);
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    [" 1 ", true],
    ["false", false],
    ["0", false],
    ["", false],
    ["yes", false],
    [undefined, false],
    [null, false],
  ])("parseBooleanFlag(%p) is %p", (raw, expected) => {
    expect(parseBooleanFlag(raw as string | undefined | null)).toBe(expected);
  });
});

describe.each<[string, React.ComponentType]>([
  ["login", LoginScreen],
  ["signup", SignupScreen],
])("%s screen", (_name, Screen) => {
  it("has no Apple button by default", () => {
    render(<Screen />);
    expect(screen.queryByTestId("apple-sign-in")).toBeNull();
  });

  it("shows the Apple button when enabled", () => {
    mockEnv.APPLE_SIGN_IN_ENABLED = true;
    render(<Screen />);
    expect(screen.getByTestId("apple-sign-in")).toBeTruthy();
  });
});
