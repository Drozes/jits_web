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
  getLeftMatchIds,
  isAthleteGoLiveFlip,
  liveSwitch,
  notifyOpponentUnavailable,
  publishArenaSelfId,
  publishArenaState,
  isIncomingChallengeDismissed,
  registerArenaController,
  setOpponentUnavailableHandler,
  clearOpponentUnavailableHandler,
  takeArenaOfflineBeforeSignOut,
  useArenaIncomingCount,
  useArenaMatchScreen,
  useArenaSelfId,
  useArenaState,
  useHasArenaController,
  useIsArenaDisplayLive,
  useIsArenaLive,
  useIsInArenaMatch,
  useLiveSwitchDirection,
  useLiveSwitchLocked,
  useLiveSwitchPhase,
  useMatchExitCount,
  type ArenaController,
  abandonTappedGoLive,
  areLiveWritesBlocked,
  beginRestoreRun,
  getGoLiveDisplay,
  getLiveIntent,
  isTappedGoLiveInFlight,
  registerGoLiveCanceller,
  registerIntentPersister,
  setGoLiveDisplay,
  setNeedsLocation,
  useArenaState as useArenaStateHook,
} from "@/lib/arena/arena-store";
import { LIVE_SWITCH_COOLDOWN_MS } from "@/lib/arena/constants";

function controller(over: Partial<ArenaController> = {}): ArenaController {
  return {
    toggle: jest.fn().mockResolvedValue(undefined),
    goOffline: jest.fn().mockResolvedValue(true),
    goLive: jest.fn().mockResolvedValue(true),
    sendChallenge: jest.fn().mockResolvedValue(undefined),
    cancelOutgoing: jest.fn().mockResolvedValue(undefined),
    clearCap: jest.fn(),
    tuckIncoming: jest.fn(),
    reopenIncoming: jest.fn(),
    ...over,
  };
}

beforeEach(() => {
  __resetArenaStoreForTests();
  jest.useRealTimers();
});

/** The published snapshot, read through a hook. */
function state() {
  return renderHook(() => useArenaStateHook()).result.current;
}

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

  it("useArenaIncomingCount re-renders only when the count changes", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useArenaIncomingCount();
    });
    expect(result.current).toBe(0);
    const before = renders;

    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isBusy: true });
    });
    expect(renders).toBe(before);

    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isBusy: true, incomingCount: 2 });
    });
    expect(result.current).toBe(2);
    expect(renders).toBe(before + 1);
  });
});

describe("signed-in athlete id (header chip)", () => {
  it("starts null, follows the owner, and does not wake readers for the same id", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useArenaSelfId();
    });
    expect(result.current).toBeNull();
    act(() => publishArenaSelfId("a1"));
    expect(result.current).toBe("a1");
    const before = renders;
    act(() => publishArenaSelfId("a1"));
    expect(renders).toBe(before);
    act(() => publishArenaSelfId(null));
    expect(result.current).toBeNull();
  });

  it("is cleared by the test reset", () => {
    publishArenaSelfId("a1");
    __resetArenaStoreForTests();
    const { result } = renderHook(() => useArenaSelfId());
    expect(result.current).toBeNull();
  });
});

describe("actions", () => {
  it("are harmless no-ops when no owner is mounted", async () => {
    // No owner, so no write was attempted: "ignored", never a failure a
    // caller would toast.
    await expect(arenaActions.toggle()).resolves.toBeUndefined();
    await expect(liveSwitch.toggle()).resolves.toBe("ignored");
    await expect(arenaActions.goOffline()).resolves.toBe("ignored");
    await expect(arenaActions.goLive()).resolves.toBe("ignored");
    expect(() => arenaActions.clearCap()).not.toThrow();
  });

  it("goLive delegates to the controller's idempotent go-live", async () => {
    const c = controller();
    const off = registerArenaController(c);
    await expect(arenaActions.goLive()).resolves.toBe(true);
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(c.toggle).not.toHaveBeenCalled();
    off();
  });

  it("delegate to the registered controller", async () => {
    const c = controller();
    registerArenaController(c);

    // The toggle is a choice now (review round 3): offline, so it goes live.
    await arenaActions.toggle();
    await arenaActions.sendChallenge("a-1", "Alpha");

    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(c.sendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("isIncomingChallengeDismissed asks the owner, and is false without one", () => {
    expect(isIncomingChallengeDismissed("ch-1")).toBe(false);
    const isIncomingDismissed = jest.fn((id: string) => id === "ch-1");
    const off = registerArenaController({ ...controller(), isIncomingDismissed });
    expect(isIncomingChallengeDismissed("ch-1")).toBe(true);
    expect(isIncomingChallengeDismissed("ch-2")).toBe(false);
    off();
    expect(isIncomingChallengeDismissed("ch-1")).toBe(false);
    // An owner that does not report dismissals reads as none.
    const off2 = registerArenaController(controller());
    expect(isIncomingChallengeDismissed("ch-1")).toBe(false);
    off2();
  });

  it("an old owner's unregister does not remove a newer owner", async () => {
    const first = controller();
    const second = controller();
    const unregisterFirst = registerArenaController(first);
    registerArenaController(second);

    unregisterFirst();
    await arenaActions.toggle();

    expect(second.goLive).toHaveBeenCalledTimes(1);
    expect(first.goLive).not.toHaveBeenCalled();
  });

  it("useHasArenaController follows the owner registering and leaving", () => {
    const { result } = renderHook(() => useHasArenaController());
    expect(result.current).toBe(false);

    const first = controller();
    let offFirst: () => void = () => {};
    act(() => {
      offFirst = registerArenaController(first);
    });
    expect(result.current).toBe(true);

    // A stale owner's unregister after a newer one took over changes nothing.
    let offSecond: () => void = () => {};
    act(() => {
      offSecond = registerArenaController(controller());
    });
    act(() => offFirst());
    expect(result.current).toBe(true);

    act(() => offSecond());
    expect(result.current).toBe(false);
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

  it("an older owner's cleanup never clears a newer owner's handler", () => {
    const first = jest.fn();
    const second = jest.fn();
    setOpponentUnavailableHandler(first);
    setOpponentUnavailableHandler(second); // a second Arena mounted
    clearOpponentUnavailableHandler(first); // the first one unmounts
    notifyOpponentUnavailable("a-3");
    expect(second).toHaveBeenCalledWith("a-3");
    expect(first).not.toHaveBeenCalled();

    clearOpponentUnavailableHandler(second);
    notifyOpponentUnavailable("a-4");
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("in-match bit", () => {
  it("is set while any match screen is mounted, counted rather than toggled", () => {
    const probe = renderHook(() => useIsInArenaMatch());
    expect(probe.result.current).toBe(false);

    const a = renderHook(() => useArenaMatchScreen());
    const b = renderHook(() => useArenaMatchScreen());
    expect(probe.result.current).toBe(true);

    // A navigation that mounts the next match before the old unmounts.
    a.unmount();
    expect(probe.result.current).toBe(true);
    b.unmount();
    expect(probe.result.current).toBe(false);
  });
});

describe("match-exit count (jits-tlk3)", () => {
  it("bumps once per true-to-false transition of the in-match bit", () => {
    const probe = renderHook(() => useMatchExitCount());
    const start = probe.result.current;

    const a = renderHook(() => useArenaMatchScreen());
    expect(probe.result.current).toBe(start);
    a.unmount();
    expect(probe.result.current).toBe(start + 1);

    // Two overlapping match screens are one match left, not two.
    const b = renderHook(() => useArenaMatchScreen());
    const c = renderHook(() => useArenaMatchScreen());
    b.unmount();
    expect(probe.result.current).toBe(start + 1);
    c.unmount();
    expect(probe.result.current).toBe(start + 2);
  });

  it("resets to 0 between tests, so no count leaks by test order", () => {
    const a = renderHook(() => useArenaMatchScreen());
    a.unmount();
    __resetArenaStoreForTests();
    const probe = renderHook(() => useMatchExitCount());
    expect(probe.result.current).toBe(0);
  });
});

describe("left match ids (jits-r9a)", () => {
  it("records a match id once its screen unmounts, before exit listeners run", () => {
    __resetArenaStoreForTests();
    expect([...getLeftMatchIds()]).toEqual([]);

    const seenAtExit: string[][] = [];
    const probe = renderHook(() => {
      const exits = useMatchExitCount();
      seenAtExit.push([...getLeftMatchIds()]);
      return exits;
    });
    const start = probe.result.current;

    const screen = renderHook(() => useArenaMatchScreen("11111111-1111-4111-8111-111111111111"));
    // Still on the match: not left yet.
    expect(getLeftMatchIds().has("11111111-1111-4111-8111-111111111111")).toBe(false);
    screen.unmount();

    expect(probe.result.current).toBe(start + 1);
    expect(getLeftMatchIds().has("11111111-1111-4111-8111-111111111111")).toBe(true);
    // The render the exit caused already saw the id.
    expect(seenAtExit[seenAtExit.length - 1]).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("records nothing for a screen mounted without an id, and resets for tests", () => {
    __resetArenaStoreForTests();
    renderHook(() => useArenaMatchScreen()).unmount();
    expect(getLeftMatchIds().size).toBe(0);

    renderHook(() => useArenaMatchScreen("22222222-2222-4222-8222-222222222222")).unmount();
    expect(getLeftMatchIds().has("22222222-2222-4222-8222-222222222222")).toBe(true);
    __resetArenaStoreForTests();
    expect(getLeftMatchIds().size).toBe(0);
  });

  it("never records an id that is not a UUID", () => {
    __resetArenaStoreForTests();
    renderHook(() => useArenaMatchScreen("m-1),id.eq.x")).unmount();
    renderHook(() => useArenaMatchScreen("not-a-uuid")).unmount();
    expect(getLeftMatchIds().size).toBe(0);
  });

  it("forgets left matches on sign-out, even with no owner mounted", async () => {
    __resetArenaStoreForTests();
    renderHook(() => useArenaMatchScreen("22222222-2222-4222-8222-222222222222")).unmount();
    expect(getLeftMatchIds().size).toBe(1);
    await takeArenaOfflineBeforeSignOut();
    expect(getLeftMatchIds().size).toBe(0);
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

describe("new snapshot fields", () => {
  it("idles with no incoming count and nothing tucked", () => {
    expect(IDLE_ARENA_STATE.incomingCount).toBe(0);
    expect(IDLE_ARENA_STATE.incomingTucked).toBe(false);
  });

  it("idles with no failed write and not reconnecting, and publishes both (AC-H11)", () => {
    expect(IDLE_ARENA_STATE.lastLiveWriteFailed).toBe(false);
    expect(IDLE_ARENA_STATE.reconnecting).toBe(false);
    const probe = renderHook(() => useArenaState());
    act(() => publishArenaState({ ...IDLE_ARENA_STATE, lastLiveWriteFailed: true }));
    expect(probe.result.current.lastLiveWriteFailed).toBe(true);
    act(() =>
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true, reconnecting: true }),
    );
    expect(probe.result.current).toMatchObject({
      isLive: true,
      reconnecting: true,
      lastLiveWriteFailed: false,
    });
  });

  it("routes Later and reopen to the owner, and no-ops without one", () => {
    arenaActions.tuckIncoming();
    arenaActions.reopenIncoming();
    const c = controller();
    registerArenaController(c);
    arenaActions.tuckIncoming();
    arenaActions.reopenIncoming();
    expect(c.tuckIncoming).toHaveBeenCalledTimes(1);
    expect(c.reopenIncoming).toHaveBeenCalledTimes(1);
  });
});

describe("the athlete's intent (review round 3: one source of truth, last choice wins)", () => {
  /** A controller whose writes publish the committed state, like the owner. */
  function liveController(over: Partial<ArenaController> = {}) {
    let live = false;
    const c = controller({
      goLive: jest.fn(async () => {
        live = true;
        publishArenaState({ ...IDLE_ARENA_STATE, isLive: true });
        return true;
      }),
      goOffline: jest.fn(async () => {
        live = false;
        publishArenaState({ ...IDLE_ARENA_STATE, isLive: false });
        return true;
      }),
      committed: () => ({ live, settled: true }),
      ...over,
    });
    return c;
  }

  it("records each choice at once, drawn at once, whatever is in flight", async () => {
    let release!: (v: boolean) => void;
    const c = liveController({ goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))) });
    registerArenaController(c);
    let p!: Promise<unknown>;
    act(() => {
      p = liveSwitch.goLive();
    });
    expect(getLiveIntent()).toMatchObject({ live: true, decided: true, explicit: true });
    // Offline while the go-live is in flight: recorded and drawn at once.
    act(() => {
      void liveSwitch.goOffline();
    });
    expect(getLiveIntent()).toMatchObject({ live: false, explicit: true });
    expect(c.goOffline).toHaveBeenCalledTimes(1);
    // The overtaken go-live never reports anything (no toast).
    await act(async () => {
      release(true);
      expect(await p).toBe("ignored");
    });
  });

  it("an offline choice cancels the go-live work in flight", () => {
    registerArenaController(liveController({ goLive: jest.fn(() => new Promise<boolean>(() => undefined)) }));
    const cancel = jest.fn();
    act(() => {
      void liveSwitch.goLive();
    });
    registerGoLiveCanceller(cancel);
    act(() => {
      void liveSwitch.goOffline();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("nit: a cancelled go-live write that lands after the offline choice never draws a LIVE frame", async () => {
    let release!: (v: boolean) => void;
    registerArenaController(
      liveController({ goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))) }),
    );
    const frames: boolean[] = [];
    renderHook(() => {
      const live = useIsArenaDisplayLive();
      if (frames[frames.length - 1] !== live) frames.push(live);
    });
    act(() => {
      void liveSwitch.goLive();
    });
    act(() => {
      void liveSwitch.goOffline();
    });
    const after = frames.length;
    await act(async () => {
      // The write that was in flight lands: the owner publishes live for a
      // moment before the clear (serialized behind it) takes it back.
      release(true);
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true });
      await Promise.resolve();
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: false });
    });
    expect(frames.slice(after)).not.toContain(true);
    expect(frames[frames.length - 1]).toBe(false);
  });

  it("QA 1: O, L, O inside the cooldown ends OFFLINE (the last choice), never a live write after it", async () => {
    jest.useFakeTimers();
    const c = liveController();
    registerArenaController(c);
    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(c.goLive).toHaveBeenCalledTimes(1);
    await act(async () => {
      void liveSwitch.goOffline();
      void liveSwitch.goLive();
      void liveSwitch.goOffline();
      await jest.advanceTimersByTimeAsync(LIVE_SWITCH_COOLDOWN_MS * 3);
    });
    expect(getLiveIntent().live).toBe(false);
    // The queued live never ran: the last choice overtook it.
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(state().isLive).toBe(false);
  });

  it("the LIVE write is paced by the cooldown after a transition; a choice inside it waits, shown pending", async () => {
    jest.useFakeTimers();
    const c = liveController();
    registerArenaController(c);
    await act(async () => {
      await liveSwitch.goLive();
      await liveSwitch.goOffline();
    });
    let p!: Promise<unknown>;
    act(() => {
      p = liveSwitch.goLive();
    });
    expect(getGoLiveDisplay()).toBe("going-live");
    expect(c.goLive).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(LIVE_SWITCH_COOLDOWN_MS);
      expect(await p).toBe(true);
    });
    expect(c.goLive).toHaveBeenCalledTimes(2);
  });

  it("a go-live that fails resolves false (say so) and holds the intent offline (nothing resumes it)", async () => {
    registerArenaController(liveController({ goLive: jest.fn().mockResolvedValue(false) }));
    let r: unknown;
    await act(async () => {
      r = await liveSwitch.goLive();
    });
    expect(r).toBe(false);
    expect(getLiveIntent()).toMatchObject({ live: false, decided: true, explicit: false });
  });

  it("a RETRY (a new live choice) during a hung attempt waits for it and never runs alongside", async () => {
    let release!: (v: boolean) => void;
    const goLive = jest.fn(() => new Promise<boolean>((r) => (release = r)));
    registerArenaController(liveController({ goLive }));
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = liveSwitch.goLive();
    });
    act(() => {
      second = liveSwitch.goLive();
    });
    expect(goLive).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(false);
      expect(await first).toBe("ignored");
    });
  });

  it("no-ops without an owner (\"ignored\", never a failure)", async () => {
    await expect(liveSwitch.goLive()).resolves.toBe("ignored");
    await expect(liveSwitch.goOffline()).resolves.toBe("ignored");
  });

  it("phase is information only: 'saving' during an attempt, 'cooldown' after, choices never locked", async () => {
    jest.useFakeTimers();
    let release!: (v: boolean) => void;
    registerArenaController(liveController({ goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))) }));
    const { result } = renderHook(() => useLiveSwitchPhase());
    act(() => {
      void liveSwitch.goLive();
    });
    expect(result.current).toBe("saving");
    await act(async () => {
      release(true);
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe("cooldown");
    const locked = renderHook(() => useLiveSwitchLocked());
    expect(locked.result.current).toBe(false);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(LIVE_SWITCH_COOLDOWN_MS);
    });
    expect(result.current).toBe("ready");
  });

  it("reads 'saving' with the restore's direction while a restore runs", () => {
    registerArenaController(liveController());
    const phase = renderHook(() => useLiveSwitchPhase());
    const dir = renderHook(() => useLiveSwitchDirection());
    let end!: () => void;
    act(() => {
      end = beginRestoreRun();
    });
    expect(phase.result.current).toBe("saving");
    expect(dir.result.current).toBe("going-live");
    act(() => end());
    expect(phase.result.current).toBe("ready");
  });

  it("a live choice during a restore waits for it, then is met without a second attempt", async () => {
    const c = liveController();
    registerArenaController(c);
    let end!: () => void;
    act(() => {
      end = beginRestoreRun();
    });
    let p!: Promise<unknown>;
    act(() => {
      p = liveSwitch.goLive();
    });
    expect(c.goLive).not.toHaveBeenCalled();
    // The restore landed meanwhile.
    await act(async () => {
      await c.goLive();
      end();
      expect(await p).toBe(true);
    });
    expect(c.goLive).toHaveBeenCalledTimes(1);
  });

  it("SF1: restore runs own their lock: one ending never unlocks another still running", () => {
    registerArenaController(controller());
    const { result } = renderHook(() => useLiveSwitchPhase());
    let endA!: () => void;
    let endB!: () => void;
    act(() => {
      endA = beginRestoreRun();
      endB = beginRestoreRun();
    });
    expect(result.current).toBe("saving");
    act(() => endA());
    expect(result.current).toBe("saving");
    act(() => endA());
    expect(result.current).toBe("saving");
    act(() => endB());
    expect(result.current).toBe("ready");
  });

  it("X2: sign-out drops a pending live choice and no live write runs after it starts", async () => {
    jest.useFakeTimers();
    const c = liveController();
    const unregister = registerArenaController(c);
    await act(async () => {
      await liveSwitch.goLive();
      await liveSwitch.goOffline();
    });
    let p!: Promise<unknown>;
    act(() => {
      p = liveSwitch.goLive(); // waiting out the cooldown
    });
    await act(async () => {
      await takeArenaOfflineBeforeSignOut(10);
      await jest.advanceTimersByTimeAsync(LIVE_SWITCH_COOLDOWN_MS * 3);
    });
    expect(await p).toBe("ignored");
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(areLiveWritesBlocked()).toBe(true);
    // A choice after sign-out started does nothing either.
    await expect(liveSwitch.goLive()).resolves.toBe("ignored");
    // The owner unmounts; a new one (the next sign-in) may write again, with
    // a fresh intent.
    act(() => {
      unregister();
      registerArenaController(liveController());
    });
    expect(areLiveWritesBlocked()).toBe(false);
    expect(getLiveIntent().decided).toBe(false);
  });

  it("QA 3: sign-out leaves no OFFLINE · RETRY (or any overlay) behind", async () => {
    registerArenaController(liveController());
    act(() => {
      setGoLiveDisplay("retry");
      setNeedsLocation(true);
    });
    await act(async () => {
      await takeArenaOfflineBeforeSignOut(10);
    });
    expect(getGoLiveDisplay()).toBeNull();
  });

  it("persists every choice through the owner's persister", async () => {
    const persisted: boolean[] = [];
    registerArenaController(liveController());
    registerIntentPersister((live) => persisted.push(live));
    await act(async () => {
      await liveSwitch.goLive();
      await liveSwitch.goOffline();
    });
    expect(persisted).toEqual([true, false]);
  });

  it("abandonTappedGoLive (background, a match) holds offline and cancels the work", () => {
    registerArenaController(liveController({ goLive: jest.fn(() => new Promise<boolean>(() => undefined)) }));
    const cancel = jest.fn();
    act(() => {
      void liveSwitch.goLive();
    });
    registerGoLiveCanceller(cancel);
    expect(isTappedGoLiveInFlight()).toBe(true);
    act(() => abandonTappedGoLive());
    expect(cancel).toHaveBeenCalled();
    expect(getLiveIntent()).toMatchObject({ live: false, explicit: false });
  });
});

describe("isAthleteGoLiveFlip (Arena tab blade clash, Adding Flare)", () => {
  it("is false with no guarded go-live, so an app restore never counts", () => {
    registerArenaController(controller());
    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, liveTransition: "going-live" });
    });
    expect(isAthleteGoLiveFlip()).toBe(false);
  });

  it("is true while the athlete's go-live is in flight and for 2s after it settles", async () => {
    let release!: (v: boolean) => void;
    registerArenaController(
      controller({ goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))) }),
    );
    let call!: Promise<boolean | "ignored">;
    act(() => {
      call = liveSwitch.goLive();
    });
    expect(isAthleteGoLiveFlip()).toBe(true);
    // The store stamps the settle time inside the act, so bracket it: the
    // window is 2s from a stamp in [before, after]. Reading Date.now() only
    // after the act made this fail whenever a millisecond passed (jits-psyv).
    const before = Date.now();
    await act(async () => {
      release(true);
      await call;
    });
    const after = Date.now();
    expect(isAthleteGoLiveFlip(before + 2000)).toBe(true);
    expect(isAthleteGoLiveFlip(after + 2500)).toBe(false);
  });

  it("is false after a go-offline", async () => {
    registerArenaController(controller());
    await act(async () => {
      await liveSwitch.goOffline();
    });
    expect(isAthleteGoLiveFlip()).toBe(false);
  });

  it("forgets a settled go-live on sign-out, so the next athlete's arrival never counts", async () => {
    registerArenaController(controller());
    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(isAthleteGoLiveFlip()).toBe(true);
    await act(async () => {
      await takeArenaOfflineBeforeSignOut(10);
    });
    expect(isAthleteGoLiveFlip()).toBe(false);
  });

  it("forgets a settled go-live when the app goes to the background", async () => {
    registerArenaController(controller());
    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(isAthleteGoLiveFlip()).toBe(true);
    // The module listens to AppState from load; drive its listener.
    const { AppState } = require("react-native");
    const calls = (AppState.addEventListener as jest.Mock).mock?.calls ?? [];
    const listeners = calls
      .filter((c: unknown[]) => c[0] === "change")
      .map((c: unknown[]) => c[1] as (s: string) => void);
    expect(listeners.length).toBeGreaterThan(0);
    for (const l of listeners) l("inactive");
    expect(isAthleteGoLiveFlip()).toBe(true);
    for (const l of listeners) l("background");
    expect(isAthleteGoLiveFlip()).toBe(false);
  });
});
