/**
 * `app:online` presence (jits-fa9x).
 *
 * The server closes a channel that exceeds its presence rate limit, and
 * realtime-js never rejoins a closed channel. Without a rebuild the athlete's
 * green dot disappears for everyone for the rest of the app process. A remount
 * that races the previous mount's removal is the same dead channel by a
 * different door, because `channel()` hands back the leaving instance.
 */
import { act, renderHook } from "@testing-library/react-native";

// ---- mocks ----

interface MockChannel {
  topic: string;
  config: unknown;
  state: "closed" | "joining" | "joined" | "errored" | "leaving";
  syncHandler: (() => void) | null;
  subscribeHandler: ((status: string) => void) | null;
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  untrack: jest.Mock;
  teardown: jest.Mock;
  presenceState: jest.Mock;
}

const mockChannels: MockChannel[] = [];
const mockRegistry: MockChannel[] = [];
/** Returns the removal status, or a promise of it for a slow removal. */
const mockRemoveChannel = jest.fn();

function mockMakeChannel(topic: string, config: unknown): MockChannel {
  const channel: MockChannel = {
    topic: `realtime:${topic}`,
    config,
    state: "closed",
    syncHandler: null,
    subscribeHandler: null,
    on: jest.fn((_t: string, _f: unknown, handler: () => void) => {
      channel.syncHandler = handler;
      return channel;
    }),
    subscribe: jest.fn((handler: (status: string) => void) => {
      channel.subscribeHandler = (status: string) => {
        if (status === "SUBSCRIBED") channel.state = "joined";
        handler(status);
      };
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
    removeChannel: async (channel: MockChannel) => {
      channel.state = "leaving";
      const status = (await mockRemoveChannel(channel)) ?? "ok";
      if (status === "ok") mockClose(channel);
      return status;
    },
  },
}));

import {
  useOnlinePresence,
  useOnlineStatus,
} from "@/lib/presence/use-online-presence";

// ---- fixtures ----

const ME = "athlete-me";
let appStateHandler: ((s: string) => void) | null = null;
const { AppState } = require("react-native");
const originalAddEventListener = AppState.addEventListener;

function mount(name = "Me") {
  return renderHook(
    ({ n }: { n: string }) => {
      useOnlinePresence(ME, n, null);
      return useOnlineStatus("athlete-a");
    },
    { initialProps: { n: name } },
  );
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await settle();
}

beforeEach(() => {
  mockChannels.length = 0;
  mockRegistry.length = 0;
  mockRemoveChannel.mockReset();
  mockRemoveChannel.mockReturnValue("ok");
  AppState.currentState = "active";
  // Swapped by hand: jest-expo's AppState mock is itself a jest.fn, and
  // mockRestore would leave one that returns undefined.
  AppState.addEventListener = (_e: unknown, h: unknown) => {
    appStateHandler = h as (s: string) => void;
    return { remove: jest.fn() };
  };
});

afterEach(() => {
  jest.useRealTimers();
  AppState.addEventListener = originalAddEventListener;
});

async function subscribed(channel: MockChannel) {
  await act(async () => {
    channel.subscribeHandler?.("SUBSCRIBED");
  });
}

describe("useOnlinePresence", () => {
  it("tracks on SUBSCRIBED and untracks once when the app leaves the foreground", async () => {
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    expect(channel.topic).toBe("realtime:app:online");
    await subscribed(channel);
    expect(channel.track).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.("inactive");
      appStateHandler?.("background");
    });
    expect(channel.untrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.("active");
    });
    expect(channel.track).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("rebuilds a server-closed channel and tracks on the new one", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount, result } = mount();
    await settle();
    const channel = mockChannels[0];
    await subscribed(channel);
    channel.presenceState.mockReturnValue({ "athlete-a": [{}] });
    act(() => {
      channel.syncHandler?.();
    });
    expect(result.current).toBe(true);

    act(() => {
      mockClose(channel);
    });
    expect(result.current).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("app:online channel lost (CLOSED)"),
    );

    await advance(1_000);
    expect(mockChannels).toHaveLength(2);
    expect(channel.teardown).toHaveBeenCalled();
    expect(mockRemoveChannel).not.toHaveBeenCalledWith(channel);
    await subscribed(mockChannels[1]);
    expect(mockChannels[1].track).toHaveBeenCalledWith({
      athlete_id: ME,
      display_name: "Me",
      profile_photo_url: null,
    });

    unmount();
    warn.mockRestore();
  });

  it("does not rebuild after its own unmount", async () => {
    jest.useFakeTimers();
    const { unmount } = mount();
    await settle();
    await subscribed(mockChannels[0]);
    unmount();
    await settle();
    await advance(120_000);
    expect(mockChannels).toHaveLength(1);
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannels[0]);
  });

  it("leaves CHANNEL_ERROR on a registered channel to phoenix's rejoin", async () => {
    jest.useFakeTimers();
    const { unmount } = mount();
    await settle();
    const channel = mockChannels[0];
    await subscribed(channel);
    act(() => {
      channel.state = "errored";
      channel.subscribeHandler?.("CHANNEL_ERROR");
    });
    await advance(60_000);
    expect(mockChannels).toHaveLength(1);
    await subscribed(channel);
    expect(channel.track).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("backs off across repeated losses, then waits for the foreground", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { unmount } = mount();
    await settle();
    await subscribed(mockChannels[0]);

    const delays = [1_000, 5_000, 15_000, 30_000];
    for (const [i, delay] of delays.entries()) {
      act(() => {
        mockClose(mockChannels[i]);
      });
      await advance(delay - 1);
      expect(mockChannels).toHaveLength(i + 1);
      await advance(1);
      expect(mockChannels).toHaveLength(i + 2);
      await subscribed(mockChannels[i + 1]);
    }
    act(() => {
      mockClose(mockChannels[4]);
    });
    await advance(10 * 60_000);
    expect(mockChannels).toHaveLength(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("gave up rebuilding"));

    await act(async () => {
      appStateHandler?.("active");
    });
    await settle();
    expect(mockChannels).toHaveLength(6);

    unmount();
    warn.mockRestore();
  });

  it("waits for the previous mount's removal instead of adopting the leaving channel", async () => {
    // A profile edit changes display_name, which re-runs the effect. The old
    // channel's removal is still waiting on the server when the new mount
    // asks for the topic.
    let confirmRemoval: (s: string) => void = () => {};
    mockRemoveChannel.mockImplementationOnce(
      () => new Promise<string>((r) => (confirmRemoval = r)),
    );
    const { rerender, unmount } = mount("Me");
    await settle();
    const first = mockChannels[0];
    await subscribed(first);

    rerender({ n: "Me Renamed" });
    await settle();
    // Not built yet: `channel()` would have handed back `first`.
    expect(mockChannels).toHaveLength(1);
    expect(first.subscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      confirmRemoval("ok");
    });
    await settle();
    expect(mockChannels).toHaveLength(2);
    await subscribed(mockChannels[1]);
    expect(mockChannels[1].track).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Me Renamed" }),
    );

    unmount();
  });
});
