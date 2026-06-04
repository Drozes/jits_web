// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionMatchSync } from "./use-session-match-sync";

// ---------------------------------------------------------------------------
// Mock Supabase channel
// ---------------------------------------------------------------------------

type BroadcastHandler = (payload: { payload: Record<string, unknown> }) => void;
type SubscribeCallback = (status: string) => void | Promise<void>;

function createMockChannel(opts: { autoSubscribe?: boolean } = {}) {
  const { autoSubscribe = true } = opts;
  const handlers = new Map<string, BroadcastHandler>();
  const sentMessages: { event: string; payload: Record<string, unknown> }[] = [];
  const httpSentMessages: { event: string; payload: Record<string, unknown> }[] = [];
  let subscribeCallback: SubscribeCallback | null = null;

  const channel = {
    on(type: string, opts: { event: string }, handler: BroadcastHandler) {
      if (type === "broadcast") {
        handlers.set(opts.event, handler);
      }
      return channel;
    },
    subscribe(cb?: SubscribeCallback) {
      subscribeCallback = cb ?? null;
      // Fire SUBSCRIBED inline so the synchronous broadcast assertions below see
      // the websocket path. The async JOIN-window transition (a broadcast sent
      // before SUBSCRIBED falls back to httpSend) is covered deterministically
      // here via autoSubscribe:false, and end-to-end in use-lobby-sync.test.ts.
      if (cb && autoSubscribe) void cb("SUBSCRIBED");
      return channel;
    },
    send(msg: { type: string; event: string; payload: Record<string, unknown> }) {
      sentMessages.push({ event: msg.event, payload: msg.payload });
    },
    httpSend(event: string, payload: Record<string, unknown>) {
      httpSentMessages.push({ event, payload });
      return Promise.resolve({ success: true as const });
    },
  };

  return {
    channel,
    handlers,
    sentMessages,
    httpSentMessages,
    /** Trigger the subscribe callback as if the channel connected. */
    async triggerSubscribed() {
      if (subscribeCallback) await subscribeCallback("SUBSCRIBED");
    },
    /** Simulate an incoming broadcast event. */
    simulateBroadcast(event: string, payload: Record<string, unknown>) {
      const handler = handlers.get(event);
      if (handler) handler({ payload });
    },
  };
}

function createMockSupabase(mock: ReturnType<typeof createMockChannel>) {
  let lastChannelName = "";
  return {
    channel(name: string) {
      lastChannelName = name;
      return mock.channel;
    },
    removeChannel: vi.fn(),
    get lastChannelName() {
      return lastChannelName;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSessionMatchSync", () => {
  let mockChannel: ReturnType<typeof createMockChannel>;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockChannel = createMockChannel();
    mockSupabase = createMockSupabase(mockChannel);
  });

  it("subscribes to the correct channel name", () => {
    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    expect(mockSupabase.lastChannelName).toBe("session-match:m-123");
  });

  it("registers handlers for all 8 broadcast events", () => {
    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    const expectedEvents = [
      "timer_started",
      "timer_paused",
      "timer_resumed",
      "match_ended",
      "ready_signal",
      "result_submitted",
      "result_confirmed",
      "match_cancelled",
    ];

    for (const event of expectedEvents) {
      expect(mockChannel.handlers.has(event)).toBe(true);
    }
  });

  it("fires onMatchCancelled when match_cancelled is broadcast", () => {
    const onMatchCancelled = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onMatchCancelled,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("match_cancelled", {});
    });

    expect(onMatchCancelled).toHaveBeenCalledOnce();
  });

  it("fires onTimerStarted when timer_started is broadcast", () => {
    const onTimerStarted = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onTimerStarted,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("timer_started", {
        started_at: "2026-04-25T12:00:00Z",
      });
    });

    expect(onTimerStarted).toHaveBeenCalledWith("2026-04-25T12:00:00Z");
  });

  it("fires onTimerPaused when timer_paused is broadcast", () => {
    const onTimerPaused = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onTimerPaused,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("timer_paused", {
        paused_at: "2026-04-25T12:05:00Z",
      });
    });

    expect(onTimerPaused).toHaveBeenCalledWith("2026-04-25T12:05:00Z");
  });

  it("fires onTimerResumed when timer_resumed is broadcast", () => {
    const onTimerResumed = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onTimerResumed,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("timer_resumed", {
        total_paused_duration: 45,
      });
    });

    expect(onTimerResumed).toHaveBeenCalledWith(45);
  });

  it("fires onMatchEnded when match_ended is broadcast", () => {
    const onMatchEnded = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onMatchEnded,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("match_ended", {});
    });

    expect(onMatchEnded).toHaveBeenCalledOnce();
  });

  it("fires onReadySignal when ready_signal is broadcast", () => {
    const onReadySignal = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onReadySignal,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("ready_signal", { athlete_id: "a-1" });
    });

    expect(onReadySignal).toHaveBeenCalledWith("a-1");
  });

  it("fires onResultSubmitted when result_submitted is broadcast", () => {
    const onResultSubmitted = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onResultSubmitted,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("result_submitted", {
        result: "submission",
        winnerId: "a-1",
        submissionCode: "armbar",
        finishTimeSeconds: 120,
      });
    });

    expect(onResultSubmitted).toHaveBeenCalledWith({
      result: "submission",
      winnerId: "a-1",
      submissionCode: "armbar",
      finishTimeSeconds: 120,
    });
  });

  it("fires onResultConfirmed when result_confirmed is broadcast", () => {
    const onResultConfirmed = vi.fn();

    renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
        onResultConfirmed,
      }),
    );

    act(() => {
      mockChannel.simulateBroadcast("result_confirmed", { athlete_id: "a-2" });
    });

    expect(onResultConfirmed).toHaveBeenCalledWith("a-2");
  });

  it("sends broadcast via broadcastTimerStarted", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastTimerStarted("2026-04-25T12:00:00Z");
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "timer_started",
      payload: { started_at: "2026-04-25T12:00:00Z" },
    });
  });

  it("sends broadcast via broadcastMatchEnded", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastMatchEnded();
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "match_ended",
      payload: {},
    });
  });

  it("sends broadcast via broadcastReady", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastReady("a-1");
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "ready_signal",
      payload: { athlete_id: "a-1" },
    });
  });

  it("sends broadcast via broadcastResultConfirmed", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastResultConfirmed("a-2");
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "result_confirmed",
      payload: { athlete_id: "a-2" },
    });
  });

  it("sends broadcast via broadcastMatchCancelled", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastMatchCancelled();
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "match_cancelled",
      payload: {},
    });
  });

  it("uses httpSend (not send) when broadcasting before JOIN completes", () => {
    // A channel whose subscribe callback never reports SUBSCRIBED.
    const pendingChannel = createMockChannel({ autoSubscribe: false });
    const pendingSupabase = createMockSupabase(pendingChannel);

    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: pendingSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastReady("a-1");
      result.current.broadcastMatchCancelled();
    });

    // Falls back to the explicit REST path, not the warning-prone send().
    expect(pendingChannel.sentMessages).toHaveLength(0);
    expect(pendingChannel.httpSentMessages).toContainEqual({
      event: "ready_signal",
      payload: { athlete_id: "a-1" },
    });
    expect(pendingChannel.httpSentMessages).toContainEqual({
      event: "match_cancelled",
      payload: {},
    });
  });

  it("uses websocket send (not httpSend) once SUBSCRIBED", () => {
    const { result } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    act(() => {
      result.current.broadcastReady("a-1");
    });

    // autoSubscribe mock reports SUBSCRIBED, so the WS path is used.
    expect(mockChannel.httpSentMessages).toHaveLength(0);
    expect(mockChannel.sentMessages).toContainEqual({
      event: "ready_signal",
      payload: { athlete_id: "a-1" },
    });
  });

  it("cleans up channel on unmount", () => {
    const { unmount } = renderHook(() =>
      useSessionMatchSync({
        supabase: mockSupabase as never,
        matchId: "m-123",
      }),
    );

    unmount();

    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel.channel);
  });

  it("uses latest callback refs without re-subscribing", () => {
    const onMatchEnded1 = vi.fn();
    const onMatchEnded2 = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) =>
        useSessionMatchSync({
          supabase: mockSupabase as never,
          matchId: "m-123",
          onMatchEnded: cb,
        }),
      { initialProps: { cb: onMatchEnded1 } },
    );

    // Re-render with a new callback
    rerender({ cb: onMatchEnded2 });

    // Channel should not have been re-created (removeChannel not called mid-render)
    expect(mockSupabase.removeChannel).not.toHaveBeenCalled();

    // Broadcast should fire the new callback
    act(() => {
      mockChannel.simulateBroadcast("match_ended", {});
    });

    expect(onMatchEnded1).not.toHaveBeenCalled();
    expect(onMatchEnded2).toHaveBeenCalledOnce();
  });
});
