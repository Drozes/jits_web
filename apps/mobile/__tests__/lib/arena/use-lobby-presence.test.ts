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
  syncHandler: (() => void) | null;
  subscribeHandler: ((status: string) => void) | null;
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  untrack: jest.Mock;
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
      channel.subscribeHandler = handler;
      channel.joined = true;
      return channel;
    }),
    track: jest.fn().mockResolvedValue(undefined),
    untrack: jest.fn().mockResolvedValue(undefined),
    presenceState: jest.fn(() => ({})),
  };
  return channel;
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
        const i = mockRegistry.indexOf(channel);
        if (i >= 0) mockRegistry.splice(i, 1);
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
