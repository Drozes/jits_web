/**
 * The asked person's sheet (timekeeper mode M2, spec 4.2 Seat, 11, 14.8 M2;
 * board P-TK-B4): opened from a push (match only) or the realtime row
 * (with the request), it reads `get_timekeeper_request`, counts down
 * `ANSWER IN {m:ss}` (TK-T5), asks for AI consent first (D12, the shipped
 * sheet; Not now leaves TK-T8 and Accept available), seats the timekeeper on
 * Accept and opens the match, closes on Decline, and closes with TK-T6 when
 * the request is no longer open (withdrawn, lapsed, declined elsewhere, or
 * the asked person turned busy). A request accepted elsewhere (this person's
 * other device, or before the app was killed and reopened from the push)
 * opens the match while they are still seated (spec 11), and otherwise
 * closes with TK-T6. While it is up it marks itself open, which holds the
 * incoming-challenge prompt (spec 9.1).
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

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
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

const mockGetRequest = jest.fn();
const mockLatest = jest.fn();
const mockRespond = jest.fn();
const mockSeat = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperRequest: (...a: unknown[]) => mockGetRequest(...a),
  getLatestTimekeeperRequest: (...a: unknown[]) => mockLatest(...a),
  respondTimekeeperRequest: (...a: unknown[]) => mockRespond(...a),
  getMyTimekeepingMatch: (...a: unknown[]) => mockSeat(...a),
}));
const mockConsent = { given: true, giveOk: true };
const mockGive = jest.fn();
jest.mock("@/lib/moderation/ai-consent", () => ({
  hasAiConsentFor: () => mockConsent.given,
  giveAiConsent: () => {
    mockGive();
    return Promise.resolve(mockConsent.giveOk);
  },
}));
const mockFocus = { focused: true };
jest.mock("@/lib/navigation/use-screen-focused", () => ({ useScreenFocused: () => mockFocus.focused }));
let mockRowListener: ((row: { id: string; matchId: string; status: string; expiresAt: string }) => void) | null = null;
jest.mock("@/lib/match-flow/use-incoming-timekeeper-requests", () => ({
  ...jest.requireActual("@/lib/match-flow/use-incoming-timekeeper-requests"),
  subscribeIncomingTimekeeperRequests: (cb: typeof mockRowListener) => {
    mockRowListener = cb;
    return () => {
      mockRowListener = null;
    };
  },
}));

import { TimekeepSheet } from "@/components/match-flow/crew/timekeep-sheet";
import { TIMEKEEP_SHEET_POLL_MS } from "@/components/match-flow/crew/use-timekeep-sheet";
import { __resetIncomingTimekeeperRequestsForTests } from "@/lib/match-flow/use-incoming-timekeeper-requests";
import { isTimekeepSheetOpen, isTimekeepSheetOpenFor, wasTimekeepRequestShown } from "@/lib/match-flow/timekeep-sheet-store";
import { isInArenaMatch } from "@/lib/arena/arena-store";
import { toast } from "@/components/ui/toast";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";
import { __resetServerClockForTests, noteServerTime } from "@/lib/arena/incoming-challenges";

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
/** Real ids: the sheet treats a malformed match or request id as a closed request. */
const M1 = "0c1d2e3f-4a5b-4c6d-8e7f-0000000000a1";
const Q1 = "0c1d2e3f-4a5b-4c6d-8e7f-0000000000b1";
const REQUEST = {
  requestId: Q1,
  matchId: M1,
  status: "pending",
  expiresAt: new Date(NOW + 102_000).toISOString(),
  requestedBy: { id: "a", displayName: "Marco Reyes" },
  athletes: [
    { id: "a", displayName: "Marco Reyes" },
    { id: "b", displayName: "Dayo Okafor" },
  ],
  durationSeconds: 300,
};
const pending = { ok: true, data: REQUEST };
const withStatus = (status: string) => ({ ok: true, data: { ...REQUEST, status } });
/** `get_my_timekeeping_match`: the match this person is seated on as timekeeper. */
const seatedOn = (matchId: string) => ({
  ok: true,
  data: { matchId, status: "pending", startedAt: null, endedAt: null, athletes: [], reviewPending: false, editOpen: false, editClosesAt: null },
});
const OTHER_MATCH = "0c1d2e3f-4a5b-4c6d-8e7f-0000000000a2";

async function flush() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

async function open(requestId: string | null = Q1) {
  const s = render(<TimekeepSheet matchId={M1} requestId={requestId} athleteId="tk-1" />);
  await flush();
  return s;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetIncomingTimekeeperRequestsForTests();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
  mockRouter.canGoBack.mockReturnValue(true);
  mockFocus.focused = true;
  mockConsent.given = true;
  mockConsent.giveOk = true;
  mockGetRequest.mockResolvedValue(pending);
  mockLatest.mockResolvedValue({ ok: true, data: { requestId: Q1, status: "pending", inviteeId: "tk-1", inviteeName: "Jo Cruz", expiresAt: REQUEST.expiresAt } });
  mockRespond.mockResolvedValue({ ok: true, data: { matchId: M1 } });
  mockSeat.mockResolvedValue({ ok: true, data: null });
  __resetServerClockForTests();
});
afterEach(() => {
  jest.useRealTimers();
  __resetServerClockForTests();
});

const t6 = () => expect(toast.info).toHaveBeenCalledWith("This request is no longer open.");

describe("timekeep sheet", () => {
  it("from the realtime row: reads the request and asks, with the answer countdown", async () => {
    const s = await open();
    expect(mockGetRequest).toHaveBeenCalledWith(expect.anything(), Q1);
    expect(mockLatest).not.toHaveBeenCalled();
    s.getByText("Timekeep this match?");
    expect(s.getByTestId("timekeep-answer-in")).toHaveTextContent("ANSWER IN 1:42");
    // Challenger first (spec 9, board P-TK-B4).
    expect(s.getByTestId("timekeep-matchup")).toHaveTextContent(/^M\. Reyes\s*VS\s*D\. Okafor$/);
    s.getByText("You start the match, run the clock and record the result. Your rating isn't affected.");
    s.getByText("Timekeepers record the match on video. ELO RATED analyses the film with AI.");
    s.getByLabelText("Decline");
    s.getByLabelText("Accept");
    act(() => jest.advanceTimersByTime(1_000));
    expect(s.getByTestId("timekeep-answer-in")).toHaveTextContent("ANSWER IN 1:41");
  });

  it.each([
    [60_000, "ANSWER IN 2:42"],
    [-60_000, "ANSWER IN 0:42"],
  ])("TK-T5 counts on the server's clock: a phone %i ms off reads %s", async (aheadMs, text) => {
    // The Arena learned this phone's clock runs `aheadMs` ahead of the server's.
    noteServerTime(new Date(NOW - aheadMs).toISOString(), NOW, "roundtrip");
    const s = await open();
    expect(s.getByTestId("timekeep-answer-in")).toHaveTextContent(text);
  });

  it("from a push (the match only): finds the newest request sent to me, then reads it", async () => {
    await open(null);
    expect(mockLatest).toHaveBeenCalledWith(expect.anything(), M1);
    expect(mockGetRequest).toHaveBeenCalledWith(expect.anything(), Q1);
  });

  it("from a push, marks the request it found shown, so the listener never opens it again after the sheet closes", async () => {
    expect(wasTimekeepRequestShown(Q1)).toBe(false);
    await open(null);
    expect(wasTimekeepRequestShown(Q1)).toBe(true);
  });

  it("no request for me on that match: TK-T6 and close", async () => {
    mockLatest.mockResolvedValue({ ok: true, data: null });
    await open(null);
    t6();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("a malformed match id (a crafted elorated://match/x/timekeep link): TK-T6 and close, with no read and no retry", async () => {
    render(<TimekeepSheet matchId="x" requestId={null} athleteId="tk-1" />);
    await flush();
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS * 3));
    await flush();
    expect(mockLatest).not.toHaveBeenCalled();
    expect(mockGetRequest).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("a malformed request param: TK-T6 and close, with no read", async () => {
    await open("not-a-request");
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
    await flush();
    expect(mockGetRequest).not.toHaveBeenCalled();
    expect(mockLatest).not.toHaveBeenCalled();
  });

  it("a request that is already over (a lapsed push): TK-T6 and close, Home from a cold start", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    mockGetRequest.mockResolvedValue(withStatus("expired"));
    await open();
    t6();
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("Accept with consent on record seats the timekeeper and opens the match", async () => {
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    await flush();
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), Q1, true);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("consent first: Accept opens the shipped sheet; Not now leaves TK-T8 and Accept reopens it", async () => {
    mockConsent.given = false;
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    s.getByTestId("ai-consent-sheet");
    // The timekeeper's own body (jits-o47s.46), never the athlete's.
    expect(s.getByTestId("ai-consent-body")).toHaveTextContent(AI_CONSENT_COPY.timekeeperBody);
    expect(s.getByTestId("ai-consent-body")).toHaveTextContent(/^As timekeeper, you film this match\./);
    expect(s.queryByText(AI_CONSENT_COPY.body)).toBeNull();
    s.getByText(AI_CONSENT_COPY.title);
    expect(mockRespond).not.toHaveBeenCalled();
    fireEvent.press(s.getByTestId("ai-consent-not-now"));
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    expect(s.getByTestId("timekeep-consent-refused")).toHaveTextContent("You need to allow recording to timekeep.");
    fireEvent.press(s.getByLabelText("Accept"));
    s.getByTestId("ai-consent-sheet");
  });

  it("Allow and film records consent, then accepts", async () => {
    mockConsent.given = false;
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    fireEvent.press(s.getByTestId("ai-consent-allow"));
    await flush();
    expect(mockGive).toHaveBeenCalled();
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), Q1, true);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
  });

  it("leaving the consent sheet without an answer (its privacy link) hides it and sends nothing", async () => {
    mockConsent.given = false;
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    s.getByTestId("ai-consent-sheet");
    fireEvent.press(s.getByTestId("ai-consent-privacy"));
    await flush();
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    expect(mockRespond).not.toHaveBeenCalled();
    expect(mockGive).not.toHaveBeenCalled();
    // Not a refusal either: no TK-T8, and Accept asks for consent again.
    expect(s.queryByTestId("timekeep-consent-refused")).toBeNull();
    fireEvent.press(s.getByLabelText("Accept"));
    s.getByTestId("ai-consent-sheet");
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it("Decline never needs consent: without it on record, Decline answers at once with no consent sheet", async () => {
    mockConsent.given = false;
    const s = await open();
    fireEvent.press(s.getByLabelText("Decline"));
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    await flush();
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), Q1, false);
    expect(mockRespond).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("a consent that cannot be saved keeps the consent sheet with its shipped error, and sends nothing", async () => {
    mockConsent.given = false;
    mockConsent.giveOk = false;
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    fireEvent.press(s.getByTestId("ai-consent-allow"));
    await flush();
    expect(s.getByTestId("ai-consent-error")).toHaveTextContent(AI_CONSENT_COPY.failed);
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it("the server's consent_required backstop: TK-T8, and the next Accept asks for consent", async () => {
    mockRespond.mockResolvedValueOnce({ ok: false, error: { code: "CONSENT_REQUIRED", message: "x" } });
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    await flush();
    s.getByTestId("timekeep-consent-refused");
    fireEvent.press(s.getByLabelText("Accept"));
    s.getByTestId("ai-consent-sheet");
    expect(mockRespond).toHaveBeenCalledTimes(1);
  });

  it.each(["REQUEST_CLOSED", "NOT_REQUESTED", "TIMEKEEPER_BUSY", "ATHLETE_IN_TIMEKEEPER_MATCH"])("an accept refused %s: TK-T6 and close", async (code) => {
    mockRespond.mockResolvedValue({ ok: false, error: { code, message: "x" } });
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    await flush();
    t6();
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("a failed send keeps the answer available", async () => {
    mockRespond.mockRejectedValueOnce(new Error("offline"));
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    await flush();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    fireEvent.press(s.getByLabelText("Accept"));
    await flush();
    expect(mockRespond).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
  });

  it("Decline answers and closes, with no notice", async () => {
    const s = await open();
    fireEvent.press(s.getByLabelText("Decline"));
    await flush();
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), Q1, false);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("withdrawn (its realtime row): TK-T6 and close", async () => {
    await open();
    act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "cancelled", expiresAt: REQUEST.expiresAt }));
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    // Another request's row changes nothing.
    act(() => mockRowListener?.({ id: "q9", matchId: "M9", status: "cancelled", expiresAt: REQUEST.expiresAt }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("my own decline's realtime row, arriving before the reply, is not a closed request: no TK-T6, one close", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRespond.mockReturnValue(new Promise((r) => (resolve = r)));
    const s = await open();
    fireEvent.press(s.getByLabelText("Decline"));
    act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "declined", expiresAt: REQUEST.expiresAt }));
    await flush();
    expect(toast.info).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    resolve({ ok: true, data: { matchId: M1 } });
    await flush();
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), Q1, false);
    expect(toast.info).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("my own accept's realtime row is not a closed request", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRespond.mockReturnValue(new Promise((r) => (resolve = r)));
    const s = await open();
    fireEvent.press(s.getByLabelText("Accept"));
    act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "accepted", expiresAt: REQUEST.expiresAt }));
    await flush();
    expect(toast.info).not.toHaveBeenCalled();
    expect(mockSeat).not.toHaveBeenCalled();
    resolve({ ok: true, data: { matchId: M1 } });
    await flush();
    expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("lapsed while open (the countdown reaches 0:00): the server's read says expired, TK-T6 and close", async () => {
    // get_timekeeper_request reads a pending request past expires_at as expired, on the server's clock.
    mockGetRequest.mockImplementation(async () => (Date.now() >= Date.parse(REQUEST.expiresAt) ? withStatus("expired") : pending));
    await open();
    act(() => jest.advanceTimersByTime(101_000));
    await flush();
    expect(toast.info).not.toHaveBeenCalled();
    const reads = mockGetRequest.mock.calls.length;
    act(() => jest.advanceTimersByTime(1_000));
    await flush();
    // 0:00 asks the server at once (not at the next 4 s poll).
    expect(mockGetRequest.mock.calls.length).toBe(reads + 1);
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("0:00 on a phone whose clock runs ahead: the server still has it open, so the sheet stays until the server says it lapsed", async () => {
    const s = await open();
    act(() => jest.advanceTimersByTime(102_000));
    await flush();
    expect(s.getByTestId("timekeep-answer-in")).toHaveTextContent("ANSWER IN 0:00");
    s.getByLabelText("Accept");
    expect(toast.info).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    mockGetRequest.mockResolvedValue(withStatus("expired"));
    act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
    await flush();
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("a read refused NOT_REQUESTED (not sent to me): TK-T6 and close", async () => {
    mockGetRequest.mockResolvedValue({ ok: false, error: { code: "NOT_REQUESTED", message: "x" } });
    await open();
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("a read that fails for another reason keeps the sheet; the next poll tries again", async () => {
    const s = await open();
    mockGetRequest.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
    await flush();
    expect(toast.info).not.toHaveBeenCalled();
    s.getByLabelText("Accept");
  });

  it("declined on my other device (the poll sees it): TK-T6 and close", async () => {
    await open();
    mockGetRequest.mockResolvedValue(withStatus("declined"));
    act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
    await flush();
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockSeat).not.toHaveBeenCalled();
  });

  // Only the asked person can accept (respond_timekeeper_request refuses
  // anyone else): accepted, not by this sheet, means this person accepted it
  // on another device, or before the app was killed (spec 11: the push is the
  // way back to the match).
  describe("accepted, not by this sheet", () => {
    it("reopened from the push after a kill, still seated: on to the match, with no notice", async () => {
      mockGetRequest.mockResolvedValue(withStatus("accepted"));
      mockSeat.mockResolvedValue(seatedOn(M1));
      await open(null);
      expect(mockLatest).toHaveBeenCalledWith(expect.anything(), M1);
      expect(mockSeat).toHaveBeenCalledWith(expect.anything());
      expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
      // Left once: later polls do nothing more.
      act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS * 2));
      await flush();
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    });

    it("on my other device while the sheet is up (its realtime row), still seated: on to the match, with no notice", async () => {
      mockSeat.mockResolvedValue(seatedOn(M1));
      await open();
      act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "accepted", expiresAt: REQUEST.expiresAt }));
      await flush();
      expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("on my other device (the poll sees it), still seated: on to the match", async () => {
      mockSeat.mockResolvedValue(seatedOn(M1));
      await open();
      mockGetRequest.mockResolvedValue(withStatus("accepted"));
      act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
      await flush();
      expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
      expect(toast.info).not.toHaveBeenCalled();
    });

    it.each([
      ["no longer seated (left before the start, or the match is over past its edit window)", { ok: true, data: null }],
      ["seated on another match", seatedOn(OTHER_MATCH)],
    ])("from the push, but %s: TK-T6 and close", async (_label, seat) => {
      mockGetRequest.mockResolvedValue(withStatus("accepted"));
      mockSeat.mockResolvedValue(seat);
      await open(null);
      t6();
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it("its realtime row, but no longer seated: TK-T6 and close", async () => {
      await open();
      act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "accepted", expiresAt: REQUEST.expiresAt }));
      await flush();
      t6();
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it("a seat read that fails keeps the sheet, with no notice; the next poll asks again", async () => {
      mockGetRequest.mockResolvedValue(withStatus("accepted"));
      mockSeat.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } }).mockResolvedValue(seatedOn(M1));
      await open(null);
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.back).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(TIMEKEEP_SHEET_POLL_MS));
      await flush();
      expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
    });

    it("under another screen it never pops that screen: it opens the match once it is back on top", async () => {
      mockSeat.mockResolvedValue(seatedOn(M1));
      const s = await open();
      mockFocus.focused = false;
      s.rerender(<TimekeepSheet matchId={M1} requestId={Q1} athleteId="tk-1" />);
      act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "accepted", expiresAt: REQUEST.expiresAt }));
      await flush();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.back).not.toHaveBeenCalled();
      mockFocus.focused = true;
      s.rerender(<TimekeepSheet matchId={M1} requestId={Q1} athleteId="tk-1" />);
      await flush();
      expect(mockRouter.replace).toHaveBeenCalledWith(`/match/${M1}`);
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(toast.info).not.toHaveBeenCalled();
    });
  });

  it("under another screen it never pops that screen: it closes with TK-T6 once it is back on top", async () => {
    const s = await open();
    mockFocus.focused = false;
    s.rerender(<TimekeepSheet matchId={M1} requestId={Q1} athleteId="tk-1" />);
    act(() => mockRowListener?.({ id: Q1, matchId: M1, status: "expired", expiresAt: REQUEST.expiresAt }));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    mockFocus.focused = true;
    s.rerender(<TimekeepSheet matchId={M1} requestId={Q1} athleteId="tk-1" />);
    t6();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("marks itself open while it is up (the Arena holds the challenge prompt), and shown", async () => {
    const s = await open();
    expect(isTimekeepSheetOpen()).toBe(true);
    expect(isTimekeepSheetOpenFor(M1)).toBe(true);
    expect(wasTimekeepRequestShown(Q1)).toBe(true);
    s.unmount();
    expect(isTimekeepSheetOpen()).toBe(false);
  });

  it("is never a match screen: the asked person stays in the Arena (no useArenaMatchScreen)", async () => {
    const s = await open();
    expect(isInArenaMatch()).toBe(false);
    s.unmount();
    expect(isInArenaMatch()).toBe(false);
  });
});
