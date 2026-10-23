/**
 * The asked person's realtime listener (timekeeper mode M2, spec 4.2 Pick,
 * 9.1, 14.8 M2): a new request sent to the signed-in athlete opens the
 * timekeep sheet at once, unless the challenge prompt, a blocked start's
 * sheet or a match screen is up (`held`), another timekeep sheet is open, or
 * the app is in the background; then it waits and opens once released, only
 * if the request is still open (`get_timekeeper_request`). A request whose
 * sheet was already shown never opens again. Rows are published to the open
 * sheet. A missed row (app suspended, channel down) is caught up on every
 * (re)subscribe and on the return to the foreground; while live, a lost
 * channel keeps rebuilding and going live restarts one that gave up.
 */
import * as React from "react";
import { act, render, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

type Handler = (payload: { eventType: string; new: Record<string, unknown> }) => void;
const mockChannels: { topic: string; filter: Record<string, unknown>; handler: Handler }[] = [];
const mockSubscribers: ((status: string) => void)[] = [];
const mockRemove = jest.fn();
jest.mock("@/lib/supabase/client", () => {
  const registered: unknown[] = [];
  return {
    supabase: {
      channel: (topic: string) => {
        const chan: Record<string, unknown> = {};
        chan.on = (_e: string, filter: Record<string, unknown>, handler: Handler) => {
          mockChannels.push({ topic, filter, handler });
          return chan;
        };
        chan.subscribe = (cb: (status: string) => void) => {
          mockSubscribers.push(cb);
          return chan;
        };
        registered.push(chan);
        return chan;
      },
      getChannels: () => registered,
      removeChannel: (c: unknown) => {
        mockRemove(c);
        return Promise.resolve();
      },
    },
  };
});
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
const mockGetRequest = jest.fn();
const mockIncoming = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperRequest: (...a: unknown[]) => mockGetRequest(...a),
  getIncomingTimekeeperRequest: (...a: unknown[]) => mockIncoming(...a),
}));
/** The real supervisor, with its options and `resume()` calls recorded. */
const mockSupervise: { options: { keepRetrying?: () => boolean }[]; resume: jest.Mock } = { options: [], resume: jest.fn() };
jest.mock("@/lib/supabase/supervise-channel", () => {
  const actual = jest.requireActual("@/lib/supabase/supervise-channel");
  return {
    ...actual,
    superviseChannel: (label: string, build: () => unknown, onSubscribed: (r: boolean) => void, options: { keepRetrying?: () => boolean }) => {
      mockSupervise.options.push(options);
      const stop = actual.superviseChannel(label, build, onSubscribed, options);
      const wrapped = () => stop();
      wrapped.resume = () => {
        mockSupervise.resume();
        stop.resume();
      };
      return wrapped;
    },
  };
});

import {
  __resetIncomingTimekeeperRequestsForTests,
  subscribeIncomingTimekeeperRequests,
  timekeepHref,
  useIncomingTimekeeperRequests,
} from "@/lib/match-flow/use-incoming-timekeeper-requests";
import {
  isTimekeepSheetOpenFor,
  markTimekeepRequestShown,
  useIsTimekeepSheetOpen,
  useTimekeepSheetScreen,
} from "@/lib/match-flow/timekeep-sheet-store";
import { __resetServerClockForTests, noteServerTime } from "@/lib/arena/incoming-challenges";

const ME = "b0000000-0000-4000-8000-000000000001";
const M1 = "c0000000-0000-4000-8000-000000000001";
const soon = () => new Date(Date.now() + 120_000).toISOString();
const row = (id: string, status = "pending", expiresAt = soon()) => ({
  id,
  match_id: M1,
  status,
  expires_at: expiresAt,
  invitee_id: ME,
  requested_by: "a",
});

let appStateHandlers: ((s: string) => void)[] = [];

function deliver(eventType: "INSERT" | "UPDATE", r: Record<string, unknown>) {
  act(() => mockChannels[mockChannels.length - 1].handler({ eventType, new: r }));
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setImmediate(r));
  });
}

function listen(held = false, live = false) {
  return renderHook(
    ({ h, l }: { h: boolean; l: boolean }) => useIncomingTimekeeperRequests({ athleteId: ME, held: h, live: l }),
    { initialProps: { h: held, l: live } },
  );
}

/** The channel reports SUBSCRIBED (its first join, or a rejoin). */
function subscribed() {
  act(() => mockSubscribers[mockSubscribers.length - 1]("SUBSCRIBED"));
}

const pendingFor = (id: string, expiresAt = soon()) => ({ ok: true, data: { requestId: id, matchId: M1, expiresAt } });

/** A mounted timekeep sheet (the route's component marks itself open). */
function Sheet({ requestId, matchId = M1 }: { requestId: string | null; matchId?: string }) {
  useTimekeepSheetScreen(matchId, requestId);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChannels.length = 0;
  mockSubscribers.length = 0;
  mockSupervise.options = [];
  appStateHandlers = [];
  __resetIncomingTimekeeperRequestsForTests();
  (AppState as unknown as { currentState: string }).currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return { remove: jest.fn() };
  }) as never);
  mockGetRequest.mockResolvedValue({ ok: true, data: { status: "pending" } });
  mockIncoming.mockResolvedValue({ ok: true, data: null });
  __resetServerClockForTests();
});
afterEach(() => {
  jest.restoreAllMocks();
  __resetServerClockForTests();
});

/** The Arena learned that this phone's clock runs `ms` ahead of the server's (negative: behind). */
function deviceAheadBy(ms: number) {
  const now = Date.now();
  noteServerTime(new Date(now - ms).toISOString(), now, "roundtrip");
}

describe("useIncomingTimekeeperRequests", () => {
  it("listens to the requests sent to this athlete, on one channel", () => {
    listen();
    expect(mockChannels).toHaveLength(1);
    expect(mockChannels[0].filter).toEqual({
      event: "*",
      schema: "public",
      table: "match_timekeeper_requests",
      filter: `invitee_id=eq.${ME}`,
    });
  });

  it("a new request opens the timekeep sheet at once, with its id", () => {
    listen();
    deliver("INSERT", row("q1"));
    expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q1`);
    expect(timekeepHref(M1)).toBe(`/match/${M1}/timekeep`);
  });

  it("an already lapsed request opens nothing", () => {
    listen();
    deliver("INSERT", row("q1", "pending", new Date(Date.now() - 1_000).toISOString()));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("held by the challenge prompt: waits, then opens once released if the request is still open", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    expect(mockPush).not.toHaveBeenCalled();
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockGetRequest).toHaveBeenCalledWith(expect.anything(), "q1");
    expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q1`);
  });

  it("on a phone whose clock runs ahead, a request the server still holds open opens", () => {
    deviceAheadBy(60_000);
    listen();
    // 30 s past on this phone's clock, 30 s left on the server's.
    deliver("INSERT", row("q1", "pending", new Date(Date.now() - 30_000).toISOString()));
    expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q1`);
  });

  it("on a phone whose clock runs behind, a request already lapsed on the server opens nothing", () => {
    deviceAheadBy(-60_000);
    listen();
    // 30 s left on this phone's clock, 30 s past on the server's.
    deliver("INSERT", row("q1", "pending", new Date(Date.now() + 30_000).toISOString()));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("held again while the check is in flight: nothing opens until it is released again", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    let resolve: (v: unknown) => void = () => undefined;
    mockGetRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    h.rerender({ h: false, l: false });
    expect(mockGetRequest).toHaveBeenCalledTimes(1);
    // A new challenge prompt comes up before the read answers.
    h.rerender({ h: true, l: false });
    await act(async () => {
      resolve({ ok: true, data: { status: "pending" } });
    });
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q1`);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("held, then the request closed meanwhile: nothing opens", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    mockGetRequest.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("held, and its row says it ended: dropped without a read", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    deliver("UPDATE", row("q1", "cancelled"));
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockGetRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a pending UPDATE row is not a new request: it neither opens a sheet nor waits to open one", async () => {
    const h = listen(true);
    deliver("UPDATE", row("q1"));
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockGetRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    deliver("UPDATE", row("q2"));
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a request whose sheet was shown while its check was in flight never opens again (at most once)", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    let resolve: (v: unknown) => void = () => undefined;
    mockGetRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    h.rerender({ h: false, l: false });
    expect(mockGetRequest).toHaveBeenCalledTimes(1);
    act(() => markTimekeepRequestShown("q1"));
    await act(async () => {
      resolve({ ok: true, data: { status: "pending" } });
    });
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a failed check keeps it waiting for the next trigger", async () => {
    const h = listen(true);
    deliver("INSERT", row("q1"));
    mockGetRequest.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    h.rerender({ h: false, l: false });
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
    act(() => appStateHandlers.forEach((fn) => fn("active")));
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("while a timekeep sheet is open a new request waits, and opens after the sheet closes", async () => {
    const sheet = render(<Sheet requestId="q0" />);
    listen();
    deliver("INSERT", row("q1"));
    expect(mockPush).not.toHaveBeenCalled();
    sheet.unmount();
    await flush();
    expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q1`);
  });

  it("a request whose sheet was already shown (from its push) never opens again", async () => {
    const sheet = render(<Sheet requestId="q1" />);
    listen();
    deliver("INSERT", row("q1"));
    sheet.unmount();
    await flush();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("opens each request once, even if its row arrives twice", () => {
    listen();
    deliver("INSERT", row("q1"));
    deliver("INSERT", row("q1"));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("in the background it waits for the return to the foreground", async () => {
    listen();
    (AppState as unknown as { currentState: string }).currentState = "background";
    deliver("INSERT", row("q1"));
    expect(mockPush).not.toHaveBeenCalled();
    (AppState as unknown as { currentState: string }).currentState = "active";
    act(() => appStateHandlers.forEach((fn) => fn("active")));
    await flush();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("publishes every row to the open sheet", () => {
    const seen: string[] = [];
    const off = subscribeIncomingTimekeeperRequests((r) => seen.push(`${r.id}:${r.status}`));
    listen();
    deliver("INSERT", row("q1"));
    deliver("UPDATE", row("q1", "cancelled"));
    off();
    expect(seen).toEqual(["q1:pending", "q1:cancelled"]);
  });

  describe("missed rows", () => {
    it("on subscribe, a pending request sent to me that no row delivered opens its sheet (an app opened from its icon)", async () => {
      mockIncoming.mockResolvedValue(pendingFor("q7"));
      listen();
      expect(mockIncoming).not.toHaveBeenCalled();
      subscribed();
      await flush();
      expect(mockIncoming).toHaveBeenCalledWith(expect.anything(), ME);
      expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q7`);
    });

    it("on a rejoin after the channel was down, too", async () => {
      listen();
      subscribed();
      await flush();
      expect(mockPush).not.toHaveBeenCalled();
      mockIncoming.mockResolvedValue(pendingFor("q8"));
      subscribed();
      await flush();
      expect(mockIncoming).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q8`);
    });

    it("on the return to the foreground (an INSERT that landed while suspended)", async () => {
      listen();
      mockIncoming.mockResolvedValue(pendingFor("q9"));
      act(() => appStateHandlers.forEach((fn) => fn("active")));
      await flush();
      expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q9`);
    });

    it("never reopens a request whose sheet was shown, nor one that lapsed", async () => {
      const sheet = render(<Sheet requestId="q7" />);
      sheet.unmount();
      mockIncoming.mockResolvedValue(pendingFor("q7"));
      listen();
      subscribed();
      await flush();
      mockIncoming.mockResolvedValue(pendingFor("q8", new Date(Date.now() - 1_000).toISOString()));
      act(() => appStateHandlers.forEach((fn) => fn("active")));
      await flush();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("a caught-up request waits while held, like a row", async () => {
      mockIncoming.mockResolvedValue(pendingFor("q7"));
      const h = listen(true);
      subscribed();
      await flush();
      expect(mockPush).not.toHaveBeenCalled();
      h.rerender({ h: false, l: false });
      await flush();
      expect(mockPush).toHaveBeenCalledWith(`/match/${M1}/timekeep?request=q7`);
    });

    it("a failed catch-up read opens nothing", async () => {
      mockIncoming.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
      listen();
      subscribed();
      await flush();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("while live a lost channel keeps rebuilding, and going live restarts one that gave up", () => {
    const h = listen(false, false);
    const { keepRetrying } = mockSupervise.options[0];
    expect(keepRetrying?.()).toBe(false);
    expect(mockSupervise.resume).not.toHaveBeenCalled();
    h.rerender({ h: false, l: true });
    expect(keepRetrying?.()).toBe(true);
    expect(mockSupervise.resume).toHaveBeenCalledTimes(1);
  });

  it("removes its channel on unmount (sign-out, athlete switch)", () => {
    const h = listen();
    h.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

describe("the timekeep sheet store", () => {
  it("is open while a sheet is mounted, counting overlapping sheets, by match", () => {
    const probe = renderHook(() => useIsTimekeepSheetOpen());
    expect(probe.result.current).toBe(false);
    const a = render(<Sheet requestId={null} />);
    const b = render(<Sheet requestId={null} />);
    expect(probe.result.current).toBe(true);
    expect(isTimekeepSheetOpenFor(M1)).toBe(true);
    expect(isTimekeepSheetOpenFor("another-match")).toBe(false);
    a.unmount();
    expect(probe.result.current).toBe(true);
    expect(isTimekeepSheetOpenFor(M1)).toBe(true);
    b.unmount();
    expect(probe.result.current).toBe(false);
    expect(isTimekeepSheetOpenFor(M1)).toBe(false);
  });
});
