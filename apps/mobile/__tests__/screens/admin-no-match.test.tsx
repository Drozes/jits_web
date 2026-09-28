/**
 * Admin > No-match videos (jr_be-0qf): a read-only review list of videos
 * whose analysis found no match, with the match's type, result and ELO
 * changes. Admin-gated; nothing on it changes data.
 */
import * as React from "react";
import { render, waitFor, within } from "@testing-library/react-native";

let mockIsAdmin = true;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ isLoading: false }),
  useIsAdmin: () => mockIsAdmin,
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textTertiary: "#999" }) }));
jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => {
    const RN = require("react-native");
    return <RN.View>{children}</RN.View>;
  },
}));
const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  Redirect: (p: { href: string }) => {
    mockRedirect(p.href);
    return null;
  },
}));
const mockList = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  adminListNoMatchVideos: (...a: unknown[]) => mockList(...a),
}));

import AdminNoMatchVideosScreen from "@/app/(app)/settings/admin/no-match";

const ROW = {
  video_id: "vid-1",
  match_id: "m-1",
  uploaded_by: "a1",
  uploader_name: "Kai Reyes",
  video_status: "analyzed",
  video_created_at: "2026-09-28T10:00:00Z",
  analyzed_at: "2026-09-28T10:05:00Z",
  no_match_reason: "An empty office; nobody is grappling.",
  match_type: "ranked",
  match_status: "completed",
  match_result: "submission",
  match_completed_at: "2026-09-28T09:58:00Z",
  participants: [
    { athlete_id: "a1", display_name: "Kai Reyes", outcome: "win", elo_before: 1200, elo_after: 1216, elo_delta: 16 },
    { athlete_id: "a2", display_name: "Mina Park", outcome: "loss", elo_before: 1210, elo_after: 1194, elo_delta: -16 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin = true;
});

describe("AdminNoMatchVideosScreen", () => {
  it("lists each video with match type/result, uploader, ELO changes and the reason", async () => {
    mockList.mockResolvedValue({ ok: true, data: [ROW] });
    const r = render(<AdminNoMatchVideosScreen />);
    const row = await waitFor(() => r.getByTestId("no-match-row-vid-1"));
    const inRow = within(row);
    expect(inRow.getByText("ranked · completed · submission")).toBeTruthy();
    expect(inRow.getByText("Uploaded by Kai Reyes")).toBeTruthy();
    expect(inRow.getByText("Kai Reyes · win")).toBeTruthy();
    expect(inRow.getByText("Mina Park · loss")).toBeTruthy();
    expect(inRow.getByText("+16")).toBeTruthy();
    expect(inRow.getByText("-16")).toBeTruthy();
    expect(inRow.getByText("An empty office; nobody is grappling.")).toBeTruthy();
    expect(inRow.getByText(/video vid-1 · match m-1/)).toBeTruthy();
  });

  it("shows an empty state", async () => {
    mockList.mockResolvedValue({ ok: true, data: [] });
    const r = render(<AdminNoMatchVideosScreen />);
    await waitFor(() => expect(r.getByTestId("no-match-empty")).toBeTruthy());
  });

  it("shows the error with a retry", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "You need admin access to do that." } });
    const r = render(<AdminNoMatchVideosScreen />);
    await waitFor(() => expect(r.getByText("You need admin access to do that.")).toBeTruthy());
    expect(r.getByText("Retry")).toBeTruthy();
  });

  it("redirects a non-admin", () => {
    mockIsAdmin = false;
    mockList.mockResolvedValue({ ok: true, data: [] });
    render(<AdminNoMatchVideosScreen />);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
