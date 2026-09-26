import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  deferred,
  FakeClient,
  type CallResult,
} from "@/lib/realtime/fake-realtime-client";

const rt = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => rt.client }));

type Mod = typeof import("./use-lobby-presence");
let mod: Mod;
let client: FakeClient;

const LIVE = {
  athlete_id: "me",
  looking_for_casual: false,
  looking_for_ranked: true,
};

/** Let the async setup (awaits, no timers) run. */
const flush = () => act(async () => {});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  client = new FakeClient();
  rt.client = client;
  // Fresh module state (channel ref, desired payload) for every test.
  vi.resetModules();
  mod = await import("./use-lobby-presence");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mountOwner(live = false) {
  const owner = renderHook(
    ({ live }) => mod.useLobbyPresence("me", false, live),
    { initialProps: { live } },
  );
  await flush();
  return owner;
}

describe("useLobbyPresence", () => {
  it("clears the module-level lobby ids when the channel unmounts", async () => {
    const ids = renderHook(() => mod.useLobbyIds());
    const owner = await mountOwner();
    act(() => client.last.join());
    act(() => client.last.sync({ a: [{}], b: [{}] }));
    expect([...ids.result.current]).toEqual(["a", "b"]);
    act(() => owner.unmount());
    expect(ids.result.current.size).toBe(0);
  });

  it("tracks the live flags on SUBSCRIBED", async () => {
    await mountOwner(true);
    act(() => client.last.join());
    await flush();
    expect(client.last.track).toHaveBeenCalledTimes(1);
    expect(client.last.track).toHaveBeenCalledWith(LIVE);
  });

  describe("presence churn (the server closes a channel past 5 calls/30s)", () => {
    it("does not re-track an unchanged payload or untrack nothing", async () => {
      await mountOwner(true);
      const ch = client.last;
      act(() => ch.join());
      await flush();
      // use-arena-live's post-write joinLobby is the same payload.
      mod.joinLobby({ ...LIVE });
      await flush();
      expect(ch.track).toHaveBeenCalledTimes(1);

      mod.leaveLobby();
      await flush();
      mod.leaveLobby();
      await flush();
      expect(ch.untrack).toHaveBeenCalledTimes(1);
    });

    it("coalesces a burst of toggles behind the call in flight", async () => {
      await mountOwner(false);
      const ch = client.last;
      act(() => ch.join());
      await flush();
      const first = deferred<CallResult>();
      ch.nextCall = () => first.promise;
      mod.joinLobby(LIVE);
      mod.leaveLobby();
      mod.joinLobby(LIVE);
      mod.leaveLobby();
      mod.joinLobby(LIVE);
      await flush();
      expect(ch.track).toHaveBeenCalledTimes(1);
      ch.nextCall = async () => "ok";
      first.resolve("ok");
      await flush();
      // The final state equals what is held: no second call.
      expect(ch.track).toHaveBeenCalledTimes(1);
      expect(ch.untrack).not.toHaveBeenCalled();
    });
  });

  describe("server close (jits-ifvw)", () => {
    it("rebuilds a closed channel on the backoff and re-tracks", async () => {
      const ids = renderHook(() => mod.useLobbyIds());
      await mountOwner(true);
      const first = client.last;
      act(() => first.join());
      act(() => first.sync({ a: [{}] }));
      await flush();

      act(() => first.serverClose());
      expect(ids.result.current.size).toBe(0);
      // A closed channel is not torn down again.
      expect(first.teardown).not.toHaveBeenCalled();
      expect(client.built).toHaveLength(1);

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(client.built).toHaveLength(2);
      const second = client.last;
      expect(second).not.toBe(first);
      act(() => second.join());
      await flush();
      expect(second.track).toHaveBeenCalledWith(LIVE);
      // A late sync from the dead instance cannot touch the store.
      act(() => first.sync({ ghost: [{}] }));
      expect(ids.result.current.has("ghost")).toBe(false);
    });

    it("leaves a still-registered errored channel to phoenix", async () => {
      await mountOwner(true);
      const ch = client.last;
      act(() => ch.join());
      act(() => ch.error());
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(client.built).toHaveLength(1);
      expect(ch.teardown).not.toHaveBeenCalled();
    });

    it("gives up after the bounded backoff and resumes on going live", async () => {
      await mountOwner(true);
      for (const delay of [1_000, 5_000, 15_000, 30_000]) {
        act(() => client.last.serverClose());
        await act(() => vi.advanceTimersByTimeAsync(delay));
      }
      const built = client.built.length;
      act(() => client.last.serverClose());
      await act(() => vi.advanceTimersByTimeAsync(120_000));
      expect(client.built).toHaveLength(built);

      mod.joinLobby(LIVE);
      await flush();
      expect(client.built).toHaveLength(built + 1);
    });

    it("lets go of a hung call once its channel is lost", async () => {
      const owner = await mountOwner(false);
      const first = client.last;
      act(() => first.join());
      await flush();
      first.nextCall = () => new Promise<CallResult>(() => {});
      owner.rerender({ live: true });
      mod.joinLobby(LIVE);
      await flush();
      act(() => first.serverClose());
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      act(() => client.last.join());
      await flush();
      expect(client.last.track).toHaveBeenCalledWith(LIVE);
    });
  });

  it("bounds a presence call that never settles", async () => {
    await mountOwner(false);
    const ch = client.last;
    act(() => ch.join());
    await flush();
    ch.nextCall = () => new Promise<CallResult>(() => {});
    mod.joinLobby(LIVE);
    await flush();
    ch.nextCall = async () => "ok";
    mod.leaveLobby();
    await flush();
    expect(ch.untrack).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(ch.untrack).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild on the CLOSED its own removal fires", async () => {
    const owner = await mountOwner(true);
    act(() => client.last.join());
    await flush();
    act(() => owner.unmount());
    await flush();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.built).toHaveLength(1);
  });

  it("a new owner waits for the previous removal before building", async () => {
    const removal = deferred<CallResult>();
    client.removalResult = () => removal.promise;
    const a = await mountOwner(true);
    act(() => a.unmount());
    await mountOwner(true);
    expect(client.built).toHaveLength(1);
    removal.resolve("ok");
    await flush();
    expect(client.built).toHaveLength(2);
    expect(client.last.state).toBe("joining");
  });
});
