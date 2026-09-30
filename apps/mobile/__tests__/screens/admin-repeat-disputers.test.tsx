/**
 * Admin > Repeat disputers (jits-02vo.11, backend jr_be-ahn.6): athletes with
 * 3+ disputes resolved against them in 30 days, with a link to their profile
 * and an info-only row per lost match (match detail is participant-only). Admin-gated in the client and on the server.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

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
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock("expo-router", () => ({
  Redirect: (p: { href: string }) => {
    mockRedirect(p.href);
    return null;
  },
  useRouter: () => mockRouter,
}));
const mockList = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  listRepeatDisputers: (...a: unknown[]) => mockList(...a),
}));

import AdminRepeatDisputersScreen from "@/app/(app)/settings/admin/disputers";

async function renderScreen() {
  const r = render(<AdminRepeatDisputersScreen />);
  await act(async () => {
    await Promise.resolve();
  });
  return r;
}

const ROW = {
  athlete_id: "ath-1",
  display_name: "Kai Reyes",
  lost_disputes_30d: 4,
  total_disputes_30d: 6,
  last_lost_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  lost_match_ids: ["m-aaaaaaaa-1", "m-bbbbbbbb-2"],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin = true;
});

describe("AdminRepeatDisputersScreen", () => {
  it("lists each flagged athlete with counts, last lost time and match links", async () => {
    mockList.mockResolvedValue({ ok: true, data: [ROW, { ...ROW, athlete_id: "ath-2", display_name: null, lost_disputes_30d: 3, total_disputes_30d: 3, last_lost_at: null, lost_match_ids: [] }] });
    const r = await renderScreen();
    const row = await waitFor(() => r.getByTestId("disputer-row-ath-1"));
    const inRow = within(row);
    expect(inRow.getByText("Kai Reyes")).toBeTruthy();
    expect(inRow.getByTestId("disputer-counts")).toHaveTextContent("4 LOST / 6 DISPUTED · 30D");
    expect(inRow.getByTestId("disputer-last-lost")).toHaveTextContent("Last lost 2d ago");
    expect(inRow.getByTestId("disputer-match-m-aaaaaaaa-1")).toBeTruthy();
    expect(inRow.getByTestId("disputer-match-m-bbbbbbbb-2")).toBeTruthy();

    const second = within(r.getByTestId("disputer-row-ath-2"));
    expect(second.getByText("Unknown athlete")).toBeTruthy();
    expect(second.getByTestId("disputer-counts")).toHaveTextContent("3 LOST / 3 DISPUTED · 30D");
    expect(second.queryByTestId("disputer-last-lost")).toBeNull();
  });

  it("keeps the backend order", async () => {
    mockList.mockResolvedValue({ ok: true, data: [{ ...ROW, athlete_id: "ath-z" }, { ...ROW, athlete_id: "ath-a", lost_match_ids: [] }] });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("disputer-row-ath-z")).toBeTruthy());
    const ids = r.getAllByTestId(/^disputer-row-/).map((n) => n.props.testID);
    expect(ids).toEqual(["disputer-row-ath-z", "disputer-row-ath-a"]);
  });

  it("opens the athlete profile", async () => {
    mockList.mockResolvedValue({ ok: true, data: [ROW] });
    const r = await renderScreen();
    fireEvent.press(await waitFor(() => r.getByTestId("disputer-athlete-ath-1")));
    expect(mockPush).toHaveBeenCalledWith("/(app)/athlete/ath-1");
  });

  it("shows lost matches as info-only rows, never links into the participant-only match detail", async () => {
    mockList.mockResolvedValue({ ok: true, data: [ROW] });
    const r = await renderScreen();
    const match = await waitFor(() => r.getByTestId("disputer-match-m-bbbbbbbb-2"));
    expect(match).toHaveTextContent("Lost dispute · match m-bbbbbb");
    expect(match.props.accessibilityRole).toBeUndefined();
    expect(match.props.onPress).toBeUndefined();
    fireEvent.press(match);
    expect(mockPush).not.toHaveBeenCalled();
    expect(r.getAllByRole("link")).toHaveLength(1);
  });

  it("says Today for a loss earlier the same day", async () => {
    mockList.mockResolvedValue({ ok: true, data: [{ ...ROW, last_lost_at: new Date(Date.now() - 60_000).toISOString() }] });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("disputer-last-lost")).toHaveTextContent("Last lost Today"));
  });

  it("shows the empty state", async () => {
    mockList.mockResolvedValue({ ok: true, data: [] });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("disputers-empty")).toHaveTextContent("No repeat disputers in the last 30 days."));
  });

  it("redirects a non-admin", async () => {
    mockIsAdmin = false;
    mockList.mockResolvedValue({ ok: true, data: [] });
    await renderScreen();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects when the server says not_admin", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "You need admin access to do that." } });
    const r = await renderScreen();
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith("/"));
    expect(r.queryByTestId("disputers-error")).toBeNull();
  });

  it("says the backend is outdated instead of PostgREST's text when the RPC is missing", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "RPC_MISSING", message: "Could not find the function" } });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("disputers-error")).toHaveTextContent(/This needs the latest backend/));
    expect(r.queryByText(/Could not find the function/)).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("never shows a raw UNKNOWN message, and retries", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "relation does not exist" } });
    const r = await renderScreen();
    await waitFor(() => expect(r.getByTestId("disputers-error")).toHaveTextContent("Couldn't load repeat disputers. Try again."));
    expect(r.queryByText(/relation does not exist/)).toBeNull();
    mockList.mockResolvedValue({ ok: true, data: [] });
    await act(async () => {
      fireEvent.press(r.getByText("Retry"));
    });
    await waitFor(() => expect(r.getByTestId("disputers-empty")).toBeTruthy());
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
