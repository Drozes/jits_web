import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  arenaActions,
  countActiveOthers,
  publishArenaState,
  registerArenaController,
  useArenaOnlineCount,
  useArenaState,
  useIsArenaLive,
  useInlineChallengeSurfaceMounted,
  useRegisterInlineChallengeSurface,
  type ArenaController,
} from "./arena-store";

const live = { ...IDLE_ARENA_STATE, ready: true, isLive: true };

function fakeController(): ArenaController {
  return {
    toggle: vi.fn(async () => {}),
    goLive: vi.fn(async () => {}),
    goOffline: vi.fn(async () => {}),
    sendChallenge: vi.fn(async () => {}),
    accept: vi.fn(async () => {}),
    decline: vi.fn(async () => {}),
    cancelOutgoing: vi.fn(async () => {}),
  };
}

beforeEach(() => __resetArenaStoreForTests());

describe("arena-store", () => {
  it("starts idle: not ready, not live, zero online", () => {
    const { result } = renderHook(() => useArenaState());
    expect(result.current).toEqual(IDLE_ARENA_STATE);
  });

  it("notifies subscribers when the athlete goes live and offline", () => {
    const { result } = renderHook(() => useIsArenaLive());
    expect(result.current).toBe(false);
    act(() => publishArenaState(live));
    expect(result.current).toBe(true);
    act(() => publishArenaState({ ...live, isLive: false }));
    expect(result.current).toBe(false);
  });

  it("drops a shallow-equal publish without re-rendering readers", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useArenaState();
    });
    act(() => publishArenaState(live));
    const after = renders;
    act(() => publishArenaState({ ...live }));
    expect(renders).toBe(after);
  });

  it("exposes the online count as a primitive", () => {
    const { result } = renderHook(() => useArenaOnlineCount());
    expect(result.current).toBe(0);
    act(() => publishArenaState({ ...live, onlineCount: 4 }));
    expect(result.current).toBe(4);
  });

  it("counts only other presence ids that resolved to active athletes", () => {
    const active = new Set(["me", "a", "b"]);
    expect(countActiveOthers(new Set(["me", "a", "b"]), "me", active)).toBe(2);
    // "ghost" is in presence but is not an athlete: never counted.
    expect(countActiveOthers(new Set(["a", "ghost"]), "me", active)).toBe(1);
    // "b" resolved active but has left presence: not counted.
    expect(countActiveOthers(new Set(["me"]), "me", active)).toBe(0);
    expect(countActiveOthers(new Set(), "me", active)).toBe(0);
  });

  it("tracks whether an inline challenge surface is mounted", () => {
    const flag = renderHook(() => useInlineChallengeSurfaceMounted());
    expect(flag.result.current).toBe(false);
    const a = renderHook(() => useRegisterInlineChallengeSurface());
    const b = renderHook(() => useRegisterInlineChallengeSurface());
    expect(flag.result.current).toBe(true);
    a.unmount();
    expect(flag.result.current).toBe(true);
    b.unmount();
    expect(flag.result.current).toBe(false);
  });

  it("actions are harmless no-ops with no owner registered", async () => {
    await expect(arenaActions.toggle()).resolves.toBeUndefined();
    await expect(arenaActions.accept()).resolves.toBeUndefined();
  });

  it("delegates actions to the registered owner until it unregisters", async () => {
    const ctrl = fakeController();
    const unregister = registerArenaController(ctrl);
    await arenaActions.toggle();
    await arenaActions.sendChallenge("opp", "Opp");
    await arenaActions.cancelOutgoing();
    expect(ctrl.toggle).toHaveBeenCalledOnce();
    expect(ctrl.sendChallenge).toHaveBeenCalledWith("opp", "Opp");
    expect(ctrl.cancelOutgoing).toHaveBeenCalledOnce();

    unregister();
    await arenaActions.toggle();
    expect(ctrl.toggle).toHaveBeenCalledOnce();
  });

  it("a stale unregister does not evict a newer owner", async () => {
    const first = fakeController();
    const second = fakeController();
    const unregisterFirst = registerArenaController(first);
    registerArenaController(second);
    unregisterFirst();
    await arenaActions.goLive();
    expect(second.goLive).toHaveBeenCalledOnce();
    expect(first.goLive).not.toHaveBeenCalled();
  });
});
