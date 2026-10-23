/**
 * `useTimekeeperPresence` (lib/match-flow/use-timekeeper-presence.ts; slice
 * M4, TEST-PLAN 3.2): the seated timekeeper's 15 s heartbeat
 * (`touch_match_timekeeper`, R23), only while seated and in the foreground,
 * and it stops on exit: unmount, the seat or the match gone, or a refusal
 * that says so. iOS `inactive` (the notification shade) is not background.
 */
import { AppState } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockTouch = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  touchMatchTimekeeper: (...a: unknown[]) => mockTouch(...a),
}));

import { LOST_BEAT_MS, TIMEKEEPER_HEARTBEAT_MS, useTimekeeperPresence } from "@/lib/match-flow/use-timekeeper-presence";

const OK = { ok: true, data: { seenAt: "2026-10-20T12:00:00Z" } };
let appStateHandlers: ((s: string) => void)[] = [];

async function flush() {
  await act(async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

function setAppState(next: string) {
  act(() => {
    for (const h of appStateHandlers) h(next);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  appStateHandlers = [];
  mockTouch.mockResolvedValue(OK);
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, h: (s: string) => void) => {
    appStateHandlers.push(h);
    return {
      remove: () => {
        appStateHandlers = appStateHandlers.filter((x) => x !== h);
      },
    };
  }) as never);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("while seated and in the foreground", () => {
  it("beats at once, then every 15 s, for this match", async () => {
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    expect(mockTouch).toHaveBeenCalledTimes(1);
    expect(mockTouch).toHaveBeenCalledWith({ tag: "client" }, "M1");
    await advance(TIMEKEEPER_HEARTBEAT_MS - 1);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockTouch).toHaveBeenCalledTimes(2);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(4);
  });

  it("is 15 s, a quarter of the 60 s the server waits before it reads offline", () => {
    expect(TIMEKEEPER_HEARTBEAT_MS).toBe(15_000);
  });

  it("a slow beat makes the next tick skip, never two calls at once", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockTouch.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    resolve(OK);
    await flush();
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(2);
  });

  it("a beat that never settles (a dead connection, no HTTP timeout) does not silence the seat", async () => {
    mockTouch.mockImplementationOnce(() => new Promise(() => undefined));
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    expect(LOST_BEAT_MS).toBeGreaterThan(TIMEKEEPER_HEARTBEAT_MS);
    expect(LOST_BEAT_MS).toBeLessThan(TIMEKEEPER_HEARTBEAT_MS * 2);
    // One tick skips while the beat might still land; the next presumes it lost.
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(2);
    // The network is back: one beat per tick from here on.
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(3);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(4);
  });

  it("at most one beat per tick while every beat hangs", async () => {
    mockTouch.mockImplementation(() => new Promise(() => undefined));
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    for (let tick = 1; tick <= 8; tick++) {
      const before = mockTouch.mock.calls.length;
      await advance(TIMEKEEPER_HEARTBEAT_MS);
      expect(mockTouch.mock.calls.length - before).toBeLessThanOrEqual(1);
    }
    // A lost beat is replaced every other tick: 1 at once, then ticks 2, 4, 6 and 8.
    expect(mockTouch).toHaveBeenCalledTimes(5);
  });

  it("a late settle of a lost beat never clears the gate of the beat that replaced it", async () => {
    const pending: ((v: unknown) => void)[] = [];
    mockTouch.mockImplementation(() => new Promise((r) => pending.push(r)));
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    await advance(TIMEKEEPER_HEARTBEAT_MS * 2);
    expect(mockTouch).toHaveBeenCalledTimes(2);
    // The lost first beat lands late, while the second is still in flight.
    pending[0](OK);
    await flush();
    // The second beat's own gate still holds: the next tick skips.
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(2);
    pending[1](OK);
    await flush();
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(3);
  });

  it("keeps beating through a network failure (a rejection or an unknown refusal)", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockTouch.mockRejectedValueOnce(new Error("offline"));
    mockTouch.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(3);
  });
});

describe("only while seated", () => {
  it("never beats when not seated (an athlete, a two-athlete match, a finished match)", async () => {
    renderHook(() => useTimekeeperPresence("M1", false));
    await advance(TIMEKEEPER_HEARTBEAT_MS * 3);
    expect(mockTouch).not.toHaveBeenCalled();
    expect(appStateHandlers).toHaveLength(0);
  });

  it("stops when the seat goes (the match cancelled or completed) and starts again if it comes back", async () => {
    const { rerender } = renderHook(({ seated }: { seated: boolean }) => useTimekeeperPresence("M1", seated), {
      initialProps: { seated: true },
    });
    await flush();
    expect(mockTouch).toHaveBeenCalledTimes(1);
    rerender({ seated: false });
    await advance(TIMEKEEPER_HEARTBEAT_MS * 3);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    rerender({ seated: true });
    await flush();
    expect(mockTouch).toHaveBeenCalledTimes(2);
  });

  it.each(["NOT_TIMEKEEPER", "NOT_PARTICIPANT", "NOT_TIMEKEEPER_MODE", "MATCH_NOT_PENDING"])(
    "stops on %s (the server says this phone no longer holds a live seat)",
    async (code) => {
      mockTouch.mockResolvedValue({ ok: false, error: { code, message: "x" } });
      renderHook(() => useTimekeeperPresence("M1", true));
      await flush();
      await advance(TIMEKEEPER_HEARTBEAT_MS * 4);
      expect(mockTouch).toHaveBeenCalledTimes(1);
    },
  );

  it("a new match beats for that match", async () => {
    const { rerender } = renderHook(({ id }: { id: string }) => useTimekeeperPresence(id, true), { initialProps: { id: "M1" } });
    await flush();
    rerender({ id: "M2" });
    await flush();
    expect(mockTouch).toHaveBeenLastCalledWith({ tag: "client" }, "M2");
  });
});

describe("the foreground and exit", () => {
  it("stops in the background and beats again at once on the return", async () => {
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    setAppState("background");
    await advance(TIMEKEEPER_HEARTBEAT_MS * 3);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    setAppState("active");
    await flush();
    expect(mockTouch).toHaveBeenCalledTimes(2);
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(3);
  });

  it("keeps beating while iOS is inactive (notification shade, app switcher)", async () => {
    renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    setAppState("inactive");
    await advance(TIMEKEEPER_HEARTBEAT_MS);
    expect(mockTouch).toHaveBeenCalledTimes(2);
  });

  it("does not beat when it mounts in the background", async () => {
    Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
    renderHook(() => useTimekeeperPresence("M1", true));
    await advance(TIMEKEEPER_HEARTBEAT_MS * 2);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it("stops on unmount (the wizard exits) and drops its AppState listener", async () => {
    const { unmount } = renderHook(() => useTimekeeperPresence("M1", true));
    await flush();
    unmount();
    await advance(TIMEKEEPER_HEARTBEAT_MS * 3);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    expect(appStateHandlers).toHaveLength(0);
  });
});
