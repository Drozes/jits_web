/**
 * `superviseChannel`: keep a realtime channel alive across a server close
 * (jits-fa9x). Shared by the Arena's challenge channels and the app-wide
 * open-match store, so it is pinned here on its own.
 */
import { AppState, type AppStateStatus } from "react-native";

interface MockChannel {
  id: number;
  status: ((s: string) => void) | null;
}
const mockBuilt: MockChannel[] = [];
/** What `getChannels()` reports: removed or server-closed ones drop out. */
const mockRegistry = new Set<MockChannel>();
const mockRemoveChannel = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    getChannels: () => [...mockRegistry],
    removeChannel: (channel: MockChannel) => {
      mockRegistry.delete(channel);
      mockRemoveChannel(channel.id);
      return Promise.resolve("ok");
    },
  },
}));

import {
  CHANNEL_LOSS_RETRY_DELAYS_MS,
  CHANNEL_LOSS_STREAK_RESET_MS,
  superviseChannel,
} from "@/lib/supabase/supervise-channel";

function build() {
  const channel = {
    id: mockBuilt.length + 1,
    status: null as ((s: string) => void) | null,
    subscribe(cb: (s: string) => void) {
      channel.status = cb;
      return channel;
    },
  };
  // The supervisor compares instances, so the registry holds the same object.
  mockBuilt.push(channel);
  mockRegistry.add(channel);
  return channel;
}

function latest(): MockChannel {
  return mockBuilt[mockBuilt.length - 1];
}

/** The server closing a channel: out of the registry, then CLOSED. */
function serverClose(channel: MockChannel) {
  mockRegistry.delete(channel);
  channel.status?.("CLOSED");
}

let appStateHandlers: ((s: AppStateStatus) => void)[] = [];
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  mockBuilt.length = 0;
  mockRegistry.clear();
  mockRemoveChannel.mockClear();
  appStateHandlers = [];
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event: string, handler: unknown) => {
      const h = handler as (s: AppStateStatus) => void;
      appStateHandlers.push(h);
      return {
        remove: jest.fn(() => {
          appStateHandlers = appStateHandlers.filter((x) => x !== h);
        }),
      } as never;
    });
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function supervise(onSubscribed = jest.fn()) {
  const stop = superviseChannel("test", build as never, onSubscribed);
  return { stop, onSubscribed };
}

describe("superviseChannel", () => {
  it("rebuilds after 1s, 5s, 15s and 30s, then gives up until the next foreground", () => {
    supervise();
    expect(mockBuilt).toHaveLength(1);

    for (const [i, delay] of CHANNEL_LOSS_RETRY_DELAYS_MS.entries()) {
      serverClose(latest());
      jest.advanceTimersByTime(delay - 1);
      expect(mockBuilt).toHaveLength(i + 1);
      jest.advanceTimersByTime(1);
      expect(mockBuilt).toHaveLength(i + 2);
    }
    expect(CHANNEL_LOSS_RETRY_DELAYS_MS).toEqual([1_000, 5_000, 15_000, 30_000]);

    // A fifth loss in a row: no timer, just a wait for the foreground.
    serverClose(latest());
    jest.advanceTimersByTime(10 * 60_000);
    expect(mockBuilt).toHaveLength(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[realtime] gave up rebuilding the test channel"));

    // "inactive" is not a return; "active" is, and it starts a fresh streak.
    appStateHandlers.forEach((h) => h("inactive"));
    expect(mockBuilt).toHaveLength(5);
    appStateHandlers.forEach((h) => h("active"));
    expect(mockBuilt).toHaveLength(6);
    serverClose(latest());
    jest.advanceTimersByTime(1_000);
    expect(mockBuilt).toHaveLength(7);
  });

  it("keeps rebuilding at the last step while keepRetrying() is true (a live, awake athlete)", () => {
    let live = true;
    superviseChannel("test", build as never, jest.fn(), { keepRetrying: () => live });
    for (const delay of CHANNEL_LOSS_RETRY_DELAYS_MS) {
      serverClose(latest());
      jest.advanceTimersByTime(delay);
    }
    expect(mockBuilt).toHaveLength(5);

    // Past the table: no foreground will come, so it retries every 30s.
    serverClose(latest());
    jest.advanceTimersByTime(29_999);
    expect(mockBuilt).toHaveLength(5);
    jest.advanceTimersByTime(1);
    expect(mockBuilt).toHaveLength(6);
    serverClose(latest());
    jest.advanceTimersByTime(30_000);
    expect(mockBuilt).toHaveLength(7);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("gave up"));

    // Offline again: the next exhausted loss gives up until a foreground.
    live = false;
    serverClose(latest());
    jest.advanceTimersByTime(10 * 60_000);
    expect(mockBuilt).toHaveLength(7);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("gave up rebuilding the test channel"));
    appStateHandlers.forEach((h) => h("active"));
    expect(mockBuilt).toHaveLength(8);
  });

  it("resume() restarts a channel that gave up while keepRetrying() was false, with no foreground", () => {
    let live = false;
    const sup = superviseChannel("test", build as never, jest.fn(), { keepRetrying: () => live });
    for (const delay of CHANNEL_LOSS_RETRY_DELAYS_MS) {
      serverClose(latest());
      jest.advanceTimersByTime(delay);
    }
    // Offline and past the table: it gives up.
    serverClose(latest());
    jest.advanceTimersByTime(10 * 60_000);
    expect(mockBuilt).toHaveLength(5);

    // The athlete goes live; the phone is held awake, so no AppState event.
    live = true;
    jest.advanceTimersByTime(10 * 60_000);
    expect(mockBuilt).toHaveLength(5);
    sup.resume();
    expect(mockBuilt).toHaveLength(6);

    // A fresh streak: the next loss waits the first step, not the last.
    serverClose(latest());
    jest.advanceTimersByTime(1_000);
    expect(mockBuilt).toHaveLength(7);
  });

  it("resume() is a no-op while the channel is up, rebuilding, or stopped", () => {
    const sup = superviseChannel("test", build as never, jest.fn());
    sup.resume();
    expect(mockBuilt).toHaveLength(1);

    serverClose(latest());
    sup.resume();
    expect(mockBuilt).toHaveLength(1);
    jest.advanceTimersByTime(1_000);
    expect(mockBuilt).toHaveLength(2);

    for (const delay of CHANNEL_LOSS_RETRY_DELAYS_MS.slice(1)) {
      serverClose(latest());
      jest.advanceTimersByTime(delay);
    }
    serverClose(latest());
    expect(mockBuilt).toHaveLength(5);
    sup();
    sup.resume();
    appStateHandlers.forEach((h) => h("active"));
    expect(mockBuilt).toHaveLength(5);
  });

  it("logs with a neutral realtime prefix, not the Arena's", () => {
    supervise();
    serverClose(latest());
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[realtime\] test channel closed/));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("[arena]"));
  });

  it("resets the losing streak once a channel stayed up for 30s", () => {
    supervise();
    serverClose(latest());
    jest.advanceTimersByTime(1_000);
    serverClose(latest());
    jest.advanceTimersByTime(5_000);
    expect(mockBuilt).toHaveLength(3);

    // This one joins and stays up long enough: the next loss is a first one.
    latest().status?.("SUBSCRIBED");
    jest.advanceTimersByTime(CHANNEL_LOSS_STREAK_RESET_MS);
    serverClose(latest());
    jest.advanceTimersByTime(1_000);
    expect(mockBuilt).toHaveLength(4);
  });

  it("ignores CLOSED, CHANNEL_ERROR and TIMED_OUT on a channel still registered (phoenix rejoins it)", () => {
    supervise();
    const first = latest();
    first.status?.("CHANNEL_ERROR");
    first.status?.("TIMED_OUT");
    first.status?.("CLOSED");
    jest.advanceTimersByTime(60_000);
    expect(mockBuilt).toHaveLength(1);
  });

  it("reports rebuilt only on the first SUBSCRIBED after a loss", () => {
    const { onSubscribed } = supervise();
    latest().status?.("SUBSCRIBED");
    // A phoenix rejoin of the same instance.
    latest().status?.("SUBSCRIBED");
    serverClose(latest());
    jest.advanceTimersByTime(1_000);
    latest().status?.("SUBSCRIBED");
    latest().status?.("SUBSCRIBED");
    expect(onSubscribed.mock.calls.map((c) => c[0])).toEqual([false, false, true, false]);
  });

  it("stops cleanly: removes the channel, cancels a pending rebuild, ignores late statuses", () => {
    const { stop, onSubscribed } = supervise();
    const first = latest();
    serverClose(first);
    stop();
    jest.advanceTimersByTime(60_000);
    expect(mockBuilt).toHaveLength(1);
    appStateHandlers.forEach((h) => h("active"));
    expect(mockBuilt).toHaveLength(1);
    first.status?.("SUBSCRIBED");
    expect(onSubscribed).not.toHaveBeenCalled();

    const second = supervise();
    const channel = latest();
    second.stop();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel.id);
  });
});
