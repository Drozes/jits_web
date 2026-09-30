/**
 * Stats timeline window, ELO progression and Top Submissions toggle
 * (jits-02vo.4, board P-Profile-Stats). The real shared query wrappers run
 * against a mocked supabase.rpc so the tests pin the exact RPC arguments the
 * jr_be-ahn.8 contract expects for each window and outcome.
 */
import * as React from "react";
import { FlatList, StyleSheet } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : stub) },
  );
});
jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return { AppHeader: () => R.createElement(RN.View, { testID: "app-header" }) };
});
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: "me-1", display_name: "Me", current_elo: 1487, current_weight: 180 },
    isLoading: false,
  }),
}));

type RpcArgs = Record<string, unknown>;
type RpcHandler = (args: RpcArgs) => unknown[] | Promise<unknown[]>;
const handlers: Record<string, RpcHandler> = {};
type RpcResult = { data: unknown[] | null; error: { message: string } | null };
const mockRpc = jest.fn(
  async (fn: string, args: RpcArgs): Promise<RpcResult> => ({
    data: handlers[fn] ? await handlers[fn](args) : [],
    error: null,
  }),
);
jest.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: RpcArgs) => mockRpc(fn, args) },
}));

import ProfileStatsScreen from "@/app/(app)/(tabs)/profile/stats";

const DAY_MS = 24 * 60 * 60 * 1000;

function statsSince(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

// get_match_history rows over the last year (newest first, like the RPC).
const MATCHES = [
  { match_id: "m-3", opponent_id: "o-1", opponent_display_name: "Dana Okafor", athlete_outcome: "win", match_type: "ranked", result: "submission", elo_delta: 18, elo_before: 1469, elo_after: 1487, completed_at: daysAgo(2) },
  { match_id: "m-2", opponent_id: "o-2", opponent_display_name: "Jordan Cruz", athlete_outcome: "loss", match_type: "ranked", result: "points", elo_delta: -10, elo_before: 1479, elo_after: 1469, completed_at: daysAgo(40) },
  { match_id: "m-1", opponent_id: "o-3", opponent_display_name: "Priya Shah", athlete_outcome: "win", match_type: "ranked", result: "submission", elo_delta: 129, elo_before: 1350, elo_after: 1479, completed_at: daysAgo(200) },
];
// get_elo_history rows (newest first).
const ELO = [
  { match_id: "m-3", rating_before: 1469, rating_after: 1487, delta: 18, created_at: MATCHES[0].completed_at },
  { match_id: "m-2", rating_before: 1479, rating_after: 1469, delta: -10, created_at: MATCHES[1].completed_at },
  { match_id: "m-1", rating_before: 1350, rating_after: 1479, delta: 129, created_at: MATCHES[2].completed_at },
];

function inWindow<T extends { completed_at?: string; created_at?: string }>(rows: T[], since: unknown): T[] {
  if (since == null) return rows;
  const t = new Date(String(since)).getTime();
  return rows.filter((r) => new Date(r.completed_at ?? r.created_at ?? 0).getTime() >= t);
}

beforeEach(() => {
  mockRpc.mockClear();
  handlers.get_match_history = (a) => inWindow(MATCHES, a.p_since);
  handlers.get_elo_history = (a) => inWindow(ELO, a.p_since);
  handlers.get_submission_breakdown = (a) =>
    a.p_outcome === "losses"
      ? [{ submission_type_code: "heel_hook", submission_type_display_name: "Heel Hook", count: 2 }]
      : [
          { submission_type_code: "armbar", submission_type_display_name: "Armbar", count: 4 },
          { submission_type_code: "rnc", submission_type_display_name: "Rear Naked Choke", count: 3 },
        ];
});

/** A promise the test resolves by hand, to hold an RPC in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function callsTo(fn: string): RpcArgs[] {
  return mockRpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args);
}

function expectSinceDaysAgo(since: unknown, days: number) {
  expect(typeof since).toBe("string");
  const drift = Math.abs(Date.now() - days * DAY_MS - new Date(String(since)).getTime());
  expect(drift).toBeLessThan(60_000);
}

describe("Stats timeline window (jits-02vo.4)", () => {
  it("defaults to ALL: every RPC is called with no p_since", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    expect(s.getByLabelText("Show all time").props.accessibilityState).toMatchObject({ selected: true });
    expect(callsTo("get_match_history")).toEqual([{ p_athlete_id: "me-1" }]);
    expect(callsTo("get_elo_history")).toEqual([{ p_athlete_id: "me-1" }]);
    expect(callsTo("get_submission_breakdown")).toEqual([{ p_athlete_id: "me-1", p_outcome: "wins" }]);
    // All three matches count toward the record and win rate.
    expect(s.getByText("2W")).toBeTruthy();
    expect(s.getByText("1L")).toBeTruthy();
    expect(s.getByText("67%")).toBeTruthy();
  });

  it.each([
    ["Show the last 30 days", 30, "wins"],
    ["Show the last 90 days", 90, "wins"],
    ["Show the last year", 365, "wins"],
    ["Show the last 30 days", 30, "losses"],
    ["Show the last 90 days", 90, "losses"],
    ["Show the last year", 365, "losses"],
  ])("%s passes p_since = now - %i days to all three RPCs (%s)", async (label, days, outcome) => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    if (outcome === "losses") {
      fireEvent.press(s.getByLabelText("Show submission losses"));
      await s.findByText("Heel Hook");
    }
    mockRpc.mockClear();
    fireEvent.press(s.getByLabelText(label));
    await waitFor(() => expect(callsTo("get_submission_breakdown")).toHaveLength(1));
    await waitFor(() => expect(callsTo("get_elo_history")).toHaveLength(1));
    const [mh] = callsTo("get_match_history");
    const [eh] = callsTo("get_elo_history");
    const [sb] = callsTo("get_submission_breakdown");
    expect(mh.p_athlete_id).toBe("me-1");
    expectSinceDaysAgo(mh.p_since, days);
    expectSinceDaysAgo(eh.p_since, days);
    expectSinceDaysAgo(sb.p_since, days);
    expect(sb.p_outcome).toBe(outcome);
  });

  it("dims the previous window's numbers and hides its match list until the new window loads", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByLabelText("Open match vs Priya Shah");
    const opacity = () =>
      StyleSheet.flatten(s.getByTestId("stats-window-body").props.style).opacity;
    expect(opacity()).toBe(1);
    expect(s.queryByTestId("stats-window-loading")).toBeNull();

    const held = deferred<unknown[]>();
    handlers.get_match_history = () => held.promise;
    fireEvent.press(s.getByLabelText("Show the last 30 days"));
    await waitFor(() => expect(s.getByTestId("stats-window-loading")).toBeTruthy());
    expect(opacity()).toBe(0.4);
    // No all-time match rows under the active 30D chip.
    expect(s.queryByLabelText("Open match vs Priya Shah")).toBeNull();
    expect(s.queryByLabelText("Open match vs Dana Okafor")).toBeNull();

    await act(async () => { held.resolve(inWindow(MATCHES, statsSince(30))); });
    await s.findByLabelText("Open match vs Dana Okafor");
    expect(opacity()).toBe(1);
    expect(s.queryByTestId("stats-window-loading")).toBeNull();
    expect(s.getByText("1W")).toBeTruthy();
  });

  it("pull-to-refresh refetches all three RPCs with a freshly computed p_since", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    fireEvent.press(s.getByLabelText("Show the last 30 days"));
    await waitFor(() => expect(s.queryByLabelText("Open match vs Priya Shah")).toBeNull());
    await waitFor(() =>
      expect(callsTo("get_submission_breakdown").at(-1)?.p_since).toBeDefined(),
    );
    const before = new Date(String(callsTo("get_elo_history").at(-1)?.p_since)).getTime();
    mockRpc.mockClear();

    // Advance the wall clock so a fresh p_since is distinguishable.
    const realNow = Date.now;
    const later = realNow() + 5_000;
    Date.now = () => later;
    try {
      const list = s.UNSAFE_getByType(FlatList);
      await act(async () => { list.props.refreshControl.props.onRefresh(); });
      await waitFor(() => expect(callsTo("get_submission_breakdown")).toHaveLength(1));
      await waitFor(() => expect(callsTo("get_elo_history")).toHaveLength(1));
      expect(callsTo("get_match_history")).toHaveLength(1);
      for (const fn of ["get_match_history", "get_elo_history", "get_submission_breakdown"]) {
        const since = new Date(String(callsTo(fn)[0].p_since)).getTime();
        expect(since).toBeGreaterThan(before);
      }
    } finally {
      Date.now = realNow;
    }
  });

  it("30D windows the record, wins, win rate and match list", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByLabelText("Open match vs Priya Shah");
    fireEvent.press(s.getByLabelText("Show the last 30 days"));
    await waitFor(() => expect(s.queryByLabelText("Open match vs Priya Shah")).toBeNull());
    expect(s.getByLabelText("Open match vs Dana Okafor")).toBeTruthy();
    expect(s.queryByLabelText("Open match vs Jordan Cruz")).toBeNull();
    expect(s.getByText("1W")).toBeTruthy();
    expect(s.getByText("0L")).toBeTruthy();
    expect(s.getByText("100%")).toBeTruthy();
    // The ELO headline stays the athlete's current rating.
    expect(s.getAllByText("1487").length).toBeGreaterThan(0);
  });
});

describe("ELO Progression", () => {
  it("labels start (earliest rating_before) and current, with net delta and match count", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("3 matches");
    expect(s.getByTestId("elo-progression-delta").props.children).toBe("+137");
    expect(s.getByLabelText("ELO rating over time, from 1350 to 1487")).toBeTruthy();
    expect(s.getByTestId("elo-progression-line").props.strokeDasharray).toBeDefined();
  });

  it("an empty window renders a flat line at current ELO with 0 matches", async () => {
    handlers.get_match_history = () => [];
    handlers.get_elo_history = () => [];
    const s = render(<ProfileStatsScreen />);
    await s.findByText("0 matches");
    expect(s.getByLabelText("ELO rating over time, from 1487 to 1487")).toBeTruthy();
    expect(s.queryByTestId("elo-progression-delta")).toBeNull();
    const points = String(s.getByTestId("elo-progression-line").props.points)
      .split(" ")
      .map((p) => p.split(",")[1]);
    expect(new Set(points).size).toBe(1);
  });
});

describe("Top Submissions Wins / Losses toggle", () => {
  it("defaults to Wins with 'NW' rows, and Losses refetches with p_outcome losses", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    expect(s.getByText("4W")).toBeTruthy();
    expect(s.getByText("3W")).toBeTruthy();
    const historyCalls = callsTo("get_match_history").length;

    fireEvent.press(s.getByLabelText("Show submission losses"));
    await s.findByText("Heel Hook");
    expect(s.getByText("2L")).toBeTruthy();
    expect(s.queryByText("Armbar")).toBeNull();
    expect(callsTo("get_submission_breakdown").at(-1)).toEqual({
      p_athlete_id: "me-1",
      p_outcome: "losses",
    });
    // Flipping the toggle does not reload the rest of the page.
    expect(callsTo("get_match_history")).toHaveLength(historyCalls);
  });

  it("never labels the previous outcome's rows with the new W/L suffix while the toggle loads", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    const held = deferred<unknown[]>();
    const winsHandler = handlers.get_submission_breakdown;
    handlers.get_submission_breakdown = (a) => (a.p_outcome === "losses" ? held.promise : winsHandler(a));

    fireEvent.press(s.getByLabelText("Show submission losses"));
    await waitFor(() => expect(s.getByTestId("submissions-loading")).toBeTruthy());
    // The toggle stays mounted, and no win row is shown as a loss.
    expect(s.getByLabelText("Show submission losses").props.accessibilityState).toMatchObject({ selected: true });
    expect(s.queryByText("Armbar")).toBeNull();
    expect(s.queryByText("4L")).toBeNull();
    expect(s.queryByText("3L")).toBeNull();
    expect(s.queryByText("4W")).toBeNull();

    await act(async () => {
      held.resolve([{ submission_type_code: "heel_hook", submission_type_display_name: "Heel Hook", count: 2 }]);
    });
    await s.findByText("2L");
    expect(s.queryByTestId("submissions-loading")).toBeNull();
  });

  it("does not show the old window's submission counts under a new window chip", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    const held = deferred<unknown[]>();
    handlers.get_submission_breakdown = () => held.promise;
    fireEvent.press(s.getByLabelText("Show the last 30 days"));
    await waitFor(() => expect(s.getByTestId("submissions-loading")).toBeTruthy());
    expect(s.queryByText("Armbar")).toBeNull();
    await act(async () => {
      held.resolve([{ submission_type_code: "armbar", submission_type_display_name: "Armbar", count: 1 }]);
    });
    await s.findByText("Armbar");
    expect(s.queryByTestId("submissions-loading")).toBeNull();
    // "1W" is both the 30D record and the Armbar row.
    expect(s.getAllByText("1W")).toHaveLength(2);
  });

  it("shows an error state, not the empty state, when the breakdown RPC fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockImplementation(async (fn: string, args: RpcArgs) =>
      fn === "get_submission_breakdown"
        ? { data: null, error: { message: "not_authorized" } }
        : { data: handlers[fn] ? await handlers[fn](args) : [], error: null },
    );
    try {
      const s = render(<ProfileStatsScreen />);
      await s.findByText("Could not load submissions. Pull to refresh.");
      expect(s.queryByText("No submission wins yet")).toBeNull();
    } finally {
      mockRpc.mockImplementation(async (fn: string, args: RpcArgs) => ({
        data: handlers[fn] ? await handlers[fn](args) : [],
        error: null,
      }));
      spy.mockRestore();
    }
  });

  it("keeps the outcome when the window changes", async () => {
    const s = render(<ProfileStatsScreen />);
    await s.findByText("Armbar");
    fireEvent.press(s.getByLabelText("Show submission losses"));
    await s.findByText("Heel Hook");
    mockRpc.mockClear();
    fireEvent.press(s.getByLabelText("Show the last 90 days"));
    await waitFor(() => expect(callsTo("get_submission_breakdown")).toHaveLength(1));
    const [sb] = callsTo("get_submission_breakdown");
    expect(sb.p_outcome).toBe("losses");
    expectSinceDaysAgo(sb.p_since, 90);
  });

  it("shows empty-state copy when there are no submissions for the outcome", async () => {
    handlers.get_submission_breakdown = () => [];
    const s = render(<ProfileStatsScreen />);
    await s.findByText("No submission wins yet");
    fireEvent.press(s.getByLabelText("Show submission losses"));
    await s.findByText("No submission losses yet");
  });
});
