// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMatchVideosRealtime, MATCH_VIDEOS_REALTIME_DEBOUNCE_MS } from "./use-match-videos-realtime";

type Handler = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => void;

function createClient() {
  const handlers: { event: string; filter: string; cb: Handler }[] = [];
  let statusCb: ((s: string) => void) | null = null;
  const channel = {
    on: vi.fn((_type: string, opts: { event: string; filter: string }, cb: Handler) => {
      handlers.push({ event: opts.event, filter: opts.filter, cb });
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      statusCb = cb;
      return channel;
    }),
  };
  const sb = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };
  const emit = (event: "INSERT" | "UPDATE", row: Record<string, unknown>) => {
    for (const h of handlers.filter((x) => x.event === event)) h.cb({ new: row });
  };
  return { sb, channel, handlers, emit, status: (s: string) => statusCb?.(s) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useMatchVideosRealtime (jits-n2im.12)", () => {
  it("subscribes to INSERT and UPDATE filtered on the match", () => {
    const c = createClient();
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", () => undefined));
    expect(c.handlers.map((h) => [h.event, h.filter])).toEqual([
      ["INSERT", "match_id=eq.M1"],
      ["UPDATE", "match_id=eq.M1"],
    ]);
  });

  it("an INSERT and UPDATEs in one burst trigger exactly one debounced refetch", () => {
    const c = createClient();
    const onChange = vi.fn();
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", onChange));
    c.emit("INSERT", { id: "V2", match_id: "M1", status: "uploading" });
    c.emit("UPDATE", { id: "V2", match_id: "M1", upload_bytes_confirmed: 10 });
    c.emit("UPDATE", { id: "V2", match_id: "M1", upload_bytes_confirmed: 20 });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores an event for another match", () => {
    const c = createClient();
    const onChange = vi.fn();
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", onChange));
    c.emit("UPDATE", { id: "X", match_id: "OTHER" });
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refetches on a REjoin, not on the first join", () => {
    const c = createClient();
    const onChange = vi.fn();
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", onChange));
    c.status("SUBSCRIBED");
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();
    c.status("CHANNEL_ERROR");
    c.status("SUBSCRIBED");
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("uses the latest callback without resubscribing", () => {
    const c = createClient();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useMatchVideosRealtime(c.sb as never, "M1", cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(c.sb.channel).toHaveBeenCalledTimes(1);
    c.emit("UPDATE", { match_id: "M1" });
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount and drops a pending refetch", () => {
    const c = createClient();
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", onChange));
    c.emit("UPDATE", { match_id: "M1" });
    unmount();
    vi.advanceTimersByTime(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();
    expect(c.sb.removeChannel).toHaveBeenCalledWith(c.channel);
  });

  it("stays unsubscribed without a match id", () => {
    const c = createClient();
    renderHook(() => useMatchVideosRealtime(c.sb as never, null, () => undefined));
    expect(c.sb.channel).not.toHaveBeenCalled();
  });

  it("gives two mounts on one match their own channels", () => {
    const c = createClient();
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", () => undefined));
    renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", () => undefined));
    const topics = c.sb.channel.mock.calls.map((call: unknown[]) => call[0]);
    expect(new Set(topics).size).toBe(2);
  });
});

describe("subscribed (review minor 9)", () => {
  it("is false until the join, true after, false again while the channel is down", () => {
    const c = createClient();
    const { result } = renderHook(() => useMatchVideosRealtime(c.sb as never, "M1", () => undefined));
    expect(result.current.subscribed).toBe(false);
    act(() => c.status("SUBSCRIBED"));
    expect(result.current.subscribed).toBe(true);
    act(() => c.status("CHANNEL_ERROR"));
    expect(result.current.subscribed).toBe(false);
  });

  it("debounces for about two seconds (each refetch is an RPC plus poster signing)", () => {
    expect(MATCH_VIDEOS_REALTIME_DEBOUNCE_MS).toBeGreaterThanOrEqual(2_000);
  });
});
