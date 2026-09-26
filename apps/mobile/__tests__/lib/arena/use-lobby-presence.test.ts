/**
 * `lobby:online` presence.
 *
 * Three things have to hold, and each of them has a way of failing silently:
 *
 *  - the topic is the shared constant, because a per-mount name isolates the
 *    client into a lobby of one that never syncs (jits-a8y.1);
 *  - a track requested before the channel joined still lands;
 *  - a remount ADOPTS the live channel instead of rebuilding it. realtime-js
 *    2.105.4 hands back the existing instance for a live topic, `subscribe()`
 *    is a no-op unless the adapter is closed, and `on()` THROWS for presence
 *    once the channel is joined, so a rebuild produces a channel that never
 *    fires SUBSCRIBED, never tracks, and leaves "Online now" at zero for the
 *    rest of the app session.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { LOBBY_TOPIC } from "@/lib/arena/constants";

// ---- mocks ----

interface MockChannel {
  topic: string;
  config: unknown;
  joined: boolean;
  /** Phoenix channel state, which the hook reads before pushing. */
  state: "closed" | "joining" | "joined" | "errored" | "leaving";
  syncHandler: (() => void) | null;
  /**
   * Fires a subscribe status the way realtime-js does: SUBSCRIBED lands on a
   * channel phoenix has already marked joined.
   */
  subscribeHandler: ((status: string) => void) | null;
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  untrack: jest.Mock;
  teardown: jest.Mock;
  presenceState: jest.Mock;
}

/** Every channel ever created, including released ones. */
const mockChannels: MockChannel[] = [];
/** What the client still holds, which is what `getChannels()` reports. */
const mockRegistry: MockChannel[] = [];
const mockRemoveChannel = jest.fn();

function mockMakeChannel(topic: string, config: unknown): MockChannel {
  const channel: MockChannel = {
    // RealtimeClient keys its registry by the prefixed topic.
    topic: `realtime:${topic}`,
    config,
    joined: false,
    state: "closed",
    syncHandler: null,
    subscribeHandler: null,
    on: jest.fn((_type: string, _filter: unknown, handler: () => void) => {
      // realtime-js THROWS here once the channel is joined or joining
      // (RealtimeChannel.js:389-396), and reproducing that is the whole point
      // of this mock: a binding attempt on a live instance is how the lobby
      // dies for the rest of the app session, so a test that cannot see the
      // throw cannot tell a working adopt path from a dead one.
      if (channel.joined) {
        throw new Error(
          "tried to listen to Realtime after joining the channel. Listeners must be set up before joining.",
        );
      }
      channel.syncHandler = handler;
      return channel;
    }),
    subscribe: jest.fn((handler: (status: string) => void) => {
      channel.subscribeHandler = (status: string) => {
        if (status === "SUBSCRIBED") channel.state = "joined";
        handler(status);
      };
      channel.joined = true;
      channel.state = "joining";
      return channel;
    }),
    track: jest.fn().mockResolvedValue("ok"),
    untrack: jest.fn().mockResolvedValue("ok"),
    teardown: jest.fn(),
    presenceState: jest.fn(() => ({})),
  };
  return channel;
}

/** A channel closing: out of the registry, then CLOSED to its callback. */
function mockClose(channel: MockChannel) {
  channel.state = "closed";
  const i = mockRegistry.indexOf(channel);
  if (i >= 0) mockRegistry.splice(i, 1);
  channel.subscribeHandler?.("CLOSED");
}

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: (topic: string, config: unknown) => {
      const existing = mockRegistry.find((c) => c.topic === `realtime:${topic}`);
      if (existing) return existing;
      const c = mockMakeChannel(topic, config);
      mockChannels.push(c);
      mockRegistry.push(c);
      return c;
    },
    getChannels: () => [...mockRegistry],
    removeChannel: (channel: MockChannel) => {
      const status = mockRemoveChannel(channel) ?? "ok";
      if (status === "ok") {
        // Like realtime-js: the leave closes the channel, which drops it from
        // the registry and fires CLOSED to its subscribe callback. The hook
        // must read that CLOSED as its own teardown, never as a loss.
        mockClose(channel);
      }
      return Promise.resolve(status);
    },
  },
}));

import {
  joinLobby,
  leaveLobby,
  useLobbyIds,
  useLobbyPresence,
} from "@/lib/arena/use-lobby-presence";

// ---- fixtures ----

const ME = "athlete-me";
const PAYLOAD = {
  athlete_id: ME,
  display_name: "Me",
  current_elo: 1200,
  looking_for_casual: false,
  looking_for_ranked: true,
};

function mount(athleteId = ME) {
  return renderHook(() => {
    useLobbyPresence(athleteId);
    return useLobbyIds();
  });
}

/** The hook's setup is async, so let it settle before asserting. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockChannels.length = 0;
  mockRegistry.length = 0;
  mockRemoveChannel.mockReset();
  mockRemoveChannel.mockReturnValue("ok");
});

afterEach(async () => {
  // One test drives the stale-channel retry on fake timers; every other test
  // wants real ones back, whether that test passed or threw.
  jest.useRealTimers();
  // Leave module state clean for the next test: the channel deliberately
  // survives unmount, so it has to be released explicitly here.
  const { unmount } = mount("");
  await settle();
  unmount();
});

describe("useLobbyPresence", () => {
  it("joins the shared lobby topic, keyed by athlete, exactly once", async () => {
    const { rerender, unmount } = mount();
    await settle();

    expect(mockChannels).toHaveLength(1);
    // Byte-identical to web's topic. A per-mount name would give this client
    // its own empty lobby and the roster split would never populate.
    expect(mockChannels[0].topic).toBe(`realtime:${LOBBY_TOPIC}`);
    expect(mockChannels[0].topic).toBe("realtime:lobby:online");
    expect(mockChannels[0].config).toEqual({
      config: { presence: { key: ME } },
    });

    rerender(undefined);
    rerender(undefined);
    await settle();
    expect(mockChannels).toHaveLength(1);

    unmount();
  });

  it("publishes the presence roster to every subscriber on sync", async () => {
    const { result, unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    channel.presenceState.mockReturnValue({
      "athlete-a": [{}],
      "athlete-b": [{}],
    });

    act(() => {
      channel.syncHandler?.();
    });

    expect([...result.current].sort()).toEqual(["athlete-a", "athlete-b"]);
    unmount();
  });

  it("tracks a join that was requested before the channel had joined", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];

    await act(async () => {
      await joinLobby(PAYLOAD);
    });
    channel.track.mockClear();

    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).toHaveBeenCalledWith(PAYLOAD);

    await act(async () => {
      await leaveLobby();
    });
    unmount();
  });

  it("re-tracks the CURRENT payload on a websocket rejoin, not a stale one", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];

    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).not.toHaveBeenCalled();

    await act(async () => {
      await joinLobby(PAYLOAD);
    });
    channel.track.mockClear();

    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).toHaveBeenCalledWith(PAYLOAD);

    await act(async () => {
      await leaveLobby();
    });
    unmount();
  });

  it("stops re-tracking once the athlete has left the lobby", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];

    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
      await joinLobby(PAYLOAD);
      await leaveLobby();
    });
    expect(channel.untrack).toHaveBeenCalled();

    channel.track.mockClear();
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).not.toHaveBeenCalled();

    unmount();
  });

  it("leaves the lobby but KEEPS the channel on unmount", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
      await joinLobby(PAYLOAD);
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(channel.untrack).toHaveBeenCalled();
    // Removing it is what creates the zombie: removeChannel only tears down
    // when unsubscribe confirms, and the next channel() call would hand back
    // this same instance with subscribe() already a no-op.
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  it("ADOPTS the live channel on a remount instead of rebuilding it", async () => {
    const first = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.on.mockClear();
    channel.subscribe.mockClear();

    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount();
    await settle();

    expect(mockChannels).toHaveLength(1);
    // `on()` throws for presence on a joined channel, and `subscribe()` is a
    // silent no-op on one that is not closed. Doing neither is the point.
    expect(channel.on).not.toHaveBeenCalled();
    expect(channel.subscribe).not.toHaveBeenCalled();

    second.unmount();
  });

  it("keeps the adopted channel's sync wired to the store", async () => {
    // The adopted channel keeps the binding the first mount made, so the
    // roster must still flow after a remount. If it did not, "Online now"
    // would sit at zero with no error anywhere.
    const first = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount();
    await settle();
    channel.presenceState.mockReturnValue({ "athlete-a": [{}] });
    act(() => {
      channel.syncHandler?.();
    });

    expect([...second.result.current]).toEqual(["athlete-a"]);
    second.unmount();
  });

  it("releases and rebuilds when the athlete changes", async () => {
    const first = mount();
    await settle();
    const original = mockChannels[0];
    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount("someone-else");
    await settle();

    expect(mockRemoveChannel).toHaveBeenCalledWith(original);
    expect(mockChannels).toHaveLength(2);
    expect(mockChannels[1].config).toEqual({
      config: { presence: { key: "someone-else" } },
    });

    second.unmount();
  });

  it("bails out instead of re-binding a channel whose release did not confirm", async () => {
    // removeChannel resolves the unsubscribe status and only tears down on
    // 'ok'. A rebuild after a failed release is handed the same instance
    // back, and `on()` THROWS on it, which leaves channelRef unset, every
    // sync bailing on the identity guard, the roster empty for the rest of
    // the app session and every later track silently dropped. Bailing out is
    // the only safe move.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRemoveChannel.mockReturnValue("timed out");
    const first = mount();
    await settle();
    const channel = mockChannels[0];
    expect(channel.joined).toBe(true);
    channel.on.mockClear();
    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount("someone-else");
    await settle();

    expect(mockChannels).toHaveLength(1);
    expect(mockRegistry).toHaveLength(1);
    // The live instance must not be touched: this call throws in production.
    expect(channel.on).not.toHaveBeenCalled();
    // Silent failure is the enemy here, so the unconfirmed teardown is said
    // out loud rather than swallowed.
    expect(warn).toHaveBeenCalled();

    second.unmount();
    mockRemoveChannel.mockReturnValue("ok");
    warn.mockRestore();
  });

  it("recovers on a later attempt once the stale channel finally clears", async () => {
    // Bailing out is only half the fix. The athlete whose id flickered to ""
    // and back must end up in a working lobby, not a permanently dead one,
    // so the release is retried and the rebuild happens when it lands.
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRemoveChannel.mockReturnValue("timed out");
    const first = mount();
    await settle();
    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount("someone-else");
    await settle();
    expect(mockChannels).toHaveLength(1);

    // The socket comes back and the removal confirms.
    mockRemoveChannel.mockReturnValue("ok");
    await act(async () => {
      jest.runOnlyPendingTimers();
      await settle();
    });

    expect(mockChannels).toHaveLength(2);
    expect(mockRegistry).toHaveLength(1);
    expect(mockChannels[1].config).toEqual({
      config: { presence: { key: "someone-else" } },
    });

    // And the rebuilt channel is wired up for real: a join that was requested
    // while the lobby was stuck still reaches the new instance.
    await act(async () => {
      mockChannels[1].subscribeHandler?.("SUBSCRIBED");
      await joinLobby(PAYLOAD);
    });
    expect(mockChannels[1].track).toHaveBeenCalledWith(PAYLOAD);

    await act(async () => {
      await leaveLobby();
    });
    second.unmount();
    warn.mockRestore();
  });

  it("runs setup again on the next foreground after the backoff gives up", async () => {
    // The owner is app-wide, so there is no "next Arena visit" to rescue a
    // lobby whose stale channel never cleared: returning to the foreground is.
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let appStateHandler: ((s: string) => void) | null = null;
    const { AppState } = require("react-native");
    // Swapped by hand rather than spyOn/mockRestore: jest-expo's AppState
    // mock is itself a jest.fn, and mockRestore would reset it to one that
    // returns undefined, breaking every later unmount.
    const original = AppState.addEventListener;
    AppState.addEventListener = (_e: unknown, h: unknown) => {
      appStateHandler = h as (s: string) => void;
      return { remove: jest.fn() };
    };
    mockRemoveChannel.mockReturnValue("timed out");
    const first = mount();
    await settle();
    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount("someone-else");
    await settle();
    // Exhaust every backoff step.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        jest.runOnlyPendingTimers();
        await settle();
      });
    }
    expect(mockChannels).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("retrying when the app next returns to the foreground"),
    );

    mockRemoveChannel.mockReturnValue("ok");
    await act(async () => {
      appStateHandler?.("active");
      await settle();
    });

    expect(mockChannels).toHaveLength(2);
    expect(mockChannels[1].config).toEqual({
      config: { presence: { key: "someone-else" } },
    });

    second.unmount();
    AppState.addEventListener = original;
    warn.mockRestore();
  });

  it("does nothing without an athlete id", async () => {
    const { unmount } = mount("");
    await settle();
    expect(mockChannels).toHaveLength(0);
    unmount();
  });

  it("clears the roster when the channel is released", async () => {
    const first = mount();
    await settle();
    const channel = mockChannels[0];
    channel.presenceState.mockReturnValue({ "athlete-a": [{}] });
    act(() => {
      channel.syncHandler?.();
    });
    expect(first.result.current.size).toBe(1);

    await act(async () => {
      first.unmount();
      await Promise.resolve();
    });

    const second = mount("someone-else");
    await waitFor(() => expect(second.result.current.size).toBe(0));
    second.unmount();
  });
});

/**
 * jits-fa9x. Realtime's per-channel presence rate limit (5 calls / 30s) makes
 * the server CLOSE the channel. realtime-js drops a closed channel from its
 * registry and never rejoins it, so a module that kept pointing at it pushed
 * every later track into a dead channel: LIVE in the UI, invisible to
 * everyone else, for the rest of the app process.
 */
describe("useLobbyPresence: server-closed channel recovery (jits-fa9x)", () => {
  /** Advance fake time by `ms` and let the async setup settle. */
  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await settle();
    });
  }

  /** Mount, join the channel and go live on it. */
  async function mountLive() {
    const hook = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
      await joinLobby(PAYLOAD);
    });
    expect(channel.track).toHaveBeenCalledTimes(1);
    return { hook, channel };
  }

  it("rebuilds a server-closed channel and re-tracks the athlete on it", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, channel } = await mountLive();
    channel.presenceState.mockReturnValue({ [ME]: [{}], "athlete-a": [{}] });
    act(() => {
      channel.syncHandler?.();
    });
    expect(hook.result.current.size).toBe(2);

    // The server closes it (ClientPresenceRateLimitReached).
    act(() => {
      mockClose(channel);
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("lobby channel lost (CLOSED)"),
    );
    // We no longer receive syncs, so the stale roster is dropped.
    expect(hook.result.current.size).toBe(0);

    // A go-live that lands before the rebuild must not push into the corpse.
    await act(async () => {
      await joinLobby(PAYLOAD);
    });
    expect(channel.track).toHaveBeenCalledTimes(1);

    await advance(1_000);
    expect(mockChannels).toHaveLength(2);
    const rebuilt = mockChannels[1];
    expect(rebuilt.config).toEqual({ config: { presence: { key: ME } } });
    expect(mockRegistry).toEqual([rebuilt]);
    // Already CLOSED, so left alone: teardown() would clear the reply
    // bindings a pending push needs to ever time out, and a removal would
    // push a leave for this topic that could unregister the replacement.
    expect(channel.teardown).not.toHaveBeenCalled();
    expect(mockRemoveChannel).not.toHaveBeenCalledWith(channel);

    await act(async () => {
      rebuilt.subscribeHandler?.("SUBSCRIBED");
    });
    expect(rebuilt.track).toHaveBeenCalledWith(PAYLOAD);

    // And the rebuilt channel is the one feeding the roster now.
    rebuilt.presenceState.mockReturnValue({ [ME]: [{}] });
    act(() => {
      rebuilt.syncHandler?.();
    });
    expect([...hook.result.current]).toEqual([ME]);

    hook.unmount();
    warn.mockRestore();
  });

  it("rebuilds when a track finds the owned channel unregistered", async () => {
    // Belt and braces for a close whose CLOSED callback never reached us.
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, channel } = await mountLive();
    await act(async () => {
      await leaveLobby();
    });
    // Unregistered but not closed: this one does need a local teardown.
    channel.state = "errored";
    mockRegistry.splice(mockRegistry.indexOf(channel), 1);

    await act(async () => {
      await joinLobby(PAYLOAD);
    });
    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(channel.teardown).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no longer registered"),
    );

    await advance(1_000);
    expect(mockChannels).toHaveLength(2);
    expect(channel.teardown).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockChannels[1].subscribeHandler?.("SUBSCRIBED");
    });
    expect(mockChannels[1].track).toHaveBeenCalledWith(PAYLOAD);

    hook.unmount();
    warn.mockRestore();
  });

  it("does not rebuild on its own intentional release", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, channel } = await mountLive();
    await act(async () => {
      hook.unmount();
      await Promise.resolve();
    });

    // Athlete change: the old channel is released (its removal fires CLOSED),
    // and exactly one replacement is built.
    const other = mount("someone-else");
    await settle();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
    expect(mockChannels).toHaveLength(2);

    await advance(120_000);
    expect(mockChannels).toHaveLength(2);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("lobby channel lost"),
    );

    other.unmount();
    warn.mockRestore();
  });

  it("leaves a CHANNEL_ERROR / TIMED_OUT channel to phoenix's own rejoin", async () => {
    jest.useFakeTimers();
    const { hook, channel } = await mountLive();

    // Still registered: phoenix rejoins this exact instance itself.
    act(() => {
      channel.state = "errored";
      channel.subscribeHandler?.("CHANNEL_ERROR");
      channel.subscribeHandler?.("TIMED_OUT");
    });
    await advance(60_000);
    expect(mockChannels).toHaveLength(1);

    // The rejoin re-tracks, because a fresh join holds nothing server-side.
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).toHaveBeenCalledTimes(2);

    hook.unmount();
  });

  it("backs off across repeated losses, then waits for the foreground", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let appStateHandler: ((s: string) => void) | null = null;
    const { AppState } = require("react-native");
    const original = AppState.addEventListener;
    AppState.addEventListener = (_e: unknown, h: unknown) => {
      appStateHandler = h as (s: string) => void;
      return { remove: jest.fn() };
    };

    const { hook } = await mountLive();

    // Every rebuilt channel is closed straight after it joins and tracks,
    // which is what a server that keeps rate-limiting us looks like.
    const expectedDelays = [1_000, 5_000, 15_000, 30_000];
    for (const [i, delay] of expectedDelays.entries()) {
      const current = mockChannels[i];
      act(() => {
        mockClose(current);
      });
      await advance(delay - 1);
      expect(mockChannels).toHaveLength(i + 1);
      await advance(1);
      expect(mockChannels).toHaveLength(i + 2);
      await act(async () => {
        mockChannels[i + 1].subscribeHandler?.("SUBSCRIBED");
      });
      expect(mockChannels[i + 1].track).toHaveBeenCalledWith(PAYLOAD);
    }

    // A fifth loss in a row gives up rather than hammering the server.
    act(() => {
      mockClose(mockChannels[4]);
    });
    await advance(10 * 60_000);
    expect(mockChannels).toHaveLength(5);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("gave up rebuilding the lost lobby channel"),
    );

    // Coming back to the foreground tries again.
    await act(async () => {
      appStateHandler?.("active");
      await settle();
    });
    expect(mockChannels).toHaveLength(6);
    await act(async () => {
      mockChannels[5].subscribeHandler?.("SUBSCRIBED");
    });
    expect(mockChannels[5].track).toHaveBeenCalledWith(PAYLOAD);

    hook.unmount();
    AppState.addEventListener = original;
    warn.mockRestore();
  });

  it("an explicit go-live retries setup after the backoff gave up", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { hook } = await mountLive();
    for (let i = 0; i < 5; i++) {
      act(() => {
        mockClose(mockChannels[i]);
      });
      await advance(30_000);
      if (i < 4) {
        await act(async () => {
          mockChannels[i + 1].subscribeHandler?.("SUBSCRIBED");
        });
      }
    }
    expect(mockChannels).toHaveLength(5);

    await act(async () => {
      await leaveLobby();
      await joinLobby(PAYLOAD);
      await settle();
    });
    expect(mockChannels).toHaveLength(6);

    hook.unmount();
    warn.mockRestore();
  });

  it("starts the backoff over after a channel stayed healthy", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { hook, channel } = await mountLive();

    act(() => {
      mockClose(channel);
    });
    await advance(1_000);
    await act(async () => {
      mockChannels[1].subscribeHandler?.("SUBSCRIBED");
    });

    // Healthy for the whole rate-limit window, then lost again: 1s, not 5s.
    await advance(30_000);
    act(() => {
      mockClose(mockChannels[1]);
    });
    await advance(1_000);
    expect(mockChannels).toHaveLength(3);

    hook.unmount();
    warn.mockRestore();
  });
});

describe("useLobbyPresence: presence churn", () => {
  it("does not re-track an unchanged payload or untrack twice", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });

    await act(async () => {
      await joinLobby(PAYLOAD);
      await joinLobby(PAYLOAD);
      await joinLobby({ ...PAYLOAD });
    });
    expect(channel.track).toHaveBeenCalledTimes(1);

    // A changed payload is a real update.
    await act(async () => {
      await joinLobby({ ...PAYLOAD, current_elo: 1210 });
    });
    expect(channel.track).toHaveBeenCalledTimes(2);

    await act(async () => {
      await leaveLobby();
      await leaveLobby();
    });
    expect(channel.untrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    // Nothing tracked, so unmount's leave costs no presence call either.
    expect(channel.untrack).toHaveBeenCalledTimes(1);
  });

  it("never untracks what it never tracked", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
      await leaveLobby();
    });
    expect(channel.untrack).not.toHaveBeenCalled();
    unmount();
  });

  it("coalesces a burst of toggles into the final state", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });

    let resolveTrack: (s: string) => void = () => {};
    channel.track.mockImplementationOnce(
      () => new Promise<string>((r) => (resolveTrack = r)),
    );

    await act(async () => {
      const first = joinLobby(PAYLOAD);
      // Offline and live again while the first track is still in flight.
      const second = leaveLobby();
      const third = joinLobby(PAYLOAD);
      resolveTrack("ok");
      await Promise.all([first, second, third]);
    });
    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(channel.untrack).not.toHaveBeenCalled();

    // Ending offline after a burst still lands the untrack.
    await act(async () => {
      const a = leaveLobby();
      const b = joinLobby(PAYLOAD);
      const c = leaveLobby();
      await Promise.all([a, b, c]);
    });
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(channel.track).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("retries a track the server did not confirm", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.track.mockResolvedValueOnce("timed out");
    await act(async () => {
      await joinLobby(PAYLOAD);
      await joinLobby(PAYLOAD);
    });
    expect(channel.track).toHaveBeenCalledTimes(2);

    // Unconfirmed also means an untrack must still go out.
    channel.track.mockResolvedValueOnce("timed out");
    await act(async () => {
      await joinLobby({ ...PAYLOAD, current_elo: 1300 });
      await leaveLobby();
    });
    expect(channel.untrack).toHaveBeenCalledTimes(1);

    unmount();
  });
});

/**
 * A rate-limited track gets NO reply, and the server then closes the channel.
 * With real realtime-js the push's timeout can end up with nothing to fire
 * into, so the track promise never settles. The sync loop is module-level and
 * serialized, and `use-arena-live` awaits `joinLobby()`, so a call that never
 * settles used to freeze going live and going offline for the rest of the
 * app process.
 */
describe("useLobbyPresence: presence calls that never settle", () => {
  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
      await settle();
    });
  }

  function never(): Promise<string> {
    return new Promise<string>(() => {});
  }

  it("lets go of a hung track the moment the server closes the channel", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const hook = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.track.mockImplementation(never);

    let joined = false;
    await act(async () => {
      void joinLobby(PAYLOAD).then(() => {
        joined = true;
      });
      await settle();
    });
    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(joined).toBe(false);

    // Rate limited: no reply, then the server closes the channel.
    await act(async () => {
      mockClose(channel);
      await settle();
    });
    expect(joined).toBe(true);

    await advance(1_000);
    expect(mockChannels).toHaveLength(2);
    await act(async () => {
      mockChannels[1].subscribeHandler?.("SUBSCRIBED");
    });
    expect(mockChannels[1].track).toHaveBeenCalledWith(PAYLOAD);

    // And the loop is free: later calls resolve too.
    await act(async () => {
      await leaveLobby();
    });
    expect(mockChannels[1].untrack).toHaveBeenCalledTimes(1);

    hook.unmount();
    warn.mockRestore();
  });

  it("does not hold a match-entry leave behind a hung call on a lost channel", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const hook = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.track.mockImplementation(never);

    let left = false;
    await act(async () => {
      void joinLobby(PAYLOAD);
      // Entering a match while the track hangs.
      void leaveLobby().then(() => {
        left = true;
      });
      await settle();
    });
    expect(left).toBe(false);

    await act(async () => {
      mockClose(channel);
      await settle();
    });
    // Released at once, not after the 12s bound.
    expect(left).toBe(true);

    // The rebuilt channel does not put the athlete back in the lobby.
    await advance(1_000);
    await act(async () => {
      mockChannels[1].subscribeHandler?.("SUBSCRIBED");
    });
    expect(mockChannels[1].track).not.toHaveBeenCalled();

    hook.unmount();
    warn.mockRestore();
  });

  it("bounds a call that never settles on a channel that stays up, then re-syncs once", async () => {
    jest.useFakeTimers();
    const hook = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.track.mockImplementation(never);

    let joined = false;
    await act(async () => {
      void joinLobby(PAYLOAD).then(() => {
        joined = true;
      });
      await settle();
    });

    await advance(11_999);
    expect(joined).toBe(false);
    await advance(1);
    expect(joined).toBe(true);

    // Unconfirmed while still wanted: one follow-up track about 2s later.
    channel.track.mockResolvedValue("ok");
    await advance(1_999);
    expect(channel.track).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(channel.track).toHaveBeenCalledTimes(2);
    expect(channel.track).toHaveBeenLastCalledWith(PAYLOAD);

    hook.unmount();
  });

  it("re-syncs only once for a run of unconfirmed calls", async () => {
    jest.useFakeTimers();
    const hook = mount();
    await settle();
    const channel = mockChannels[0];
    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    channel.track.mockResolvedValue("timed out");

    await act(async () => {
      await joinLobby(PAYLOAD);
    });
    await advance(2_000);
    expect(channel.track).toHaveBeenCalledTimes(2);
    // The follow-up was unconfirmed too: no more presence calls on a timer.
    await advance(60_000);
    expect(channel.track).toHaveBeenCalledTimes(2);

    hook.unmount();
  });
});
