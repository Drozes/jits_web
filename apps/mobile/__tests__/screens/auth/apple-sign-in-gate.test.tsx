/**
 * Sign in with Apple ships on in the 1.0 binary (jits-8s9v, guideline 4.8):
 * `APPLE_SIGN_IN_ENABLED` defaults to true, the button is on login and
 * signup, and on login it sits above Google. The flag stays an emergency
 * kill switch; `parseBooleanOverride` backs the `EXPO_PUBLIC_APPLE_SIGN_IN`
 * bundle-time override.
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

const { APPLE_SIGN_IN_ENABLED, parseBooleanOverride } = jest.requireActual("@/lib/env") as typeof import("@/lib/env");

// A mutable stand-in for the env module: the screens read the flag at render.
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  APPLE_SIGN_IN_ENABLED: true,
}));
const mockEnv = jest.requireMock("@/lib/env") as { APPLE_SIGN_IN_ENABLED: boolean };

import LoginScreen from "@/app/(auth)/login";
import SignupScreen from "@/app/(auth)/signup";

afterEach(() => {
  mockEnv.APPLE_SIGN_IN_ENABLED = true;
});

describe("APPLE_SIGN_IN_ENABLED", () => {
  it("defaults to true (no EXPO_PUBLIC_APPLE_SIGN_IN in the test bundle)", () => {
    expect(APPLE_SIGN_IN_ENABLED).toBe(true);
  });

  it.each([
    ["true", true],
    ["TRUE", true],
    [" 1 ", true],
    ["false", false],
    [" FALSE ", false],
    ["0", false],
    ["", null],
    ["yes", null],
    [undefined, null],
    [null, null],
  ])("parseBooleanOverride(%p) is %p", (raw, expected) => {
    expect(parseBooleanOverride(raw as string | undefined | null)).toBe(expected);
  });
});

describe.each<[string, React.ComponentType]>([
  ["login", LoginScreen],
  ["signup", SignupScreen],
])("%s screen", (_name, Screen) => {
  it("shows the Apple button by default", () => {
    render(<Screen />);
    expect(screen.getByTestId("apple-sign-in")).toBeTruthy();
  });

  it("hides the Apple button when the kill switch is off", () => {
    mockEnv.APPLE_SIGN_IN_ENABLED = false;
    render(<Screen />);
    expect(screen.queryByTestId("apple-sign-in")).toBeNull();
  });
});

describe("login screen order", () => {
  it("lists Apple before Google (at least as prominent, guideline 4.8)", () => {
    render(<LoginScreen />);
    const ids: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      const n = node as { props?: { testID?: string }; children?: unknown };
      if (n.props?.testID) ids.push(n.props.testID);
      walk(n.children);
    };
    walk(screen.toJSON());
    const apple = ids.indexOf("apple-sign-in");
    const google = ids.indexOf("login-google");
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(google).toBeGreaterThanOrEqual(0);
    expect(apple).toBeLessThan(google);
  });
});
