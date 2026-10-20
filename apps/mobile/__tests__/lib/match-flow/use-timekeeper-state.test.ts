/**
 * `useTimekeeperState` (lib/match-flow/use-timekeeper-state.ts): the
 * timekeeper-mode state read (`get_timekeeper_match_state`) for the wizard
 * (TEST-PLAN 3.2, M1): re-read on a realtime row, on the 4 s poll, on the
 * return to the foreground and on demand; a two-athlete match
 * (`not_timekeeper_mode`) yields null; a former timekeeper (NOT_PARTICIPANT)
 * is reported as lost access (TK-K17); disabled reads nothing; one read in
 * flight and a stale response never wins.
 */
import { AppState } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

interface MockChannel {
  topic: string;
  bindings: unknown[];
  handlers: (() => void)[];
  status: ((s: string) => void) | null;
}
const mockRealtime: { built: MockChannel[]; registry: Set<unknown> } = { built: [], registry: new Set() };
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const chan: Record<string, unknown> & MockChannel = { topic, bindings: [], handlers: [], status: null };
      chan.on = (_e: string, binding: unknown, handler: () => void) => {
        chan.bindings.push(binding);
        chan.handlers.push(handler);
        return chan;
      };
      chan.subscribe = (cb?: (s: string) => void) => {
        chan.status = cb ?? null;
        return chan;
      };
      mockRealtime.built.push(chan);
      mockRealtime.registry.add(chan);
      return chan;
    },
    getChannels: () => [...mockRealtime.registry],
    removeChannel: async (chan: unknown) => {
      mockRealtime.registry.delete(chan);
    },
  },
}));

const mockGetState = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  getTimekeeperMatchState: (...a: unknown[]) => mockGetState(...a),
}));

import {
  TIMEKEEPER_STATE_POLL_MS,
  timekeeperStatePollMs,
  useTimekeeperState,
} from "@/lib/match-flow/use-timekeeper-state";

const STATE = (n: number) => ({ ready: [], startBlockers: [], marker: n });

let appStateHandlers: ((s: string) => void)[] = [];

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
}

function setup(enabled = true, pollMs: number | null = TIMEKEEPER_STATE_POLL_MS, matchId = "M1") {
  return renderHook(
    (p: { enabled: boolean; pollMs: number | null; matchId: string }) => useTimekeeperState(p),
    { initialProps: { enabled, pollMs, matchId } },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRealtime.built = [];
  mockRealtime.registry.clear();
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return { remove: jest.fn() };
  }) as never);
  mockGetState.mockResolvedValue({ ok: true, data: STATE(1) });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useTimekeeperState: reads", () => {
  it("reads the match's state on mount", async () => {
    const { result } = setup();
    await flush();
    expect(mockGetState).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(result.current.state).toEqual(STATE(1));
    expect(result.current.lostAccess).toBe(false);
  });

  it("a two-athlete match (not_timekeeper_mode) yields null", async () => {
    mockGetState.mockResolvedValue({ ok: true, data: null });
    const { result } = setup();
    await flush();
    expect(result.current.state).toBeNull();
  });

  it("reads nothing and opens nothing while disabled (a two-athlete match)", async () => {
    const { result } = setup(false);
    await flush();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    act(() => result.current.refresh());
    await flush();
    expect(mockGetState).not.toHaveBeenCalled();
    expect(mockRealtime.built).toHaveLength(0);
    expect(appStateHandlers).toHaveLength(0);
    expect(result.current.state).toBeNull();
  });

  it("re-reads when a timekeeper-mode row of this match changes", async () => {
    setup();
    await flush();
    const chan = mockRealtime.built[0];
    expect(chan.topic).toMatch(/^timekeeper-state:M1:\d+$/);
    expect(chan.bindings).toEqual(
      ["match_ready", "match_timekeeper_requests", "match_timekeeper_weight_checks"].map((table) => ({
        event: "*",
        schema: "public",
        table,
        filter: "match_id=eq.M1",
      })),
    );
    mockGetState.mockClear();
    mockGetState.mockResolvedValue({ ok: true, data: STATE(2) });
    act(() => chan.handlers[1]());
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("re-reads on the 4 s poll", async () => {
    setup();
    await flush();
    mockGetState.mockClear();
    for (let i = 0; i < 3; i++) {
      act(() => {
        jest.advanceTimersByTime(TIMEKEEPER_STATE_POLL_MS);
      });
      await flush();
    }
    expect(mockGetState).toHaveBeenCalledTimes(3);
  });

  it("does not poll when the step needs no poll", async () => {
    setup(true, null);
    await flush();
    mockGetState.mockClear();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await flush();
    expect(mockGetState).not.toHaveBeenCalled();
  });

  it("re-reads on the return to the foreground, and pauses the poll in the background", async () => {
    setup();
    await flush();
    mockGetState.mockClear();
    act(() => appStateHandlers.forEach((h) => h("background")));
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    await flush();
    expect(mockGetState).not.toHaveBeenCalled();
    act(() => appStateHandlers.forEach((h) => h("active")));
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("re-reads on demand (refresh)", async () => {
    const { result } = setup();
    await flush();
    mockGetState.mockClear();
    act(() => result.current.refresh());
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("re-reads after its channel is rebuilt following a server close (jits-fa9x)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    setup();
    await flush();
    const first = mockRealtime.built[0];
    act(() => first.status?.("SUBSCRIBED"));
    mockRealtime.registry.delete(first);
    act(() => first.status?.("CLOSED"));
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockRealtime.built).toHaveLength(2);
    mockGetState.mockClear();
    act(() => mockRealtime.built[1].status?.("SUBSCRIBED"));
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("useTimekeeperState: results", () => {
  it("reports lost access for NOT_PARTICIPANT (a timekeeper no longer seated, TK-K17)", async () => {
    mockGetState.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "x" } });
    const { result } = setup();
    await flush();
    expect(result.current.lostAccess).toBe(true);
  });

  it("keeps the last state on any other failure", async () => {
    const { result } = setup();
    await flush();
    mockGetState.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    act(() => result.current.refresh());
    await flush();
    expect(result.current.state).toEqual(STATE(1));
    expect(result.current.lostAccess).toBe(false);
  });

  it("survives a read that throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetState.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();
    await flush();
    expect(result.current.state).toBeNull();
    act(() => result.current.refresh());
    await flush();
    expect(result.current.state).toEqual(STATE(1));
    warn.mockRestore();
  });

  it("keeps one read in flight and runs one trailing read; the newest answer wins", async () => {
    let release: (v: unknown) => void = () => {};
    mockGetState.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    const { result } = setup();
    act(() => {
      result.current.refresh();
      result.current.refresh();
    });
    expect(mockGetState).toHaveBeenCalledTimes(1);
    mockGetState.mockResolvedValue({ ok: true, data: STATE(3) });
    await act(async () => {
      release({ ok: true, data: STATE(2) });
    });
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual(STATE(3));
  });

  it("starts from nothing for another match", async () => {
    const { result, rerender } = setup();
    await flush();
    expect(result.current.state).toEqual(STATE(1));
    mockGetState.mockImplementation(() => new Promise(() => {}));
    rerender({ enabled: true, pollMs: TIMEKEEPER_STATE_POLL_MS, matchId: "M2" });
    expect(result.current.state).toBeNull();
    expect(mockGetState).toHaveBeenLastCalledWith(expect.anything(), "M2");
  });

  it("drops a late read of the previous match, then reads the new one", async () => {
    let release: (v: unknown) => void = () => {};
    mockGetState.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    const { result, rerender } = setup();
    mockGetState.mockResolvedValue({ ok: true, data: STATE(9) });
    rerender({ enabled: true, pollMs: TIMEKEEPER_STATE_POLL_MS, matchId: "M2" });
    await act(async () => {
      release({ ok: true, data: STATE(1) });
    });
    await flush();
    expect(result.current.state).toEqual(STATE(9));
    expect(mockGetState).toHaveBeenLastCalledWith(expect.anything(), "M2");
  });

  it("never delivers after unmount", async () => {
    let release: (v: unknown) => void = () => {};
    mockGetState.mockImplementationOnce(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    const { unmount } = setup();
    unmount();
    expect(mockRealtime.registry.size).toBe(0);
    await act(async () => {
      release({ ok: true, data: STATE(2) });
    });
  });
});

describe("timekeeperStatePollMs", () => {
  it("polls every step but an athlete's verdict", () => {
    for (const step of ["crew", "weight", "ready", "live", "end", "result", "confirm"] as const) {
      expect(timekeeperStatePollMs(step, "challenger")).toBe(4_000);
      expect(timekeeperStatePollMs(step, "timekeeper")).toBe(4_000);
    }
    expect(timekeeperStatePollMs("summary", "timekeeper")).toBe(4_000);
    expect(timekeeperStatePollMs("summary", "opponent")).toBeNull();
    expect(timekeeperStatePollMs(null, "timekeeper")).toBeNull();
  });
});
