/**
 * Admin hub (settings/admin): lists the admin sub-screens, including REPEAT
 * DISPUTERS (jits-02vo.11), and redirects a non-admin.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

let mockIsAdmin = true;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ isLoading: false }),
  useIsAdmin: () => mockIsAdmin,
}));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => {
    const RN = require("react-native");
    return <RN.View>{children}</RN.View>;
  },
}));
const mockRedirect = jest.fn();
const mockLinkHrefs: string[] = [];
jest.mock("expo-router", () => ({
  Redirect: (p: { href: string }) => {
    mockRedirect(p.href);
    return null;
  },
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => {
    mockLinkHrefs.push(href);
    return children;
  },
}));

import AdminScreen from "@/app/(app)/settings/admin";

beforeEach(() => {
  jest.clearAllMocks();
  mockLinkHrefs.length = 0;
  mockIsAdmin = true;
});

describe("AdminScreen hub", () => {
  it("shows the REPEAT DISPUTERS row linking to the disputers screen", () => {
    const r = render(<AdminScreen />);
    expect(r.getByText("REPEAT DISPUTERS")).toBeTruthy();
    expect(r.getByText("NO-MATCH VIDEOS")).toBeTruthy();
    expect(mockLinkHrefs).toContain("/settings/admin/disputers");
  });

  it("redirects a non-admin and renders no rows", () => {
    mockIsAdmin = false;
    const r = render(<AdminScreen />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
    expect(r.queryByText("REPEAT DISPUTERS")).toBeNull();
  });
});
