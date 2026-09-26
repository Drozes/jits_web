import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  deferred,
  FakeClient,
  type CallResult,
} from "@/lib/realtime/fake-realtime-client";

const rt = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => rt.client }));

type Mod = typeof import("./use-online-presence");
let mod: Mod;
let client: FakeClient;

const ME = {
  athlete_id: "me",
  display_name: "Me",
  profile_photo_url: null,
};

const flush = () => act(async () => {});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  client = new FakeClient();
  rt.client = client;
  vi.resetModules();
  mod = await import("./use-online-presence");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mountOwner(name = "Me") {
  const owner = renderHook(
    ({ name }) => mod.useOnlinePresence("me", name, null),
    { initialProps: { name } },
  );
  await flush();
  return owner;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useOnlinePresence (jits-ifvw)", () => {
  it("tracks once per join and not again on visibility", async () => {
    await mountOwner();
    const ch = client.last;
    act(() => ch.join());
    await flush();
    expect(ch.track).toHaveBeenCalledTimes(1);
    expect(ch.track).toHaveBeenCalledWith(ME);
    setVisibility("visible");
    await flush();
    expect(ch.track).toHaveBeenCalledTimes(1);
  });

  it("rebuilds a channel the server closed and re-tracks", async () => {
    const ids = renderHook(() => mod.useOnlineStatus("a"));
    await mountOwner();
    const first = client.last;
    act(() => first.join());
    act(() => first.sync({ a: [{}] }));
    expect(ids.result.current).toBe(true);

    act(() => first.serverClose());
    expect(ids.result.current).toBe(false);
    expect(first.teardown).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(client.built).toHaveLength(2);
    act(() => client.last.join());
    await flush();
    expect(client.last.track).toHaveBeenCalledWith(ME);
  });

  it("leaves a still-registered errored channel to phoenix", async () => {
    await mountOwner();
    const ch = client.last;
    act(() => ch.join());
    act(() => ch.error());
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.built).toHaveLength(1);
  });

  it("gives up after the bounded backoff and resumes when the tab is visible", async () => {
    await mountOwner();
    for (const delay of [1_000, 5_000, 15_000, 30_000]) {
      act(() => client.last.serverClose());
      await act(() => vi.advanceTimersByTimeAsync(delay));
    }
    const built = client.built.length;
    act(() => client.last.serverClose());
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(client.built).toHaveLength(built);

    setVisibility("visible");
    await flush();
    expect(client.built).toHaveLength(built + 1);
  });

  it("bounds a track that never settles, then re-tracks on visibility", async () => {
    await mountOwner();
    const ch = client.last;
    ch.nextCall = () => new Promise<CallResult>(() => {});
    act(() => ch.join());
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    ch.nextCall = async () => "ok";
    setVisibility("visible");
    await flush();
    expect(ch.track).toHaveBeenCalledTimes(2);
  });

  it("a remount waits for the previous removal instead of adopting the leaving instance", async () => {
    const removal = deferred<CallResult>();
    client.removalResult = () => removal.promise;
    const owner = await mountOwner("Me");
    act(() => client.last.join());
    await flush();
    // A display-name change re-runs the effect.
    owner.rerender({ name: "New name" });
    await flush();
    expect(client.built).toHaveLength(1);

    removal.resolve("ok");
    await flush();
    expect(client.built).toHaveLength(2);
    act(() => client.last.join());
    await flush();
    expect(client.last.track).toHaveBeenCalledWith({
      ...ME,
      display_name: "New name",
    });
  });

  it("does not rebuild on the CLOSED its own removal fires", async () => {
    const owner = await mountOwner();
    act(() => client.last.join());
    act(() => owner.unmount());
    await flush();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.built).toHaveLength(1);
  });
});
