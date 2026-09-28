/**
 * Admin > Feature flags carries the share-funnel diagnostics row (jr_be spec
 * 014 section 16.6.1): how a field build's native embedding is confirmed
 * after an OTA. Every capability must render.
 */
import * as React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockCaps = jest.fn();
jest.mock("@/lib/highlight-share", () => ({
  getShareCapabilities: () => mockCaps(),
}));
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ isLoading: false }),
  useIsAdmin: () => true,
}));
jest.mock("@/lib/admin/use-feature-flags", () => ({
  useFeatureFlags: () => ({ flags: [], isLoading: false, toggle: jest.fn() }),
}));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textTertiary: "#999" }) }));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => {
    const RN = require("react-native");
    return <RN.View>{children}</RN.View>;
  },
}));
jest.mock("expo-router", () => ({ Redirect: () => null }));

import AdminFlagsScreen from "@/app/(app)/settings/admin/flags";

const ALL = {
  reels: true,
  shareSheet: true,
  saveToPhotos: true,
  clipboard: true,
  facebookAppIdConfigured: true,
  reelsModule: true,
  instagramDetected: true,
};

describe("share diagnostics row", () => {
  it("renders every capability when present", async () => {
    mockCaps.mockResolvedValue(ALL);
    const r = render(<AdminFlagsScreen />);
    await waitFor(() =>
      expect(r.getByTestId("share-diagnostics").props.children).toBe(
        "Reels module: present · App ID: set · Instagram: installed · Share sheet: present · Photos: present · Clipboard: present",
      ),
    );
  });

  it("renders every capability when absent (a tier-1 build without the App ID)", async () => {
    mockCaps.mockResolvedValue({
      reels: false,
      shareSheet: false,
      saveToPhotos: false,
      clipboard: false,
      facebookAppIdConfigured: false,
      reelsModule: false,
      instagramDetected: false,
    });
    const r = render(<AdminFlagsScreen />);
    await waitFor(() =>
      expect(r.getByTestId("share-diagnostics").props.children).toBe(
        "Reels module: absent · App ID: unset · Instagram: not detected · Share sheet: absent · Photos: absent · Clipboard: absent",
      ),
    );
  });

  it("says 'not checked' for Instagram on Android", async () => {
    mockCaps.mockResolvedValue({ ...ALL, instagramDetected: null });
    const r = render(<AdminFlagsScreen />);
    await waitFor(() =>
      expect(r.getByTestId("share-diagnostics").props.children).toContain("Instagram: not checked"),
    );
  });
});
