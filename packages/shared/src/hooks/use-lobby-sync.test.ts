// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLobbySync } from "./use-lobby-sync";

// ---------------------------------------------------------------------------
// Mock Supabase channel with presence support
// ---------------------------------------------------------------------------

type BroadcastHandler = (payload: { payload: Record<string, unknown> }) => void;
type PresenceHandler = () => void;
type SubscribeCallback = (status: string) => void | Promise<void>;

function createMockChannel() {
  const broadcastHandlers = new Map<string, BroadcastHandler>();
  const presenceHandlers = new Map<string, PresenceHandler>();
  const sentMessages: { event: string; payload: Record<string, unknown> }[] = [];
  let subscribeCallback: SubscribeCallback | null = null;
  let trackedPayload: Record<string, unknown> | null = null;
  let presenceState: Record<string, unknown[]> = {};

  const channel = {
    on(
      type: string,
      opts: { event: string },
      handler: BroadcastHandler | PresenceHandler,
    ) {
      if (type === "broadcast") {
        broadcastHandlers.set(opts.event, handler as BroadcastHandler);
      } else if (type === "presence") {
        presenceHandlers.set(opts.event, handler as PresenceHandler);
      }
      return channel;
    },
    subscribe(cb?: SubscribeCallback) {
      subscribeCallback = cb ?? null;
      return channel;
    },
    send(msg: { type: string; event: string; payload: Record<string, unknown> }) {
      sentMessages.push({ event: msg.event, payload: msg.payload });
    },
    track(payload: Record<string, unknown>) {
      trackedPayload = payload;
      return Promise.resolve();
    },
    presenceState() {
      return presenceState;
    },
  };

  return {
    channel,
    broadcastHandlers,
    presenceHandlers,
    sentMessages,
    /** Trigger the subscribe callback as if the channel connected. */
    async triggerSubscribed() {
      if (subscribeCallback) await subscribeCallback("SUBSCRIBED");
    },
    /** Simulate an incoming broadcast event. */
    simulateBroadcast(event: string, payload: Record<string, unknown>) {
      const handler = broadcastHandlers.get(event);
      if (handler) handler({ payload });
    },
    /** Simulate a presence sync with the given state, then fire the sync handler. */
    simulatePresenceSync(state: Record<string, unknown[]>) {
      presenceState = state;
      const handler = presenceHandlers.get("sync");
      if (handler) handler();
    },
    get trackedPayload() {
      return trackedPayload;
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

describe("useLobbySync", () => {
  let mockChannel: ReturnType<typeof createMockChannel>;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockChannel = createMockChannel();
    mockSupabase = createMockSupabase(mockChannel);
  });

  const defaultProps = () => ({
    supabase: mockSupabase as never,
    challengeId: "c-100",
    currentAthleteId: "me-1",
    opponentId: "opp-2",
  });

  it("subscribes to the correct channel name", () => {
    renderHook(() => useLobbySync(defaultProps()));
    expect(mockSupabase.lastChannelName).toBe("lobby:c-100");
  });

  it("registers broadcast handlers for match_started, lobby_cancelled, challenge_accepted", () => {
    renderHook(() => useLobbySync(defaultProps()));

    expect(mockChannel.broadcastHandlers.has("match_started")).toBe(true);
    expect(mockChannel.broadcastHandlers.has("lobby_cancelled")).toBe(true);
    expect(mockChannel.broadcastHandlers.has("challenge_accepted")).toBe(true);
  });

  it("registers a presence sync handler", () => {
    renderHook(() => useLobbySync(defaultProps()));
    expect(mockChannel.presenceHandlers.has("sync")).toBe(true);
  });

  it("tracks current athlete on SUBSCRIBED", async () => {
    renderHook(() => useLobbySync(defaultProps()));

    await act(async () => {
      await mockChannel.triggerSubscribed();
    });

    expect(mockChannel.trackedPayload).toEqual({ athlete_id: "me-1" });
  });

  it("fires onMatchStarted when match_started is broadcast", () => {
    const onMatchStarted = vi.fn();

    renderHook(() =>
      useLobbySync({ ...defaultProps(), onMatchStarted }),
    );

    act(() => {
      mockChannel.simulateBroadcast("match_started", { match_id: "m-999" });
    });

    expect(onMatchStarted).toHaveBeenCalledWith("m-999");
  });

  it("does not fire onMatchStarted when match_id is missing", () => {
    const onMatchStarted = vi.fn();

    renderHook(() =>
      useLobbySync({ ...defaultProps(), onMatchStarted }),
    );

    act(() => {
      mockChannel.simulateBroadcast("match_started", {});
    });

    expect(onMatchStarted).not.toHaveBeenCalled();
  });

  it("fires onCancelled when lobby_cancelled is broadcast", () => {
    const onCancelled = vi.fn();

    renderHook(() =>
      useLobbySync({ ...defaultProps(), onCancelled }),
    );

    act(() => {
      mockChannel.simulateBroadcast("lobby_cancelled", {});
    });

    expect(onCancelled).toHaveBeenCalledOnce();
  });

  it("fires onAccepted when challenge_accepted is broadcast", () => {
    const onAccepted = vi.fn();

    renderHook(() =>
      useLobbySync({ ...defaultProps(), onAccepted }),
    );

    act(() => {
      mockChannel.simulateBroadcast("challenge_accepted", {});
    });

    expect(onAccepted).toHaveBeenCalledOnce();
  });

  it("detects opponent presence via sync event", () => {
    const { result } = renderHook(() => useLobbySync(defaultProps()));

    expect(result.current.opponentPresent).toBe(false);

    act(() => {
      mockChannel.simulatePresenceSync({
        key1: [{ athlete_id: "opp-2" }],
      });
    });

    expect(result.current.opponentPresent).toBe(true);
  });

  it("sets opponentPresent to false when opponent leaves", () => {
    const { result } = renderHook(() => useLobbySync(defaultProps()));

    // Opponent joins
    act(() => {
      mockChannel.simulatePresenceSync({
        key1: [{ athlete_id: "opp-2" }],
      });
    });
    expect(result.current.opponentPresent).toBe(true);

    // Opponent leaves
    act(() => {
      mockChannel.simulatePresenceSync({
        key1: [{ athlete_id: "me-1" }],
      });
    });
    expect(result.current.opponentPresent).toBe(false);
  });

  it("sends match_started broadcast via broadcastMatchStarted", () => {
    const { result } = renderHook(() => useLobbySync(defaultProps()));

    act(() => {
      result.current.broadcastMatchStarted("m-777");
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "match_started",
      payload: { match_id: "m-777" },
    });
  });

  it("sends lobby_cancelled broadcast via broadcastCancelled", () => {
    const { result } = renderHook(() => useLobbySync(defaultProps()));

    act(() => {
      result.current.broadcastCancelled();
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "lobby_cancelled",
      payload: {},
    });
  });

  it("sends challenge_accepted broadcast via broadcastAccepted", () => {
    const { result } = renderHook(() => useLobbySync(defaultProps()));

    act(() => {
      result.current.broadcastAccepted();
    });

    expect(mockChannel.sentMessages).toContainEqual({
      event: "challenge_accepted",
      payload: {},
    });
  });

  it("cleans up channel on unmount", () => {
    const { unmount } = renderHook(() => useLobbySync(defaultProps()));
    unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel.channel);
  });
});
