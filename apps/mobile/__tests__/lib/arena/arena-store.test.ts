/**
 * The app-wide Arena store: one owner publishes, everyone else reads, and
 * actions go through a registered controller so a call made with no owner
 * mounted is a harmless no-op rather than a crash.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  arenaActions,
  notifyOpponentUnavailable,
  publishArenaState,
  registerArenaController,
  setOpponentUnavailableHandler,
  takeArenaOfflineBeforeSignOut,
  useArenaMatchScreen,
  useArenaState,
  useIsArenaLive,
  useIsInArenaMatch,
  type ArenaController,
} from "@/lib/arena/arena-store";

function controller(over: Partial<ArenaController> = {}): ArenaController {
  return {
    toggle: jest.fn().mockResolvedValue(undefined),
    goOffline: jest.fn().mockResolvedValue(true),
    sendChallenge: jest.fn().mockResolvedValue(undefined),
    cancelOutgoing: jest.fn().mockResolvedValue(undefined),
    clearCap: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  __resetArenaStoreForTests();
  jest.useRealTimers();
});

describe("state", () => {
  it("reads idle (not live) before any owner publishes", () => {
    const { result } = renderHook(() => useIsArenaLive());
    expect(result.current).toBe(false);
  });

  it("wakes readers when the owner publishes", () => {
    const { result } = renderHook(() => useIsArenaLive());

    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true });
    });

    expect(result.current).toBe(true);
  });

  it("drops a shallow-equal publish so headers do not re-render for nothing", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useArenaState();
    });
    const before = renders;

    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE });
    });

    expect(renders).toBe(before);
  });
});

describe("actions", () => {
  it("are harmless no-ops when no owner is mounted", async () => {
    await expect(arenaActions.toggle()).resolves.toBeUndefined();
    await expect(arenaActions.goOffline()).resolves.toBe(true);
    expect(() => arenaActions.clearCap()).not.toThrow();
  });

  it("delegate to the registered controller", async () => {
    const c = controller();
    registerArenaController(c);

    await arenaActions.toggle();
    await arenaActions.sendChallenge("a-1", "Alpha");

    expect(c.toggle).toHaveBeenCalled();
    expect(c.sendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("an old owner's unregister does not remove a newer owner", async () => {
    const first = controller();
    const second = controller();
    const unregisterFirst = registerArenaController(first);
    registerArenaController(second);

    unregisterFirst();
    await arenaActions.toggle();

    expect(second.toggle).toHaveBeenCalled();
  });
});

describe("roster correction hand-off", () => {
  it("reaches the handler the Arena screen registered, and nothing after it leaves", () => {
    const handler = jest.fn();
    setOpponentUnavailableHandler(handler);
    notifyOpponentUnavailable("a-1");
    setOpponentUnavailableHandler(null);
    notifyOpponentUnavailable("a-2");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("a-1");
  });
});

describe("in-match bit", () => {
  it("is set while any match screen is mounted, counted rather than toggled", () => {
    const probe = renderHook(() => useIsInArenaMatch());
    expect(probe.result.current).toBe(false);

    const a = renderHook(() => useArenaMatchScreen());
    const b = renderHook(() => useArenaMatchScreen());
    expect(probe.result.current).toBe(true);

    // A router.replace that mounts the next match before the old unmounts.
    a.unmount();
    expect(probe.result.current).toBe(true);
    b.unmount();
    expect(probe.result.current).toBe(false);
  });
});

describe("takeArenaOfflineBeforeSignOut", () => {
  it("clears the flag through the owner while the session still exists", async () => {
    const c = controller();
    registerArenaController(c);

    await takeArenaOfflineBeforeSignOut();

    expect(c.goOffline).toHaveBeenCalledTimes(1);
  });

  it("is a no-op with no owner mounted", async () => {
    await expect(takeArenaOfflineBeforeSignOut()).resolves.toBeUndefined();
  });

  it("gives up after the timeout so a dead network cannot trap sign-out", async () => {
    jest.useFakeTimers();
    registerArenaController(
      controller({ goOffline: () => new Promise<boolean>(() => {}) }),
    );

    let done = false;
    const p = takeArenaOfflineBeforeSignOut(1_000).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    jest.advanceTimersByTime(1_000);
    await p;
    expect(done).toBe(true);
  });

  it("never rejects, even when going offline throws", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    registerArenaController(
      controller({ goOffline: () => Promise.reject(new Error("boom")) }),
    );

    await expect(takeArenaOfflineBeforeSignOut()).resolves.toBeUndefined();
  });
});
