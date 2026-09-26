/**
 * Roster/lobby sync (jits-hlm1.4).
 *
 * "Online now" is roster intersected with presence, so an athlete who goes live
 * after the roster loaded is invisible until the roster is re-read. The re-read
 * must happen once per new face, never in a loop for someone the roster will
 * never list, and never as a storm.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  ROSTER_SYNC_DEBOUNCE_MS,
  ROSTER_SYNC_MAX_FAILED_RETRIES,
  ROSTER_SYNC_MIN_INTERVAL_MS,
  useRosterLobbySync,
  type RosterLobbySyncInput,
} from "@/lib/arena/use-roster-lobby-sync";

const refresh = jest.fn();

function props(over: Partial<RosterLobbySyncInput> = {}): RosterLobbySyncInput {
  return {
    rosterIds: ["a-1"],
    lobbyIds: new Set(["a-1"]),
    selfId: "me",
    isLive: false,
    isLoading: false,
    isFetching: false,
    lastReadOk: true,
    enabled: true,
    refresh,
    ...over,
  };
}

function mount(initial: RosterLobbySyncInput) {
  return renderHook((p: RosterLobbySyncInput) => useRosterLobbySync(p), {
    initialProps: initial,
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Plays a roster read: starts, then comes back with `rosterIds`. */
function read(
  rerender: (p: RosterLobbySyncInput) => void,
  current: RosterLobbySyncInput,
  rosterIds: string[],
  lastReadOk = true,
): RosterLobbySyncInput {
  rerender({ ...current, isFetching: true });
  const done = { ...current, rosterIds, isFetching: false, lastReadOk };
  rerender(done);
  return done;
}

beforeEach(() => {
  jest.useFakeTimers();
  refresh.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useRosterLobbySync", () => {
  it("does nothing while the lobby and the roster agree", () => {
    mount(props());
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-reads once, after the debounce, when a new lobby id appears", () => {
    let p = props();
    const { rerender } = mount(p);

    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    // The read lists them: settled, nothing more.
    read(rerender, p, ["a-1", "a-2"]);
    advance(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of joins into one read", () => {
    let p = props();
    const { rerender } = mount(p);
    for (const id of ["a-2", "a-3", "a-4"]) {
      p = { ...p, lobbyIds: new Set([...p.lobbyIds, id]) };
      rerender(p);
      advance(200);
    }
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not loop on an id the roster never lists", () => {
    let p = props();
    const { rerender } = mount(p);

    // Not looking for ranked, or past the roster limit.
    p = { ...p, lobbyIds: new Set(["a-1", "ghost"]) };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    p = read(rerender, p, ["a-1"]);
    // Presence keeps syncing; the roster keeps not listing them.
    for (let i = 0; i < 5; i++) {
      p = { ...p, lobbyIds: new Set(p.lobbyIds) };
      rerender(p);
      advance(ROSTER_SYNC_MIN_INTERVAL_MS * 2);
    }
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tries a persistently missing id again after they leave and come back", () => {
    let p = props({ lobbyIds: new Set(["a-1", "ghost"]) });
    const { rerender } = mount(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    p = read(rerender, p, ["a-1"]);

    p = { ...p, lobbyIds: new Set(["a-1"]) };
    rerender(p);
    p = { ...p, lobbyIds: new Set(["a-1", "ghost"]) };
    rerender(p);
    advance(ROSTER_SYNC_MIN_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never asks about the viewer's own lobby entry", () => {
    mount(props({ isLive: true, lobbyIds: new Set(["a-1", "me"]) }));
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("holds while a read is in flight and counts that read as the attempt", () => {
    // The rematch pin (or a pull) already started a read for this face.
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]), isFetching: true };
    rerender(p);
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();

    // It came back without them (same roster): no second read.
    p = { ...p, isFetching: false };
    rerender(p);
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks again about a face that joined DURING an in-flight read", () => {
    let p = props({ isFetching: true });
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    rerender(p);
    p = { ...p, isFetching: false };
    rerender(p);
    advance(ROSTER_SYNC_MIN_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps reads at least the minimum interval apart", () => {
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    p = read(rerender, p, ["a-1", "a-2"]);

    p = { ...p, lobbyIds: new Set(["a-1", "a-2", "a-3"]) };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(ROSTER_SYNC_MIN_INTERVAL_MS - ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not fire during the first load, which covers everyone", () => {
    let p = props({ isLoading: true, isFetching: true, rosterIds: [] });
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    rerender(p);
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-reads once when the viewer goes live", () => {
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, isLive: true };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    p = read(rerender, p, ["a-1"]);
    advance(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not re-read for being live already at mount", () => {
    mount(props({ isLive: true }));
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retries the ids a failed read of its own marked, after the minimum gap", () => {
    let p = props({ lobbyIds: new Set(["a-1", "a-2"]) });
    const { rerender } = mount(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    // The failed read started just now, so the retry waits the full gap.
    p = read(rerender, p, ["a-1"], false);
    advance(ROSTER_SYNC_MIN_INTERVAL_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(2);

    // This time it lists them: settled.
    read(rerender, p, ["a-1", "a-2"]);
    advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops retrying after repeated failures instead of polling a dead network", () => {
    let p = props({ lobbyIds: new Set(["a-1", "a-2"]) });
    const { rerender } = mount(p);
    for (let i = 0; i <= ROSTER_SYNC_MAX_FAILED_RETRIES; i++) {
      advance(ROSTER_SYNC_MIN_INTERVAL_MS);
      p = read(rerender, p, ["a-1"], false);
    }
    expect(refresh).toHaveBeenCalledTimes(ROSTER_SYNC_MAX_FAILED_RETRIES + 1);
    advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(ROSTER_SYNC_MAX_FAILED_RETRIES + 1);
  });

  it("retries the go-live read if it failed", () => {
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, isLive: true };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    p = read(rerender, p, ["a-1"], false);
    advance(ROSTER_SYNC_MIN_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not retry after a failed read it did not start", () => {
    // A pull or match-exit read failing is the error plate's business.
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    p = read(rerender, p, ["a-1"], false);
    advance(30_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads nothing while unfocused, then catches up on focus", () => {
    let p = props({ enabled: false });
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]), isLive: true };
    rerender(p);
    advance(30_000);
    expect(refresh).not.toHaveBeenCalled();

    p = { ...p, enabled: true };
    rerender(p);
    advance(ROSTER_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled read when focus is lost before it fires", () => {
    let p = props();
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    rerender(p);
    rerender({ ...p, enabled: false });
    advance(30_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the tried bookkeeping while unfocused", () => {
    // A match-exit read while unfocused already asked about a-2.
    let p = props({ enabled: false });
    const { rerender } = mount(p);
    p = { ...p, lobbyIds: new Set(["a-1", "a-2"]) };
    p = read(rerender, p, ["a-1"]);
    p = { ...p, enabled: true };
    rerender(p);
    advance(30_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancels a pending re-read on unmount", () => {
    const p = props();
    const { rerender, unmount } = mount(p);
    rerender({ ...p, lobbyIds: new Set(["a-1", "a-2"]) });
    unmount();
    advance(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
