/**
 * `lobby:online` presence.
 *
 * The two things that have actually broken here before, both guarded below:
 * a per-mount channel topic (which isolates the client into a lobby of one and
 * never syncs, jits-a8y.1), and a track that is issued before the channel has
 * joined and is therefore silently dropped.
 */
import { act, renderHook } from "@testing-library/react-native";
import { LOBBY_TOPIC } from "@/lib/arena/constants";

// ---- mocks ----

interface MockChannel {
  topic: string;
  config: unknown;
  syncHandler: (() => void) | null;
  subscribeHandler: ((status: string) => void) | null;
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  untrack: jest.Mock;
  presenceState: jest.Mock;
}

const mockChannels: MockChannel[] = [];
const mockRemoveChannel = jest.fn();

function mockMakeChannel(topic: string, config: unknown): MockChannel {
  const channel: MockChannel = {
    topic,
    config,
    syncHandler: null,
    subscribeHandler: null,
    on: jest.fn((_type: string, _filter: unknown, handler: () => void) => {
      channel.syncHandler = handler;
      return channel;
    }),
    subscribe: jest.fn((handler: (status: string) => void) => {
      channel.subscribeHandler = handler;
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
      const c = mockMakeChannel(topic, config);
      mockChannels.push(c);
      return c;
    },
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
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

beforeEach(() => {
  mockChannels.length = 0;
  mockRemoveChannel.mockClear();
});

describe("useLobbyPresence", () => {
  it("joins the shared lobby topic, keyed by athlete, exactly once", () => {
    const { rerender, unmount } = mount();

    expect(mockChannels).toHaveLength(1);
    // Byte-identical to web's topic. A per-mount name would give this client
    // its own empty lobby and the roster split would never populate.
    expect(mockChannels[0].topic).toBe(LOBBY_TOPIC);
    expect(mockChannels[0].topic).toBe("lobby:online");
    expect(mockChannels[0].config).toEqual({
      config: { presence: { key: ME } },
    });

    rerender(undefined);
    rerender(undefined);
    expect(mockChannels).toHaveLength(1);

    unmount();
  });

  it("publishes the presence roster to every subscriber on sync", () => {
    const { result, unmount } = mount();
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
    const channel = mockChannels[0];

    // A tap on Go live can land in the window between channel() and
    // SUBSCRIBED. The request has to survive that window: whatever a pre-join
    // track does with its buffer, the athlete must end up tracked once the
    // channel is actually up, or they never appear to anyone.
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
    const channel = mockChannels[0];

    await act(async () => {
      channel.subscribeHandler?.("SUBSCRIBED");
    });
    expect(channel.track).not.toHaveBeenCalled();

    // Went live after the channel was already up. SUBSCRIBED fires again on
    // every rejoin, and it has to re-assert what is true now.
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

  it("removes the channel and clears the roster on unmount", () => {
    const { result, unmount } = mount();
    const channel = mockChannels[0];
    channel.presenceState.mockReturnValue({ "athlete-a": [{}] });
    act(() => {
      channel.syncHandler?.();
    });
    expect(result.current.size).toBe(1);

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(channel);

    // A fresh mount must not inherit the previous lobby.
    const second = mount();
    expect(second.result.current.size).toBe(0);
    second.unmount();
  });

  it("does nothing without an athlete id", () => {
    const { unmount } = mount("");
    expect(mockChannels).toHaveLength(0);
    unmount();
  });
});
