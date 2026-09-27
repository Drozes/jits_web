// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  HIGHLIGHT_POLL_MS,
  HIGHLIGHT_REFRESH_DEBOUNCE_MS,
  useHighlightProgress,
} from "./use-highlight-progress";

// ---------------------------------------------------------------------------
// Mock client: rpc resolves from a queue (or deferred), channels are recorded
// ---------------------------------------------------------------------------

interface Subscription {
  table: string;
  filter: string;
  handler: () => void;
}

interface FakeChannel {
  name: string;
  subs: Subscription[];
  removed: boolean;
}

function progress(phase: string, over: Record<string, unknown> = {}) {
  return {
    match_video_id: "v1",
    athlete_id: "me",
    enabled: true,
    phase,
    highlight_id: "h1",
    status: null,
    plan_status: null,
    render_total: 0,
    render_max: 10,
    renders_remaining: 10,
    can_regenerate: false,
    last_attempt_failed: false,
    playback: null,
    error_message: null,
    identity_disputed: false,
    last_change_summary: null,
    updated_at: null,
    ...over,
  };
}

function createClient() {
  const channels: FakeChannel[] = [];
  let nextPhase = "planning";
  const rpc = vi.fn(
    (_fn: string, args: { p_match_video_id: string }) =>
      Promise.resolve({
        data: progress(nextPhase, { match_video_id: args.p_match_video_id }),
        error: null,
      }) as Promise<{ data: unknown; error: unknown }>,
  );
  // Mirrors realtime-js: channel(topic) returns the EXISTING channel while
  // one with that topic is registered, and .on() after subscribe() throws.
  const registry = new Map<string, unknown>();
  const client = {
    rpc,
    channel(name: string) {
      const existing = registry.get(name);
      if (existing) return existing;
      const ch: FakeChannel = { name, subs: [], removed: false };
      let subscribed = false;
      channels.push(ch);
      const api = {
        on(_type: string, opts: { table: string; filter: string }, handler: () => void) {
          if (subscribed) {
            throw new Error("cannot add `postgres_changes` callbacks after `subscribe()`.");
          }
          ch.subs.push({ table: opts.table, filter: opts.filter, handler });
          return api;
        },
        subscribe() {
          subscribed = true;
          return api;
        },
        __ch: ch,
      };
      registry.set(name, api);
      return api;
    },
    removeChannel: vi.fn((api: { __ch: FakeChannel }) => {
      api.__ch.removed = true;
      registry.delete(api.__ch.name);
      return Promise.resolve("ok");
    }),
  };
  return {
    client,
    rpc,
    channels,
    setPhase(p: string) {
      nextPhase = p;
    },
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useHighlightProgress", () => {
  it("does nothing for a null id", () => {
    const m = createClient();
    const { result } = renderHook(() => useHighlightProgress(m.client as never, null));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.channels).toHaveLength(0);
  });

  it("loads once and subscribes ONE channel with both filters", async () => {
    const m = createClient();
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    expect(result.current.loading).toBe(true);
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.phase).toBe("planning");
    expect(m.rpc).toHaveBeenCalledWith("get_highlight_progress", { p_match_video_id: "v1" });
    expect(m.channels).toHaveLength(1);
    expect(m.channels[0].name).toMatch(/^highlight_progress:v1:[a-z0-9]+$/);
    expect(m.channels[0].subs.map(({ table, filter }) => ({ table, filter }))).toEqual([
      { table: "video_highlights", filter: "match_video_id=eq.v1" },
      { table: "match_videos", filter: "id=eq.v1" },
    ]);
  });

  it("debounces a burst of realtime events into one refetch", async () => {
    const m = createClient();
    m.setPhase("ready");
    renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(1);
    const [hl, mv] = m.channels[0].subs;
    act(() => {
      hl.handler();
      mv.handler();
      hl.handler();
    });
    act(() => {
      vi.advanceTimersByTime(HIGHLIGHT_REFRESH_DEBOUNCE_MS - 1);
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["waiting_for_analysis", "planning", "rendering", "regenerating"])(
    "polls every 15 s in %s",
    async (phase) => {
      const m = createClient();
      m.setPhase(phase);
      renderHook(() => useHighlightProgress(m.client as never, "v1"));
      await flush();
      expect(m.rpc).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(HIGHLIGHT_POLL_MS);
      });
      await flush();
      expect(m.rpc).toHaveBeenCalledTimes(2);
      await act(async () => {
        vi.advanceTimersByTime(HIGHLIGHT_POLL_MS);
      });
      await flush();
      expect(m.rpc).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["ready", "failed", "none", "invalidated", "disabled", "unavailable"])(
    "never polls in %s",
    async (phase) => {
      const m = createClient();
      m.setPhase(phase);
      renderHook(() => useHighlightProgress(m.client as never, "v1"));
      await flush();
      await act(async () => {
        vi.advanceTimersByTime(HIGHLIGHT_POLL_MS * 4);
      });
      await flush();
      expect(m.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("walks planning -> rendering -> ready and stops polling at ready", async () => {
    const m = createClient();
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    expect(result.current.data?.phase).toBe("planning");

    m.setPhase("rendering");
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_POLL_MS);
    });
    await flush();
    expect(result.current.data?.phase).toBe("rendering");

    // Realtime brings the ready row before the next poll.
    m.setPhase("ready");
    act(() => m.channels[0].subs[0].handler());
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_REFRESH_DEBOUNCE_MS);
    });
    await flush();
    expect(result.current.data?.phase).toBe("ready");
    const calls = m.rpc.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_POLL_MS * 3);
    });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(calls);
  });

  it("removes the channel and stops polling on unmount", async () => {
    const m = createClient();
    const { unmount } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    unmount();
    expect(m.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(m.channels[0].removed).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_POLL_MS * 2);
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });

  it("swaps channels on id change and resets data", async () => {
    const m = createClient();
    const { result, rerender } = renderHook(
      ({ id }) => useHighlightProgress(m.client as never, id),
      { initialProps: { id: "v1" } },
    );
    await flush();
    rerender({ id: "v2" });
    expect(m.channels[0].removed).toBe(true);
    expect(m.channels[1].name).toMatch(/^highlight_progress:v2:/);
    await flush();
    expect(result.current.data?.matchVideoId).toBe("v2");
  });

  it("ignores a stale response for a previous id", async () => {
    const m = createClient();
    let resolveSlow: (v: { data: unknown; error: unknown }) => void = () => undefined;
    m.rpc.mockImplementationOnce(
      () => new Promise((r) => {
        resolveSlow = r;
      }),
    );
    const { result, rerender } = renderHook(
      ({ id }) => useHighlightProgress(m.client as never, id),
      { initialProps: { id: "v1" } },
    );
    rerender({ id: "v2" });
    await flush();
    expect(result.current.data?.matchVideoId).toBe("v2");
    await act(async () => {
      resolveSlow({ data: progress("ready", { match_video_id: "v1" }), error: null });
    });
    await flush();
    expect(result.current.data?.matchVideoId).toBe("v2");
  });

  it("keeps the last snapshot and surfaces the error on a failed refetch", async () => {
    const m = createClient();
    m.setPhase("ready");
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    m.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "x", details: "", hint: "highlight_not_participant" },
    });
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.data?.phase).toBe("ready");
    expect(result.current.error?.code).toBe("NOT_PARTICIPANT");
  });

  it("refresh reads immediately and cancels a pending debounce", async () => {
    const m = createClient();
    m.setPhase("ready");
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    act(() => m.channels[0].subs[0].handler());
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_REFRESH_DEBOUNCE_MS * 2);
    });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("two instances for the same id both subscribe; unmounting one keeps the other's channel", async () => {
    const m = createClient();
    m.setPhase("ready");
    const first = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    const second = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    expect(m.channels).toHaveLength(2);
    expect(m.channels[0].name).not.toBe(m.channels[1].name);
    expect(m.channels.every((c) => c.subs.length === 2)).toBe(true);
    second.unmount();
    expect(m.channels[1].removed).toBe(true);
    expect(m.channels[0].removed).toBe(false);
    // The survivor still reacts to realtime.
    const calls = m.rpc.mock.calls.length;
    act(() => m.channels[0].subs[0].handler());
    await act(async () => {
      vi.advanceTimersByTime(HIGHLIGHT_REFRESH_DEBOUNCE_MS);
    });
    await flush();
    expect(m.rpc).toHaveBeenCalledTimes(calls + 1);
    first.unmount();
  });

  it("a slower OLDER response for the same id never overwrites a newer one", async () => {
    const m = createClient();
    m.setPhase("rendering");
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    let resolveOld: (v: { data: unknown; error: unknown }) => void = () => undefined;
    m.rpc.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    await act(async () => {
      result.current.refresh(); // older, slow
    });
    m.setPhase("ready");
    await act(async () => {
      result.current.refresh(); // newer, fast
    });
    await flush();
    expect(result.current.data?.phase).toBe("ready");
    await act(async () => {
      resolveOld({ data: progress("rendering"), error: null });
    });
    await flush();
    expect(result.current.data?.phase).toBe("ready");
  });

  it.each(["disabled", "unavailable"])("opens no realtime channel when the first read says %s", async (phase) => {
    const m = createClient();
    m.setPhase(phase);
    const { result } = renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    expect(result.current.data?.phase).toBe(phase);
    expect(m.channels).toHaveLength(0);
  });

  it("opens no realtime channel when the first read fails", async () => {
    const m = createClient();
    m.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "function not found", details: "", hint: "" },
    });
    renderHook(() => useHighlightProgress(m.client as never, "v1"));
    await flush();
    expect(m.channels).toHaveLength(0);
  });
});
