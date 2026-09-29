/**
 * The app-wide "open match" store (F10): Home's Resume card and the header
 * chip's CONFIRM marker read one value, refreshed by one owner.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

const mockGetMyActiveMatch = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMyActiveMatch: (...a: unknown[]) => mockGetMyActiveMatch(...a),
}));
interface MockChannel {
  topic: string;
  filter: Record<string, string> | null;
  handler: (() => void) | null;
  subscribed: boolean;
  status: ((s: string) => void) | null;
  instance: unknown;
}
const mockChannels: MockChannel[] = [];
/** What `getChannels()` reports: removed or server-closed ones drop out. */
const mockRegistry = new Set<unknown>();
const mockRemoveChannel = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const record: MockChannel = {
        topic,
        filter: null,
        handler: null,
        subscribed: false,
        status: null,
        instance: null,
      };
      mockChannels.push(record);
      const channel = {
        on(_type: string, filter: Record<string, string>, handler: () => void) {
          record.filter = filter;
          record.handler = handler;
          return channel;
        },
        subscribe(cb?: (s: string) => void) {
          record.subscribed = true;
          record.status = cb ?? null;
          return channel;
        },
        record,
      };
      record.instance = channel;
      mockRegistry.add(channel);
      return channel;
    },
    getChannels: () => [...mockRegistry],
    removeChannel: (channel: { record: MockChannel }) => {
      channel.record.subscribed = false;
      mockRegistry.delete(channel);
      mockRemoveChannel(channel.record.topic);
      return Promise.resolve("ok");
    },
  },
}));

/** The server closing a channel: out of the registry, then CLOSED. */
function mockServerClose(record: MockChannel) {
  mockRegistry.delete(record.instance);
  record.subscribed = false;
  record.status?.("CLOSED");
}

import {
  __resetActiveMatchStoreForTests,
  isResultToConfirm,
  refreshMyActiveMatch,
  useActiveMatch,
  useActiveMatchOwner,
  useMatchToConfirm,
} from "@/lib/match-flow/active-match-store";
import {
  __resetArenaStoreForTests,
  IDLE_ARENA_STATE,
  publishArenaState,
  useArenaMatchScreen,
  useIsArenaLive,
} from "@/lib/arena/arena-store";

const ME = "me-1";
const OPEN = { matchId: "m-1", status: "in_progress" as const, opponentName: "Rival" };

let appStateHandlers: ((s: AppStateStatus) => void)[] = [];
/** Every registered AppState listener (the owner's and a supervisor's). */
let appStateHandler: ((s: AppStateStatus) => void) | null = null;

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChannels.length = 0;
  mockRegistry.clear();
  __resetActiveMatchStoreForTests();
  __resetArenaStoreForTests();
  mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: null });
  appStateHandlers = [];
  appStateHandler = (s) => {
    for (const h of [...appStateHandlers]) h(s);
  };
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event: string, handler: unknown) => {
      const h = handler as (s: AppStateStatus) => void;
      appStateHandlers.push(h);
      return {
        remove: jest.fn(() => {
          appStateHandlers = appStateHandlers.filter((x) => x !== h);
        }),
      } as never;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("active match store", () => {
  it("the owner reads on mount and every reader sees the result", async () => {
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    renderHook(() => useActiveMatchOwner(ME));
    const home = renderHook(() => useActiveMatch(ME));
    const chip = renderHook(() => useMatchToConfirm(ME));

    await waitFor(() => expect(home.result.current).toEqual(OPEN));
    expect(chip.result.current).toEqual(OPEN);
    expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(1);
    expect(mockGetMyActiveMatch.mock.calls[0][1]).toBe(ME);
  });

  it("collapses requests made in the same tick into one read", async () => {
    act(() => {
      refreshMyActiveMatch(ME);
      refreshMyActiveMatch(ME);
      refreshMyActiveMatch(ME);
    });
    await act(flush);
    expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(1);
  });

  it("re-reads on every match exit, excluding the match just left", async () => {
    renderHook(() => useActiveMatchOwner(ME));
    await act(flush);
    const id = "99999999-9999-4999-8999-999999999999";
    const match = renderHook(() => useArenaMatchScreen(id));
    act(() => match.unmount());
    await act(flush);

    expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(2);
    expect(mockGetMyActiveMatch.mock.calls[1][3]).toEqual([id]);
  });

  it("re-reads on a return from the background, not on inactive", async () => {
    renderHook(() => useActiveMatchOwner(ME));
    await act(flush);
    act(() => {
      appStateHandler?.("inactive");
      appStateHandler?.("active");
    });
    await act(flush);
    expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(1);

    act(() => {
      appStateHandler?.("background");
      appStateHandler?.("active");
    });
    await act(flush);
    expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(2);
  });

  it("keeps what it had when a read fails", async () => {
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    const { result } = renderHook(() => useActiveMatch(ME));
    act(() => refreshMyActiveMatch(ME));
    await waitFor(() => expect(result.current).toEqual(OPEN));

    mockGetMyActiveMatch.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    expect(result.current).toEqual(OPEN);
  });

  it("keeps what it had when a read rejects, and a later read still writes", async () => {
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    const { result } = renderHook(() => useActiveMatch(ME));
    act(() => refreshMyActiveMatch(ME));
    await waitFor(() => expect(result.current).toEqual(OPEN));

    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    try {
      mockGetMyActiveMatch.mockRejectedValueOnce(new Error("network"));
      act(() => refreshMyActiveMatch(ME));
      await act(flush);
      await new Promise((r) => setImmediate(r));
      expect(result.current).toEqual(OPEN);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }

    // Not wedged: the next read writes.
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: null });
    act(() => refreshMyActiveMatch(ME));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("only the newest read writes", async () => {
    let releaseOld!: (v: unknown) => void;
    mockGetMyActiveMatch.mockImplementationOnce(() => new Promise((r) => (releaseOld = r)));
    const { result } = renderHook(() => useActiveMatch(ME));
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: null });
    act(() => refreshMyActiveMatch(ME));
    await act(flush);

    await act(async () => {
      releaseOld({ ok: true, data: OPEN });
      await flush();
    });
    expect(result.current).toBeNull();
  });

  it("an older good read still writes when a newer read fails first", async () => {
    // Realtime UPDATE read (slow) then a focus read that fails: the good
    // older result must not be thrown away, or CONFIRM stays up stale.
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    const { result } = renderHook(() => useActiveMatch(ME));
    act(() => refreshMyActiveMatch(ME));
    await waitFor(() => expect(result.current).toEqual(OPEN));

    let releaseOld!: (v: unknown) => void;
    mockGetMyActiveMatch.mockImplementationOnce(() => new Promise((r) => (releaseOld = r)));
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    mockGetMyActiveMatch.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    expect(result.current).toEqual(OPEN);

    await act(async () => {
      releaseOld({ ok: true, data: null });
      await flush();
    });
    expect(result.current).toBeNull();
  });

  it("an older read for a previous athlete never writes after a newer one for someone else", async () => {
    let releaseOld!: (v: unknown) => void;
    mockGetMyActiveMatch.mockImplementationOnce(() => new Promise((r) => (releaseOld = r)));
    act(() => refreshMyActiveMatch("previous-athlete"));
    await act(flush);
    mockGetMyActiveMatch.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    act(() => refreshMyActiveMatch(ME));
    await act(flush);

    const previous = renderHook(() => useActiveMatch("previous-athlete"));
    await act(async () => {
      releaseOld({ ok: true, data: OPEN });
      await flush();
    });
    expect(previous.result.current).toBeNull();
  });

  it("a read issued before a sign-out clear never writes after it", async () => {
    let releaseOld!: (v: unknown) => void;
    mockGetMyActiveMatch.mockImplementationOnce(() => new Promise((r) => (releaseOld = r)));
    const { result } = renderHook(() => useActiveMatch(ME));
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    act(() => refreshMyActiveMatch(null));
    await act(async () => {
      releaseOld({ ok: true, data: OPEN });
      await flush();
    });
    expect(result.current).toBeNull();
  });

  it("never shows one athlete's match to another, and clears when the owner unmounts", async () => {
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    const owner = renderHook(() => useActiveMatchOwner(ME));
    const other = renderHook(() => useActiveMatch("someone-else"));
    const chip = renderHook(() => useMatchToConfirm(ME));
    await waitFor(() => expect(chip.result.current).toEqual(OPEN));
    expect(other.result.current).toBeNull();

    act(() => owner.unmount());
    expect(chip.result.current).toBeNull();
  });

  it("CONFIRM never shows a match read for another athlete (no owner mounted)", async () => {
    // Home can write the store while no owner is mounted (the athlete is not
    // ACTIVE yet); a different athlete signing in must not inherit it.
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    act(() => refreshMyActiveMatch("previous-athlete"));
    const previous = renderHook(() => useMatchToConfirm("previous-athlete"));
    await waitFor(() => expect(previous.result.current).toEqual(OPEN));

    const next = renderHook(() => useMatchToConfirm(ME));
    expect(next.result.current).toBeNull();
    const signedOut = renderHook(() => useMatchToConfirm(null));
    expect(signedOut.result.current).toBeNull();
  });

  it("CONFIRM is only an in-progress match; a pending one is Resume, not CONFIRM", async () => {
    // `pending`: an accepted challenge nobody has begun. No result exists.
    const PENDING = { matchId: "m-2", status: "pending" as const, opponentName: "Rival" };
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: PENDING });
    renderHook(() => useActiveMatchOwner(ME));
    const home = renderHook(() => useActiveMatch(ME));
    const chip = renderHook(() => useMatchToConfirm(ME));
    await waitFor(() => expect(home.result.current).toEqual(PENDING));
    expect(chip.result.current).toBeNull();
    expect(isResultToConfirm(PENDING)).toBe(false);
    expect(isResultToConfirm(OPEN)).toBe(true);
    expect(isResultToConfirm(null)).toBe(false);

    // Once it is under way, it is.
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: { ...PENDING, status: "in_progress" } });
    act(() => refreshMyActiveMatch(ME));
    await waitFor(() => expect(chip.result.current?.matchId).toBe("m-2"));
  });

  it("re-reads when the held match changes in realtime, and only while one is held", async () => {
    renderHook(() => useActiveMatchOwner(ME));
    await act(flush);
    // Nothing held: no channel.
    expect(mockChannels).toHaveLength(0);

    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    act(() => refreshMyActiveMatch(ME));
    await act(flush);
    const live = mockChannels.filter((c) => c.subscribed);
    expect(live).toHaveLength(1);
    expect(live[0].filter).toEqual(
      expect.objectContaining({ event: "UPDATE", table: "matches", filter: `id=eq.${OPEN.matchId}` }),
    );

    // The opponent recorded the result from their phone: completed, so the
    // read comes back empty and CONFIRM clears.
    const chip = renderHook(() => useMatchToConfirm(ME));
    expect(chip.result.current).toEqual(OPEN);
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: null });
    act(() => live[0].handler?.());
    await act(flush);
    expect(chip.result.current).toBeNull();
    expect(mockRemoveChannel).toHaveBeenCalledWith(live[0].topic);
    expect(mockChannels.filter((c) => c.subscribed)).toHaveLength(0);
  });

  it("rebuilds the held match's channel after a server close and re-reads what it missed", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
      renderHook(() => useActiveMatchOwner(ME));
      await act(flush);
      expect(mockChannels).toHaveLength(1);
      const first = mockChannels[0];
      // The first join follows the read that found the match: no re-read.
      act(() => first.status?.("SUBSCRIBED"));
      await act(flush);
      expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(1);

      // The server closes it (jits-fa9x): rebuilt after the first backoff.
      act(() => mockServerClose(first));
      expect(mockChannels).toHaveLength(1);
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(mockChannels).toHaveLength(2);
      const second = mockChannels[1];
      expect(second.filter).toEqual(expect.objectContaining({ filter: `id=eq.${OPEN.matchId}` }));

      // The opponent recorded the result while it was down: the rejoin's
      // re-read catches it and CONFIRM clears.
      const chip = renderHook(() => useMatchToConfirm(ME));
      expect(chip.result.current).toEqual(OPEN);
      mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: null });
      act(() => second.status?.("SUBSCRIBED"));
      await act(flush);
      expect(mockGetMyActiveMatch).toHaveBeenCalledTimes(2);
      expect(chip.result.current).toBeNull();
      // Nothing held any more: the rebuilt channel is released too.
      expect(mockRemoveChannel).toHaveBeenCalledWith(second.topic);
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  it("going live restarts a held match's channel that gave up while offline (no foreground comes)", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
      renderHook(() => useActiveMatchOwner(ME));
      await act(flush);
      expect(mockChannels).toHaveLength(1);

      // Offline: four quick server closes, then the fifth gives up.
      for (const delay of [1_000, 5_000, 15_000, 30_000]) {
        act(() => mockServerClose(mockChannels[mockChannels.length - 1]));
        act(() => {
          jest.advanceTimersByTime(delay);
        });
      }
      expect(mockChannels).toHaveLength(5);
      act(() => mockServerClose(mockChannels[4]));
      act(() => {
        jest.advanceTimersByTime(10 * 60_000);
      });
      expect(mockChannels).toHaveLength(5);

      // Going live (the phone is now held awake): the channel comes back.
      act(() => publishArenaState({ ...IDLE_ARENA_STATE, isLive: true }));
      expect(mockChannels).toHaveLength(6);
      expect(mockChannels[5].filter).toEqual(
        expect.objectContaining({ filter: `id=eq.${OPEN.matchId}` }),
      );

      // While live it no longer gives up past the table: it retries at 30s.
      for (const delay of [1_000, 5_000, 15_000, 30_000, 30_000]) {
        act(() => mockServerClose(mockChannels[mockChannels.length - 1]));
        act(() => {
          jest.advanceTimersByTime(delay);
        });
      }
      expect(mockChannels).toHaveLength(11);
    } finally {
      warn.mockRestore();
      jest.useRealTimers();
    }
  });

  it("a pending result never changes live state", async () => {
    mockGetMyActiveMatch.mockResolvedValue({ ok: true, data: OPEN });
    renderHook(() => useActiveMatchOwner(ME));
    const live = renderHook(() => useIsArenaLive());
    const chip = renderHook(() => useMatchToConfirm(ME));
    await waitFor(() => expect(chip.result.current).toEqual(OPEN));
    expect(live.result.current).toBe(false);
  });
});
