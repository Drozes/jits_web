import { describe, it, expect, vi } from "vitest";
import {
  createSessionMatchChannel,
  SESSION_MATCH_EVENTS,
  sessionMatchTopic,
  settleWithin,
  type SessionMatchHandlers,
} from "./session-match-channel";

type BroadcastHandler = (payload: { payload: Record<string, unknown> }) => void;

function createMockSupabase() {
  const handlers = new Map<string, BroadcastHandler>();
  const sent: { event: string; payload: Record<string, unknown> }[] = [];
  const httpSent: { event: string; payload: Record<string, unknown> }[] = [];
  let statusCb: ((status: string, err?: Error) => void) | null = null;
  let topic = "";
  let channelOpts: unknown = undefined;
  const channel = {
    on(_type: string, opts: { event: string }, handler: BroadcastHandler) {
      handlers.set(opts.event, handler);
      return channel;
    },
    subscribe(cb: (status: string, err?: Error) => void) {
      statusCb = cb;
      return channel;
    },
    send(msg: { event: string; payload: Record<string, unknown> }) {
      sent.push({ event: msg.event, payload: msg.payload });
      return Promise.resolve("ok");
    },
    httpSend(event: string, payload: Record<string, unknown>) {
      httpSent.push({ event, payload });
      return Promise.resolve({ success: true });
    },
  };
  const supabase = {
    channel: vi.fn((name: string, opts?: unknown) => {
      topic = name;
      channelOpts = opts;
      return channel;
    }),
    removeChannel: vi.fn(() => Promise.resolve("ok")),
  };
  return {
    supabase,
    channel,
    handlers,
    sent,
    httpSent,
    get topic() {
      return topic;
    },
    get channelOpts() {
      return channelOpts;
    },
    status(s: string) {
      statusCb?.(s);
    },
    fire(event: string, payload: Record<string, unknown> = {}) {
      handlers.get(event)?.({ payload });
    },
  };
}

describe("createSessionMatchChannel", () => {
  it("opens the session-match topic and binds every protocol event", () => {
    const m = createMockSupabase();
    createSessionMatchChannel(m.supabase as never, "m-1", {});
    expect(m.topic).toBe("session-match:m-1");
    expect(sessionMatchTopic("m-1")).toBe("session-match:m-1");
    expect([...m.handlers.keys()].sort()).toEqual(
      Object.values(SESSION_MATCH_EVENTS).sort(),
    );
  });

  it("maps each payload to its typed handler", () => {
    const m = createMockSupabase();
    const h: Required<SessionMatchHandlers> = {
      onTimerStarted: vi.fn(),
      onTimerPaused: vi.fn(),
      onTimerResumed: vi.fn(),
      onMatchEnded: vi.fn(),
      onReadySignal: vi.fn(),
      onResultSubmitted: vi.fn(),
      onResultConfirmed: vi.fn(),
      onMatchCancelled: vi.fn(),
      onMatchDisputed: vi.fn(),
    };
    createSessionMatchChannel(m.supabase as never, "m-1", h);
    m.fire("timer_started", { started_at: "t0" });
    m.fire("timer_paused", { paused_at: "t1" });
    m.fire("timer_resumed", { total_paused_duration: 7 });
    m.fire("match_ended");
    m.fire("ready_signal", { athlete_id: "a" });
    m.fire("result_submitted", { result: "draw" });
    m.fire("result_confirmed", { athlete_id: "b" });
    m.fire("match_cancelled");
    m.fire("match_disputed", { athlete_id: "c" });
    expect(h.onTimerStarted).toHaveBeenCalledWith("t0");
    expect(h.onTimerPaused).toHaveBeenCalledWith("t1");
    expect(h.onTimerResumed).toHaveBeenCalledWith(7);
    expect(h.onMatchEnded).toHaveBeenCalledOnce();
    expect(h.onReadySignal).toHaveBeenCalledWith("a");
    expect(h.onResultSubmitted).toHaveBeenCalledWith({ result: "draw" });
    expect(h.onResultConfirmed).toHaveBeenCalledWith("b");
    expect(h.onMatchCancelled).toHaveBeenCalledOnce();
    expect(h.onMatchDisputed).toHaveBeenCalledWith("c");
  });

  it("exposes match_disputed as a protocol event (jits-wfpo)", () => {
    expect(SESSION_MATCH_EVENTS.MATCH_DISPUTED).toBe("match_disputed");
  });

  it("opens the channel with broadcast acks so an awaited send means the server has it (jits-mzfu)", () => {
    const m = createMockSupabase();
    createSessionMatchChannel(m.supabase as never, "m-1", {});
    expect(m.channelOpts).toEqual({ config: { broadcast: { ack: true } } });
  });

  it("reads handlers through a getter at event time", () => {
    const m = createMockSupabase();
    let current: SessionMatchHandlers = { onMatchEnded: vi.fn() };
    const first = current.onMatchEnded;
    createSessionMatchChannel(m.supabase as never, "m-1", () => current);
    current = { onMatchEnded: vi.fn() };
    m.fire("match_ended");
    expect(first).not.toHaveBeenCalled();
    expect(current.onMatchEnded).toHaveBeenCalledOnce();
  });

  it("uses httpSend before SUBSCRIBED and websocket send after, returning the status", async () => {
    const m = createMockSupabase();
    const onStatus = vi.fn();
    const handle = createSessionMatchChannel(m.supabase as never, "m-1", {}, { onStatus });
    expect(handle.isSubscribed()).toBe(false);
    await expect(handle.send("ready_signal", { athlete_id: "a" })).resolves.toEqual({ success: true });
    expect(m.httpSent).toEqual([{ event: "ready_signal", payload: { athlete_id: "a" } }]);
    expect(m.sent).toHaveLength(0);

    m.status("SUBSCRIBED");
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED", undefined);
    expect(handle.isSubscribed()).toBe(true);
    await expect(handle.send("match_ended", {})).resolves.toBe("ok");
    expect(m.sent).toEqual([{ event: "match_ended", payload: {} }]);
  });

  it("drops back to httpSend on a non-SUBSCRIBED status", () => {
    const m = createMockSupabase();
    const handle = createSessionMatchChannel(m.supabase as never, "m-1", {});
    m.status("SUBSCRIBED");
    m.status("CHANNEL_ERROR");
    expect(handle.isSubscribed()).toBe(false);
  });

  it("remove() unsubscribes and removes the channel from the client", () => {
    const m = createMockSupabase();
    const handle = createSessionMatchChannel(m.supabase as never, "m-1", {});
    m.status("SUBSCRIBED");
    handle.remove();
    expect(handle.isSubscribed()).toBe(false);
    expect(m.supabase.removeChannel).toHaveBeenCalledWith(m.channel);
  });
});

describe("settleWithin", () => {
  it("resolves with the promise's value when it settles in time", async () => {
    await expect(settleWithin(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("resolves 'timed out' when the promise is slower than the budget", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const p = settleWithin(never, 1500);
      vi.advanceTimersByTime(1500);
      await expect(p).resolves.toBe("timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never rejects: a rejected send resolves to { error }", async () => {
    const err = new Error("socket gone");
    await expect(settleWithin(Promise.reject(err), 1000)).resolves.toEqual({ error: err });
  });

  it("accepts a non-promise (a fire-and-forget mock) and resolves immediately", async () => {
    await expect(settleWithin(undefined, 1000)).resolves.toBeUndefined();
  });
});
