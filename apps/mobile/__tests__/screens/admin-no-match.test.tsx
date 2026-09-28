/**
 * Admin > No-match videos (jr_be-0qf): a read-only review list of videos
 * whose analysis found no match, with the match's type, result and ELO
 * changes. Admin-gated; nothing on it changes data.
 */
import * as React from "react";
import { act, render, waitFor, within } from "@testing-library/react-native";

let mockIsAdmin = true;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ isLoading: false }),
  useIsAdmin: () => mockIsAdmin,
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#999" }),
  useResolvedColorScheme: () => "dark",
}));
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

/** Render and let the list read settle inside act (no stray state updates). */
async function renderScreen() {
  const r = render(<AdminNoMatchVideosScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  return r;
}

const ROW = {
  key: "vid-1",
  verdict_id: null,
  superseded: null,
  current_match_detected: null,
  verdict_count: null,
  no_match_count: null,
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
    const r = await renderScreen();
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
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("no-match-empty")).toBeTruthy());
  });

  it("shows a mapped error with a retry", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "You need admin access to do that." } });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByText("You need admin access to do that.")).toBeTruthy());
    expect(r.getByText("Retry")).toBeTruthy();
  });

  it("says the backend is outdated instead of PostgREST's text when the RPC is missing", async () => {
    mockList.mockResolvedValue({
      ok: false,
      error: { code: "RPC_MISSING", message: "Could not find the function public.admin_list_no_match_videos" },
    });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("no-match-error")).toHaveTextContent(/This needs the latest backend/));
    expect(r.queryByText(/Could not find the function/)).toBeNull();
    expect(r.getByText("Retry")).toBeTruthy();
  });

  it("never shows a raw UNKNOWN message", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "relation does not exist" } });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("no-match-error")).toHaveTextContent("Couldn't load no-match videos. Try again."));
    expect(r.queryByText(/relation does not exist/)).toBeNull();
  });

  describe("verdict history fields (optional)", () => {
    it("shows re-uploaded-since and the verdict counts when present", async () => {
      mockList.mockResolvedValue({
        ok: true,
        data: [{ ...ROW, key: "ver-1", verdict_id: "ver-1", superseded: true, current_match_detected: true, verdict_count: 3, no_match_count: 2 }],
      });
      const r = await renderScreen();
      const row = await waitFor(() => r.getByTestId("no-match-row-ver-1"));
      expect(within(row).getByTestId("no-match-superseded")).toHaveTextContent("Re-uploaded since");
      expect(within(row).getByTestId("no-match-counts")).toHaveTextContent("2 of 3 verdicts: no match");
    });

    it("says the video was deleted when the verdict outlived its row", async () => {
      mockList.mockResolvedValue({
        ok: true,
        data: [{ ...ROW, key: "ver-2", video_id: null, verdict_id: "ver-2", superseded: true, verdict_count: 1, no_match_count: 1 }],
      });
      const r = await renderScreen();
      const row = await waitFor(() => r.getByTestId("no-match-row-ver-2"));
      expect(within(row).getByTestId("no-match-superseded")).toHaveTextContent("Video deleted since");
      expect(within(row).getByTestId("no-match-counts")).toHaveTextContent("1 of 1 verdict: no match");
      expect(within(row).getByText(/video deleted · match m-1/)).toBeTruthy();
    });

    it("renders neither without the history fields (older backend) or when not superseded", async () => {
      mockList.mockResolvedValue({
        ok: true,
        data: [ROW, { ...ROW, key: "ver-3", verdict_id: "ver-3", superseded: false, verdict_count: null, no_match_count: null }],
      });
      const r = await renderScreen();
      await waitFor(() => expect(r.getByTestId("no-match-row-vid-1")).toBeTruthy());
      expect(r.queryByTestId("no-match-superseded")).toBeNull();
      expect(r.queryByTestId("no-match-counts")).toBeNull();
    });
  });

  it("redirects a non-admin", async () => {
    mockIsAdmin = false;
    mockList.mockResolvedValue({ ok: true, data: [] });
    await renderScreen();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
