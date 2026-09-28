/**
 * Settings always offers the practice match replay, whatever the onboarding
 * state (app/(app)/settings/index.tsx).
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => {
  const R = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    // Link asChild: hand the href to the child so the test can read it.
    Link: ({ href, children }: { href: string; children: React.ReactElement }) =>
      R.cloneElement(children, { testID: `link-${href}` }),
  };
});

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});

jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/error-tracking/sentry", () => ({
  isSentryEnabled: () => false,
  showFeedback: jest.fn(),
}));

const mockAthlete = { practice_match_offered_at: "2026-09-26T00:00:00Z" as string | null };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ user: { email: "a@b.c" }, signOut: jest.fn() }),
  useIsAdmin: () => false,
  useRequireAthlete: () => ({ athlete: mockAthlete }),
}));

import SettingsScreen from "@/app/(app)/settings/index";

describe("Settings practice match row", () => {
  it.each([
    ["after the offer was answered", "2026-09-26T00:00:00Z"],
    ["before it was ever offered", null],
  ])("shows PRACTICE MATCH linking to /practice %s", (_name, offeredAt) => {
    mockAthlete.practice_match_offered_at = offeredAt;
    const s = render(<SettingsScreen />);
    expect(s.getByText("PRACTICE MATCH")).toBeTruthy();
    expect(s.getByTestId("link-/practice")).toBeTruthy();
  });
});
