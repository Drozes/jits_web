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

describe("Settings delete account row", () => {
  it("links to /settings/delete-account from the account plate", () => {
    const s = render(<SettingsScreen />);
    expect(s.getByText("DELETE ACCOUNT")).toBeTruthy();
    expect(s.getByTestId("link-/settings/delete-account")).toBeTruthy();
  });
});

describe("Settings legal rows", () => {
  it("opens the Terms of Service and the Privacy Policy in the legal modal (jits-rog5.8)", () => {
    const s = render(<SettingsScreen />);
    expect(s.getByText("TERMS OF SERVICE")).toBeTruthy();
    expect(s.getByText("PRIVACY POLICY")).toBeTruthy();
    expect(s.getByTestId("link-/legal/terms")).toBeTruthy();
    expect(s.getByTestId("link-/legal/privacy")).toBeTruthy();
  });
});

describe("Settings report, block and AI consent rows (jits-rog5.11)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { __resetAiConsentForTests } = require("@/lib/moderation/ai-consent") as typeof import("@/lib/moderation/ai-consent");
  afterEach(() => __resetAiConsentForTests());

  it("links to Blocked athletes", () => {
    const s = render(<SettingsScreen />);
    expect(s.getByText("BLOCKED ATHLETES")).toBeTruthy();
    expect(s.getByTestId("link-/settings/blocked")).toBeTruthy();
  });

  it("shows AI processing as not given before consent", () => {
    __resetAiConsentForTests({ athleteId: "me", consentAt: null, known: true });
    const s = render(<SettingsScreen />);
    expect(s.getByText("AI PROCESSING")).toBeTruthy();
    expect(s.getByText("Not given")).toBeTruthy();
    expect(s.getByTestId("link-/settings/ai-processing")).toBeTruthy();
  });

  it("shows the date consent was given", () => {
    __resetAiConsentForTests({ athleteId: "me", consentAt: "2026-10-14T16:00:00Z", known: true });
    const s = render(<SettingsScreen />);
    expect(s.getByText("Given Oct 14, 2026")).toBeTruthy();
  });
});
