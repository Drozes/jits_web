/**
 * The picker, end to end inside the crew step (timekeeper mode M2, spec 4.2
 * Pick, 14.8 M2; boards P-TK-B2 and P-TK-B3): every picker state from
 * TK-P1 to TK-P23 and TK-W1, one open request per match, the other athlete's
 * view, the decline / lapse / drop-out lines, and the accepted flash. The
 * timekeeper-mode wrappers are mocked; the timekeeper-mode state is handed in
 * through `MatchFlowProvider`, as the wizard does.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => jest.requireActual("@/lib/tokens").darkTokens,
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@jits/shared/api/mutations", () => ({ cancelSessionMatch: jest.fn() }));

const mockCandidates = jest.fn();
const mockRequest = jest.fn();
const mockCancelRequest = jest.fn();
const mockLatest = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperCandidates: (...a: unknown[]) => mockCandidates(...a),
  requestMatchTimekeeper: (...a: unknown[]) => mockRequest(...a),
  cancelTimekeeperRequest: (...a: unknown[]) => mockCancelRequest(...a),
  getLatestTimekeeperRequest: (...a: unknown[]) => mockLatest(...a),
}));

import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import { CrewStep } from "@/components/match-flow/crew/crew-step";
import { OWN_CHANGE_GRACE_MS } from "@/components/match-flow/crew/use-crew-request";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { __resetServerClockForTests, noteServerTime } from "@/lib/arena/incoming-challenges";
import { toast } from "@/components/ui/toast";

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const REYES = "a0000000-0000-4000-8000-000000000001";
const OKAFOR = "a0000000-0000-4000-8000-000000000002";

const athlete = (id: string, name: string) => ({
  athlete_id: id,
  display_name: name,
  current_elo: id === REYES ? 1512 : 1487,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: 0,
  weight_division_gap: null,
});

/** M. Reyes challenged D. Okafor; nobody is seated; the pick deadline is 9:12 away. */
const MATCH = {
  id: "M1",
  status: "pending",
  participants: [athlete(REYES, "Marco Reyes"), athlete(OKAFOR, "Dayo Okafor")],
  challenger_id: REYES,
  requires_timekeeper: true,
  timekeeper_id: null,
  timekeeper: null,
  timekeeper_deadline_at: new Date(NOW + 552_000).toISOString(),
} as unknown as MatchDetails;

const STATE: TimekeeperMatchState = {
  ready: [],
  athleteChecks: [],
  timekeeperChecks: [],
  openRequest: null,
  lastRequestOutcome: null,
  presence: null,
  offlineSince: null,
  noContestAt: null,
  reviewPending: false,
  timeoutAt: null,
  weights: [
    { athleteId: REYES, weight: 172.5 },
    { athleteId: OKAFOR, weight: 171.4 },
  ],
  editOpen: false,
  editClosesAt: null,
  startBlockers: ["timekeeper_required"],
};

const cand = (id: string, name: string, friendOf: "challenger" | "opponent" | "both" | null) => ({
  athleteId: id,
  displayName: name,
  avatarUrl: null,
  currentElo: 1301,
  isLive: true,
  friendOf,
  distanceBand: null,
});
const LISTS = {
  friends: [cand("jc", "Jordan Cruz", "opponent"), cand("sw", "Sam Whitfield", "challenger")],
  nearby: [cand("lt", "Leo Tanaka", null)],
};

const OPEN_BY = (by: string) => ({
  id: "q1",
  invitee: { id: "jc", displayName: "Jordan Cruz" },
  requestedBy: by,
  expiresAt: new Date(NOW + 120_000).toISOString(),
});

const reconcileNow = jest.fn();
let snapshotListener: ((m: MatchDetails) => void) | null = null;
const SYNC = {
  onChannelStatus: jest.fn(),
  reconcileNow,
  markExiting: jest.fn(),
  subscribeSnapshot: (l: (m: MatchDetails) => void) => {
    snapshotListener = l;
    return () => {
      snapshotListener = null;
    };
  },
  noteCancelActor: jest.fn(),
  timekeeperModeSelfId: REYES,
};

function tree(viewer: string, tkState: TimekeeperMatchState | null) {
  return (
    <MatchFlowProvider match={MATCH} roles={deriveMatchRoles(MATCH, viewer)!} tkState={tkState}>
      <MatchSyncProvider value={SYNC}>
        <CrewStep matchId="M1" exitHref="/arena" />
      </MatchSyncProvider>
    </MatchFlowProvider>
  );
}

/** Let the mocked reads settle (their promise chains run a few microtask turns). */
async function flush() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

async function mount(viewer = REYES, tkState: TimekeeperMatchState | null = STATE) {
  const s = render(tree(viewer, tkState));
  await flush();
  return {
    s,
    rerender: async (next: TimekeeperMatchState | null) => {
      s.rerender(tree(viewer, next));
      await flush();
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
  mockCandidates.mockResolvedValue({ ok: true, data: LISTS });
  mockLatest.mockResolvedValue({ ok: true, data: null });
  mockRequest.mockResolvedValue({ ok: true, data: { requestId: "q1", expiresAt: new Date(NOW + 120_000).toISOString() } });
  mockCancelRequest.mockResolvedValue({ ok: true, data: undefined });
  __resetServerClockForTests();
});
afterEach(() => {
  jest.useRealTimers();
  __resetServerClockForTests();
});

/** The Arena learned that this phone's clock runs `ms` ahead of the server's (negative: behind). */
const deviceAheadBy = (ms: number) => noteServerTime(new Date(NOW - ms).toISOString(), NOW, "roundtrip");

describe("crew step: the picker", () => {
  it("draws the board: top bar, fight chip with the rated weights, title, deadline, helper, people", async () => {
    const { s } = await mount();
    expect(s.getByTestId("crew-top-label")).toHaveTextContent("FACE-OFF · TIMEKEEPER");
    s.getByText("Leave");
    expect(s.getByTestId("crew-leave").props.accessibilityLabel).toBe("Cancel match");
    // The face-off's own bar: Leave is measured, so both side slots keep its width.
    s.getByTestId("faceoff-leave-measure");
    s.getByText("M. Reyes");
    s.getByText("D. Okafor");
    s.getByText("1512 · 172.5 LBS");
    s.getByText("Pick a timekeeper");
    expect(s.getByTestId("crew-deadline-text")).toHaveTextContent("CANCELS IN 9:12");
    s.getByText("They start the match, run the clock and record the result. They can't be either of you.");
    s.getByText("Jordan Cruz");
    s.getByText("D. Okafor's friend");
    expect(mockCandidates).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    expect(s.queryByTestId("crew-status-line")).toBeNull();
  });

  it.each([
    [60_000, "CANCELS IN 10:12"],
    [-60_000, "CANCELS IN 8:12"],
  ])("TK-W1 counts on the server's clock: a phone %i ms off reads %s", async (aheadMs, text) => {
    deviceAheadBy(aheadMs);
    const { s } = await mount();
    expect(s.getByTestId("crew-deadline-text")).toHaveTextContent(text);
  });

  it("on a phone whose clock runs ahead, a request the server still holds open keeps its card until it lapses there", async () => {
    deviceAheadBy(60_000);
    // 5 s past on this phone's clock, 55 s left on the server's.
    const { s } = await mount(REYES, { ...STATE, openRequest: { ...OPEN_BY(REYES), expiresAt: new Date(NOW - 5_000).toISOString() } });
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
    expect(s.queryByTestId("crew-status-line")).toBeNull();
    act(() => jest.advanceTimersByTime(55_000));
    await flush();
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz didn't answer. Pick someone else.");
  });

  it("Ask sends the request and shows it at once: Asked {name}, every Ask disabled", async () => {
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), "M1", "jc");
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
    s.getByText("Waiting for them to accept.");
    fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("a state read from before the Ask does not take the card away; after the grace the state decides", async () => {
    const { s, rerender } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    await rerender({ ...STATE });
    s.getByTestId("crew-request-card");
    act(() => jest.advanceTimersByTime(OWN_CHANGE_GRACE_MS));
    // The request ended for this phone, so the people re-read.
    await flush();
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
  });

  it("once the state shows the request it rules: the card stays past the grace", async () => {
    const { s, rerender } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    await rerender({ ...STATE, openRequest: OPEN_BY(REYES) });
    act(() => jest.advanceTimersByTime(OWN_CHANGE_GRACE_MS * 2));
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
  });

  it("the other athlete's phone follows the request live: {athlete} asked {name}", async () => {
    const { s } = await mount(OKAFOR, { ...STATE, openRequest: OPEN_BY(REYES) });
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("M. Reyes asked J. Cruz");
    // On D. Okafor's phone the caption flips: Sam Whitfield is M. Reyes's friend.
    s.getByText("M. Reyes's friend");
    fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("Ask someone else withdraws the open request and frees the list", async () => {
    const { s, rerender } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
    fireEvent.press(s.getByLabelText("Ask someone else"));
    await flush();
    expect(mockCancelRequest).toHaveBeenCalledWith(expect.anything(), "q1");
    // Hidden even while a stale read still shows it.
    await rerender({ ...STATE, openRequest: OPEN_BY(REYES) });
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
    await flush();
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), "M1", "lt");
  });

  it("asking again right after a withdrawal: a stale read of the withdrawn request never replaces the new one", async () => {
    const { s, rerender } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
    fireEvent.press(s.getByLabelText("Ask someone else"));
    await flush();
    mockRequest.mockResolvedValue({ ok: true, data: { requestId: "q2", expiresAt: new Date(NOW + 120_000).toISOString() } });
    fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
    await flush();
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked L. Tanaka");
    // A read that still reports the withdrawn q1 (a missed realtime row, until the next crew poll).
    await rerender({ ...STATE, openRequest: OPEN_BY(REYES) });
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked L. Tanaka");
    // Its Ask someone else withdraws the new request, never the withdrawn one again.
    fireEvent.press(s.getByLabelText("Ask someone else"));
    await flush();
    expect(mockCancelRequest).toHaveBeenCalledTimes(2);
    expect(mockCancelRequest).toHaveBeenLastCalledWith(expect.anything(), "q2");
  });

  it("a double tap on Ask sends one request", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { s } = await mount();
    const ask = s.getByLabelText("Ask Jordan Cruz to timekeep");
    // Both taps land before the row re-renders busy.
    act(() => {
      fireEvent.press(ask);
      fireEvent.press(ask);
    });
    await act(async () => {
      resolve({ ok: true, data: { requestId: "q1", expiresAt: new Date(NOW + 120_000).toISOString() } });
    });
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
  });

  it("the people re-read when the open request ends (a decliner drops out)", async () => {
    const { rerender } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
    expect(mockCandidates).toHaveBeenCalledTimes(1);
    await rerender({ ...STATE, lastRequestOutcome: { status: "declined", inviteeName: "Jordan Cruz", at: "x" } });
    expect(mockCandidates).toHaveBeenCalledTimes(2);
  });

  it("declined: {name} can't timekeep. Pick someone else. (TK-P21)", async () => {
    const { s } = await mount(REYES, { ...STATE, lastRequestOutcome: { status: "declined", inviteeName: "Jordan Cruz", at: "x" } });
    expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz can't timekeep. Pick someone else.");
  });

  it("lapsed: {name} didn't answer. Pick someone else. (TK-P22)", async () => {
    const { s } = await mount(REYES, { ...STATE, lastRequestOutcome: { status: "expired", inviteeName: "Jordan Cruz", at: "x" } });
    expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz didn't answer. Pick someone else.");
  });

  it("back on the picker after a pre-start drop-out: {name} left. Pick a new timekeeper. (TK-D1)", async () => {
    mockLatest.mockResolvedValue({
      ok: true,
      data: { requestId: "q0", status: "accepted", inviteeId: "jc", inviteeName: "Jordan Cruz", expiresAt: "x" },
    });
    const { s, rerender } = await mount();
    expect(mockLatest).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz left. Pick a new timekeeper.");
    // A new request supersedes it, and the drop-out line never comes back after it.
    await rerender({ ...STATE, openRequest: OPEN_BY(OKAFOR) });
    expect(s.queryByTestId("crew-status-line")).toBeNull();
    await rerender({ ...STATE });
    expect(s.queryByTestId("crew-status-line")).toBeNull();
  });

  it.each(["cancelled", "pending", "declined", "expired"] as const)(
    "a newest request that is %s is no drop-out: no TK-D1 line",
    async (status) => {
      mockLatest.mockResolvedValue({
        ok: true,
        data: { requestId: "q0", status, inviteeId: "jc", inviteeName: "Jordan Cruz", expiresAt: "x" },
      });
      const { s } = await mount();
      expect(mockLatest).toHaveBeenCalledWith(expect.anything(), "M1");
      expect(s.queryByTestId("crew-status-line")).toBeNull();
    },
  );

  it("a drop-out whose timekeeper the viewer cannot read (an empty name) shows no line, never a stand-in name", async () => {
    mockLatest.mockResolvedValue({
      ok: true,
      data: { requestId: "q0", status: "accepted", inviteeId: "jc", inviteeName: "", expiresAt: "x" },
    });
    const { s } = await mount();
    expect(mockLatest).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(s.queryByTestId("crew-status-line")).toBeNull();
    expect(s.queryByText(/left\. Pick a new timekeeper\./)).toBeNull();
  });

  it("the seat flashes {name} is your timekeeper as the wizard moves on (TK-P23)", async () => {
    await mount();
    expect(snapshotListener).not.toBeNull();
    act(() => snapshotListener?.({ ...MATCH, timekeeper_id: "jc", timekeeper: { id: "jc", display_name: "Jordan Cruz", profile_photo_url: null } } as MatchDetails));
    expect(toast.success).toHaveBeenCalledWith("J. Cruz is your timekeeper");
    act(() => snapshotListener?.({ ...MATCH, timekeeper_id: "jc", timekeeper: { id: "jc", display_name: "Jordan Cruz", profile_photo_url: null } } as MatchDetails));
    expect(toast.success).toHaveBeenCalledTimes(1);
    // A snapshot with nobody seated flashes nothing.
    act(() => snapshotListener?.(MATCH));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("the crew poll's snapshots before anyone is seated flash nothing; the seat then flashes exactly once (TK-P23)", async () => {
    await mount();
    expect(snapshotListener).not.toBeNull();
    act(() => snapshotListener?.(MATCH));
    act(() => snapshotListener?.({ ...MATCH, timekeeper_id: null, timekeeper: null } as MatchDetails));
    expect(toast.success).not.toHaveBeenCalled();
    act(() => snapshotListener?.({ ...MATCH, timekeeper_id: "jc", timekeeper: { id: "jc", display_name: "Jordan Cruz", profile_photo_url: null } } as MatchDetails));
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("J. Cruz is your timekeeper");
  });

  it("a person who turned busy since the list loaded shows why on the row (TK-P8)", async () => {
    mockRequest.mockResolvedValue({ ok: false, error: { code: "TIMEKEEPER_BUSY", message: "x", busyAs: "timekeeper" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(s.getByTestId("crew-candidate-busy-jc")).toHaveTextContent("Timekeeping another match");
    expect(s.queryByTestId("crew-request-card")).toBeNull();
  });

  it("a row marked busy is askable again after a fresh read of the people (the return to the foreground)", async () => {
    const handlers: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never);
    mockRequest.mockResolvedValueOnce({ ok: false, error: { code: "TIMEKEEPER_BUSY", message: "x", busyAs: "timekeeper" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    s.getByTestId("crew-candidate-busy-jc");
    expect(s.queryByLabelText("Ask Jordan Cruz to timekeep")).toBeNull();
    act(() => handlers.forEach((h) => h("active")));
    await flush();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
    expect(s.queryByTestId("crew-candidate-busy-jc")).toBeNull();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
    spy.mockRestore();
  });

  it("someone else's request got in first: re-read the match (TK-P20 follows)", async () => {
    mockRequest.mockResolvedValue({ ok: false, error: { code: "REQUEST_ALREADY_OPEN", message: "x", requestId: "q9" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(reconcileNow).toHaveBeenCalled();
  });

  it("a person who can no longer be asked drops out of a fresh read", async () => {
    mockRequest.mockResolvedValue({ ok: false, error: { code: "TIMEKEEPER_UNAVAILABLE", message: "x" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
  });

  it("a failed send keeps the row askable", async () => {
    mockRequest.mockRejectedValueOnce(new Error("offline"));
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("the match moved on under the picker (cancelled at the deadline): re-read, no error panel", async () => {
    mockCandidates.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "x" } });
    const { s } = await mount();
    expect(reconcileNow).toHaveBeenCalled();
    expect(s.queryByTestId("crew-load-error")).toBeNull();
  });

  it("Ask someone else on a request that is already over (REQUEST_CLOSED) hides the card and re-reads the people", async () => {
    mockCancelRequest.mockResolvedValue({ ok: false, error: { code: "REQUEST_CLOSED", message: "x" } });
    const { s } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
    expect(mockCandidates).toHaveBeenCalledTimes(1);
    fireEvent.press(s.getByLabelText("Ask someone else"));
    await flush();
    expect(s.queryByTestId("crew-request-card")).toBeNull();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
  });

  it("a withdrawal the server refuses for another reason keeps the card", async () => {
    mockCancelRequest.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { s } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
    fireEvent.press(s.getByLabelText("Ask someone else"));
    await flush();
    s.getByTestId("crew-request-card");
  });

  it("the people re-read on the return to the foreground", async () => {
    const handlers: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
      handlers.push(h);
      return { remove: jest.fn() };
    }) as never);
    await mount();
    expect(mockCandidates).toHaveBeenCalledTimes(1);
    act(() => handlers.forEach((h) => h("background")));
    await flush();
    expect(mockCandidates).toHaveBeenCalledTimes(1);
    act(() => handlers.forEach((h) => h("active")));
    await flush();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it.each(["MATCH_CANCELLED", "MATCH_NOT_PENDING", "TIMEKEEPER_ALREADY_SEATED", "NOT_TIMEKEEPER_MODE"])("an Ask refused %s re-reads the match", async (code) => {
    mockRequest.mockResolvedValue({ ok: false, error: { code, message: "x" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(reconcileNow).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("crew-request-card")).toBeNull();
  });

  it("an Ask refused TIMEKEEPER_IS_COMPETITOR re-reads the people", async () => {
    mockRequest.mockResolvedValue({ ok: false, error: { code: "TIMEKEEPER_IS_COMPETITOR", message: "x" } });
    const { s } = await mount();
    fireEvent.press(s.getByLabelText("Ask Jordan Cruz to timekeep"));
    await flush();
    expect(mockCandidates).toHaveBeenCalledTimes(2);
    expect(reconcileNow).not.toHaveBeenCalled();
  });

  describe("a request that lapsed while the state still reports it (spec 7: only a request RPC or the minute tick lapses it)", () => {
    it("at its expiry: the card goes, TK-P22 names the person, the people re-read and Ask works at once", async () => {
      const { s } = await mount(REYES, { ...STATE, openRequest: OPEN_BY(REYES) });
      expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked J. Cruz");
      act(() => jest.advanceTimersByTime(119_000));
      s.getByTestId("crew-request-card");
      act(() => jest.advanceTimersByTime(1_000));
      await flush();
      expect(s.queryByTestId("crew-request-card")).toBeNull();
      expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz didn't answer. Pick someone else.");
      expect(mockCandidates).toHaveBeenCalledTimes(2);
      mockRequest.mockResolvedValue({ ok: true, data: { requestId: "q2", expiresAt: new Date(Date.now() + 120_000).toISOString() } });
      fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
      await flush();
      expect(mockRequest).toHaveBeenCalledWith(expect.anything(), "M1", "lt");
      // The new request shows at once, though the state still reports the lapsed one.
      expect(s.getByTestId("crew-request-title")).toHaveTextContent("Asked L. Tanaka");
    });

    it("the other athlete's phone too: TK-P22, no card, Ask enabled", async () => {
      const { s } = await mount(OKAFOR, { ...STATE, openRequest: { ...OPEN_BY(REYES), expiresAt: new Date(NOW - 5_000).toISOString() } });
      expect(s.queryByTestId("crew-request-card")).toBeNull();
      expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz didn't answer. Pick someone else.");
      fireEvent.press(s.getByLabelText("Ask Leo Tanaka to timekeep"));
      await flush();
      expect(mockRequest).toHaveBeenCalledWith(expect.anything(), "M1", "lt");
    });

    it("the state's own outcome takes over with the same line", async () => {
      const { s, rerender } = await mount(REYES, { ...STATE, openRequest: { ...OPEN_BY(REYES), expiresAt: new Date(NOW - 5_000).toISOString() } });
      await rerender({ ...STATE, lastRequestOutcome: { status: "expired", inviteeName: "Jordan Cruz", at: "x" } });
      expect(s.getByTestId("crew-status-line")).toHaveTextContent("J. Cruz didn't answer. Pick someone else.");
      expect(s.queryByTestId("crew-request-card")).toBeNull();
    });

    it("an older outcome in the state never hides the newer lapse", async () => {
      const { s } = await mount(REYES, {
        ...STATE,
        openRequest: { ...OPEN_BY(REYES), invitee: { id: "lt", displayName: "Leo Tanaka" }, expiresAt: new Date(NOW - 1_000).toISOString() },
        lastRequestOutcome: { status: "declined", inviteeName: "Jordan Cruz", at: "x" },
      });
      expect(s.getByTestId("crew-status-line")).toHaveTextContent("L. Tanaka didn't answer. Pick someone else.");
    });
  });

  it("a failed read offers Try again (TK-P16), which reads again", async () => {
    mockCandidates.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { s } = await mount();
    s.getByText("Couldn't load people to ask.");
    fireEvent.press(s.getByLabelText("Try again"));
    await flush();
    s.getByText("Jordan Cruz");
  });
});
