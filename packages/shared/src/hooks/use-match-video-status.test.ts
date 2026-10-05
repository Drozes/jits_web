// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MATCH_VIDEO_STATUS_DEBOUNCE_MS,
  MATCH_VIDEO_STATUS_OVERDUE_POLL_MS,
  MATCH_VIDEO_STATUS_UPLOAD_RECHECK_MS,
  nextStatusWakeAt,
  useMatchVideoStatus,
} from "./use-match-video-status";
import { parseMatchVideoStatus, type MatchVideoStatus } from "../api/match-video-status";

const MATCH = "11111111-1111-4111-8111-111111111111";
const T0 = Date.parse("2026-10-05T20:00:00Z");

function statusDoc(over: Record<string, unknown> = {}) {
  return {
    match_id: MATCH,
    match_status: "completed",
    server_now: new Date(T0).toISOString(),
    phase: "collecting",
    phase_reason: "awaiting_first_angle",
    angles: [],
    reels: [],
    event_seq: 1,
    ...over,
  };
}

type Handler = (payload: { new?: Record<string, unknown> | null }) => void;

function createClient(responses: unknown[]) {
  const handlers: Handler[] = [];
  let statusCb: ((s: string) => void) | null = null;
  const channel = {
    on: vi.fn((_t: string, _o: unknown, cb: Handler) => {
      handlers.push(cb);
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      statusCb = cb;
      return channel;
    }),
  };
  let i = 0;
  const rpc = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return r;
  });
  const sb = { rpc, channel: vi.fn(() => channel), removeChannel: vi.fn().mockResolvedValue("ok") };
  return {
    sb,
    rpc,
    insert: (row: Record<string, unknown>) => handlers.forEach((h) => h({ new: row })),
    status: (s: string) => statusCb?.(s),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useMatchVideoStatus", () => {
  it("reads on mount and exposes the server clock offset (skewed device clock)", async () => {
    // Device clock 90 s behind the server.
    vi.setSystemTime(T0 - 90_000);
    const c = createClient([{ data: statusDoc(), error: null }]);
    const { result } = renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.status?.phase).toBe("collecting");
    expect(result.current.clockOffsetMs).toBe(90_000);
    expect(result.current.loading).toBe(false);
  });

  it("coalesces a burst of realtime events into one refetch", async () => {
    const c = createClient([{ data: statusDoc(), error: null }]);
    renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(1);
    act(() => {
      c.insert({ match_id: MATCH, source: "match_videos_heartbeat" });
      c.insert({ match_id: MATCH, source: "match_videos" });
      c.insert({ match_id: MATCH, source: "video_highlights" });
    });
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS - 1);
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });

  it("ignores an event for another match and re-reads on (re)subscribe", async () => {
    const c = createClient([{ data: statusDoc(), error: null }]);
    renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    act(() => c.insert({ match_id: "other" }));
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS);
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    act(() => c.status("SUBSCRIBED"));
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });

  it("drops a response older than the one on screen (event_seq)", async () => {
    const c = createClient([
      { data: statusDoc({ event_seq: 10, phase: "building", phase_reason: null }), error: null },
      { data: statusDoc({ event_seq: 7, phase: "collecting" }), error: null },
    ]);
    const { result } = renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    expect(result.current.status?.phase).toBe("building");
    act(() => result.current.refetch());
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.status?.phase).toBe("building");
  });

  it("keeps the last good status through a failed re-read", async () => {
    const c = createClient([
      { data: statusDoc({ phase: "ready", phase_reason: null }), error: null },
      { data: null, error: { code: "08000", message: "offline" } },
    ]);
    const { result } = renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    act(() => result.current.refetch());
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS);
    });
    await flush();
    expect(result.current.status?.phase).toBe("ready");
    expect(result.current.error?.code).toBe("UNKNOWN");
  });

  it("re-reads when the wait deadline passes, by the server's clock, and the phase comes from the server", async () => {
    // Device clock 60 s AHEAD of the server; deadline 120 s after server now.
    vi.setSystemTime(T0 + 60_000);
    const waiting = statusDoc({
      phase: "waiting_for_angle",
      phase_reason: null,
      wait_deadline_at: new Date(T0 + 120_000).toISOString(),
      event_seq: 2,
    });
    const c = createClient([
      { data: waiting, error: null },
      { data: { ...waiting, server_now: new Date(T0 + 120_500).toISOString() }, error: null },
      { data: statusDoc({ phase: "building", phase_reason: null, event_seq: 3, server_now: new Date(T0 + 131_000).toISOString() }), error: null },
    ]);
    const { result } = renderHook(() => useMatchVideoStatus(c.sb as never, MATCH));
    await flush();
    // Drain the first-join read scheduling: no join event in this fake.
    expect(c.rpc).toHaveBeenCalledTimes(1);
    // 119 s of device time: still before the deadline on the server's clock.
    await act(async () => {
      vi.advanceTimersByTime(119_000);
    });
    expect(c.rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(2);
    // Server has not moved: still waiting, then a short poll picks up the move.
    expect(result.current.status?.phase).toBe("waiting_for_angle");
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_OVERDUE_POLL_MS);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(3);
    expect(result.current.status?.phase).toBe("building");
  });

  it("re-reads on foreground", async () => {
    const c = createClient([{ data: statusDoc(), error: null }]);
    let fire: () => void = () => undefined;
    const subscribeForeground = (cb: () => void) => {
      fire = cb;
      return () => undefined;
    };
    renderHook(() => useMatchVideoStatus(c.sb as never, MATCH, { subscribeForeground }));
    await flush();
    act(() => fire());
    await act(async () => {
      vi.advanceTimersByTime(MATCH_VIDEO_STATUS_DEBOUNCE_MS);
    });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });

  it("stays idle without a match and unsubscribes on unmount", async () => {
    const c = createClient([{ data: statusDoc(), error: null }]);
    const { rerender, unmount } = renderHook(({ id }: { id: string | null }) => useMatchVideoStatus(c.sb as never, id), {
      initialProps: { id: null as string | null },
    });
    await flush();
    expect(c.rpc).not.toHaveBeenCalled();
    rerender({ id: MATCH });
    await flush();
    expect(c.rpc).toHaveBeenCalledTimes(1);
    unmount();
    expect(c.sb.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe("nextStatusWakeAt", () => {
  const s = (over: Record<string, unknown>) => parseMatchVideoStatus(statusDoc(over)) as MatchVideoStatus;

  it("wakes at the grace and film window edges while collecting", () => {
    const st = s({
      phase_reason: "no_video_yet",
      no_video_grace_until: new Date(T0 + 60_000).toISOString(),
      film_window_until: new Date(T0 + 3_600_000).toISOString(),
    });
    expect(nextStatusWakeAt(st, 0, T0, T0, 0)).toBe(T0 + 61_500);
  });

  it("rechecks a stale upload (paused is computed on read)", () => {
    const st = s({ angles: [{ recorder_athlete_id: "b", state: "uploading" }] });
    expect(nextStatusWakeAt(st, 0, T0, T0, 0)).toBe(T0 + MATCH_VIDEO_STATUS_UPLOAD_RECHECK_MS);
  });

  it("stops the overdue poll after its limit and wakes for nothing settled", () => {
    const st = s({ phase: "waiting_for_angle", wait_deadline_at: new Date(T0 - 1).toISOString() });
    expect(nextStatusWakeAt(st, 0, T0, T0, 0)).toBe(T0 + MATCH_VIDEO_STATUS_OVERDUE_POLL_MS);
    expect(nextStatusWakeAt(st, 0, T0, T0, 999)).toBeNull();
    expect(nextStatusWakeAt(s({ phase: "ready" }), 0, T0, T0, 0)).toBeNull();
  });
});
