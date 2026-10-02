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
  useIsArenaLive,
  useIsInArenaMatch,
  useLiveSwitchDirection,
  useLiveSwitchLocked,
  useLiveSwitchPhase,
  useMatchExitCount,
  type ArenaController,
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

    await arenaActions.toggle();
    await arenaActions.sendChallenge("a-1", "Alpha");

    expect(c.toggle).toHaveBeenCalled();
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

    expect(second.toggle).toHaveBeenCalled();
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

describe("live switch guard (F11: disabled while saving, 2s cooldown, no undo)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads 'saving' with the restore's direction while a transition it did not start is in flight", async () => {
    const toggle = jest.fn().mockResolvedValue(undefined);
    registerArenaController(controller({ toggle }));
    const phase = renderHook(() => useLiveSwitchPhase());
    const direction = renderHook(() => useLiveSwitchDirection());
    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, liveTransition: "going-live" });
    });
    expect(phase.result.current).toBe("saving");
    expect(direction.result.current).toBe("going-live");

    let out: unknown;
    await act(async () => {
      out = await liveSwitch.toggle();
    });
    expect(out).toBe("ignored");
    expect(toggle).not.toHaveBeenCalled();

    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true, liveTransition: null });
    });
    expect(phase.result.current).toBe("ready");
    expect(direction.result.current).toBeNull();
  });

  it("reads 'saving' while the owner reports isSaving, and ignores taps", async () => {
    const c = controller();
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchPhase());
    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isSaving: true });
    });
    expect(result.current).toBe("saving");

    let ok: boolean | "ignored" | undefined;
    await act(async () => {
      ok = await liveSwitch.goLive();
    });
    // Ignored, not failed: a caller must not toast "Couldn't take you live".
    expect(ok).toBe("ignored");
    expect(c.goLive).not.toHaveBeenCalled();
  });

  it("is 'saving' while a guarded call is in flight, so a double tap is one call (AC-H2/H3)", async () => {
    let release!: (v: boolean) => void;
    const c = controller({
      goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))),
    });
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchPhase());

    let first!: Promise<boolean | "ignored">;
    act(() => {
      first = liveSwitch.goLive();
    });
    expect(result.current).toBe("saving");
    let second: boolean | "ignored" | undefined;
    await act(async () => {
      second = await liveSwitch.goLive();
    });
    expect(second).toBe("ignored");
    expect(c.goLive).toHaveBeenCalledTimes(1);

    let firstResult: boolean | "ignored" | undefined;
    await act(async () => {
      release(true);
      firstResult = await first;
    });
    expect(firstResult).toBe(true);
    expect(result.current).toBe("cooldown");
  });

  it("reports a failed transition as false, distinct from an ignored tap", async () => {
    const c = controller({ goOffline: jest.fn().mockResolvedValue(false) });
    registerArenaController(c);
    let first: boolean | "ignored" | undefined;
    let second: boolean | "ignored" | undefined;
    await act(async () => {
      first = await liveSwitch.goOffline();
      second = await liveSwitch.goOffline();
    });
    expect(first).toBe(false);
    expect(second).toBe("ignored");
    expect(c.goOffline).toHaveBeenCalledTimes(1);
  });

  it("exposes the direction of the transition in flight, and null otherwise", async () => {
    let release!: (v: boolean) => void;
    const c = controller({
      goOffline: jest.fn(() => new Promise<boolean>((r) => (release = r))),
      toggle: jest.fn(() => new Promise<void>(() => {})),
    });
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchDirection());
    expect(result.current).toBeNull();

    let p!: Promise<boolean | "ignored">;
    act(() => {
      p = liveSwitch.goOffline();
    });
    // The chip keeps its live styling: this is not GOING LIVE.
    expect(result.current).toBe("going-offline");
    await act(async () => {
      release(true);
      await p;
    });
    expect(result.current).toBeNull();
  });

  it("derives a toggle's direction from the live state it starts from", () => {
    jest.useFakeTimers();
    const c = controller({ toggle: jest.fn(() => new Promise<void>(() => {})) });
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchDirection());
    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true });
    });
    act(() => {
      void liveSwitch.toggle();
    });
    expect(result.current).toBe("going-offline");
  });

  it("no-ops without an owner and never starts a cooldown for it", async () => {
    const { result } = renderHook(() => useLiveSwitchPhase());
    let live: boolean | "ignored" | undefined;
    let off: boolean | "ignored" | undefined;
    await act(async () => {
      live = await liveSwitch.goLive();
      off = await liveSwitch.goOffline();
      await liveSwitch.toggle();
    });
    // Nothing was attempted, so nothing for a caller to toast.
    expect(live).toBe("ignored");
    expect(off).toBe("ignored");
    expect(result.current).toBe("ready");

    // An owner that mounts right after is honoured at once.
    const c = controller();
    registerArenaController(c);
    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(c.goLive).toHaveBeenCalledTimes(1);
  });

  it("ignores a second action within 2s of completion and honours it after (AC-H4)", async () => {
    jest.useFakeTimers();
    const c = controller();
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchLocked());

    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);

    let ignored: boolean | "ignored" | undefined;
    await act(async () => {
      ignored = await liveSwitch.goOffline();
      await arenaActions.toggle();
    });
    expect(ignored).toBe("ignored");
    expect(c.goOffline).not.toHaveBeenCalled();
    expect(c.toggle).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(LIVE_SWITCH_COOLDOWN_MS - 1);
    });
    expect(result.current).toBe(true);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      await liveSwitch.goOffline();
    });
    expect(c.goOffline).toHaveBeenCalledTimes(1);
  });

  it("starts the cooldown even when the transition failed", async () => {
    const c = controller({ goLive: jest.fn().mockRejectedValue(new Error("x")) });
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchPhase());
    await act(async () => {
      await liveSwitch.goLive().catch(() => undefined);
    });
    expect(result.current).toBe("cooldown");
  });

  it("never gates the raw programmatic sign-out call", async () => {
    const c = controller();
    registerArenaController(c);
    await act(async () => {
      await liveSwitch.goLive();
    });
    await act(async () => {
      await takeArenaOfflineBeforeSignOut();
    });
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(c.goOffline).toHaveBeenCalledTimes(1);
    // No unguarded MANUAL go-offline exists (it would drop a tucked
    // challenge, Q3, outside the athlete's own tap), and the verdict's
    // Rematch (the only unguarded go-live) is gone (jits-02vo.8).
    expect("goOfflineUnguarded" in arenaActions).toBe(false);
    expect("goLiveUnguarded" in arenaActions).toBe(false);
  });

  it("guards the tap-facing arenaActions.goLive/goOffline exactly like liveSwitch (AC-H2..H4)", async () => {
    let release!: (v: boolean) => void;
    const c = controller({
      goLive: jest.fn(() => new Promise<boolean>((r) => (release = r))),
    });
    registerArenaController(c);
    const { result } = renderHook(() => useLiveSwitchPhase());

    let first!: Promise<boolean | "ignored">;
    act(() => {
      first = arenaActions.goLive();
    });
    expect(result.current).toBe("saving");
    let second: boolean | "ignored" | undefined;
    let off: boolean | "ignored" | undefined;
    await act(async () => {
      second = await arenaActions.goLive();
      off = await arenaActions.goOffline();
    });
    expect(second).toBe("ignored");
    expect(off).toBe("ignored");
    expect(c.goLive).toHaveBeenCalledTimes(1);
    expect(c.goOffline).not.toHaveBeenCalled();

    await act(async () => {
      release(true);
      await first;
    });
    expect(result.current).toBe("cooldown");
    let during: boolean | "ignored" | undefined;
    await act(async () => {
      during = await arenaActions.goOffline();
    });
    expect(during).toBe("ignored");
    expect(c.goOffline).not.toHaveBeenCalled();
  });

  it("holds RETRY disabled for the cooldown after a failed go-live, then honours it", async () => {
    jest.useFakeTimers();
    const goLive = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    registerArenaController(controller({ goLive }));
    const { result } = renderHook(() => useLiveSwitchPhase());

    let failed: boolean | "ignored" | undefined;
    await act(async () => {
      failed = await liveSwitch.goLive();
    });
    expect(failed).toBe(false);
    // The chip reads the phase and renders OFFLINE · RETRY disabled here.
    expect(result.current).toBe("cooldown");
    let early: boolean | "ignored" | undefined;
    await act(async () => {
      early = await liveSwitch.goLive();
    });
    expect(early).toBe("ignored");
    expect(goLive).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(LIVE_SWITCH_COOLDOWN_MS);
    });
    expect(result.current).toBe("ready");
    let retried: boolean | "ignored" | undefined;
    await act(async () => {
      retried = await liveSwitch.goLive();
    });
    expect(retried).toBe(true);
    expect(goLive).toHaveBeenCalledTimes(2);
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
