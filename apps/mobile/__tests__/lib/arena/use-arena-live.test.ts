/**
 * Going live, and the thing web gets wrong: coming back off.
 *
 * "Online now" is Presence and "Open to challenges" is the `looking_for_ranked`
 * column. Presence lapses on its own when the socket dies; the column does
 * not. Anything that drops one without the other leaves an athlete advertised
 * as available and unreachable, so every assertion here is about the two
 * moving together, including when the two requests overlap.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

// ---- mocks ----

const mockCalls: string[] = [];

const mockToggleMatchPreferences = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  toggleMatchPreferences: (...args: unknown[]) => {
    const prefs = args[2] as { lookingForRanked: boolean };
    mockCalls.push(`flag:${prefs.lookingForRanked}`);
    return mockToggleMatchPreferences(...args);
  },
}));

const mockJoinLobby = jest.fn();
const mockLeaveLobby = jest.fn();
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  joinLobby: (...args: unknown[]) => {
    mockCalls.push("joinLobby");
    return mockJoinLobby(...args);
  },
  leaveLobby: (...args: unknown[]) => {
    mockCalls.push("leaveLobby");
    return mockLeaveLobby(...args);
  },
}));

const mockToastError = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a), info: jest.fn() },
}));

// The client is an opaque handle here: the hook only ever passes it through
// to `toggleMatchPreferences`. What matters for timing is the `leaveLobby`
// mock above, because that is the call that wraps `channel.untrack()`.
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { useArenaLive, type UseArenaLiveArgs } from "@/lib/arena/use-arena-live";

// ---- fixtures ----

/**
 * A promise the test releases by hand.
 *
 * `leaveLobby()` awaits `channel.untrack()`, which is a presence SEND, so it
 * takes the websocket push branch: when the socket is not connected the push
 * is buffered with its timeout already running and resolves 'timed out' only
 * after ten seconds. A mock that resolves immediately cannot represent that,
 * which is how a flag write sequenced behind it looked fine in tests while
 * never leaving a suspended device.
 */
/**
 * Drain the microtask queue. Enough passes for a settled transition to walk
 * its promise chain, and no passes at all for one that is genuinely blocked.
 */
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing in these tests consumes the rejection directly; the hook is the
  // only consumer and the point is that it handles it.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

const ARGS: UseArenaLiveArgs = {
  athleteId: "me-1",
  displayName: "Me",
  currentElo: 1200,
  initialRanked: false,
};

let appStateHandler: ((s: AppStateStatus) => void) | null = null;

function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, "currentState", {
    value: state,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setAppState("active");
  mockCalls.length = 0;
  jest.clearAllMocks();
  appStateHandler = null;
  mockToggleMatchPreferences.mockResolvedValue({ ok: true, data: undefined });
  mockJoinLobby.mockResolvedValue(undefined);
  mockLeaveLobby.mockResolvedValue(undefined);
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event: string, handler: unknown) => {
      appStateHandler = handler as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mount(overrides: Partial<UseArenaLiveArgs> = {}) {
  return renderHook((props: UseArenaLiveArgs) => useArenaLive(props), {
    initialProps: { ...ARGS, ...overrides },
  });
}

/** The prefs object handed to the Nth flag write. */
function flagWrite(n: number) {
  return mockToggleMatchPreferences.mock.calls[n]?.[2];
}

function lastFlagWrite() {
  const calls = mockToggleMatchPreferences.mock.calls;
  return calls[calls.length - 1]?.[2];
}

describe("going live", () => {
  it("writes the ranked flag and only then joins the lobby", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockToggleMatchPreferences).toHaveBeenCalledWith({}, "me-1", {
      lookingForCasual: false,
      lookingForRanked: true,
    });
    expect(mockJoinLobby).toHaveBeenCalledWith({
      athlete_id: "me-1",
      display_name: "Me",
      current_elo: 1200,
      looking_for_casual: false,
      looking_for_ranked: true,
    });
    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });

  it("never joins the lobby when the flag write failed", async () => {
    // Presence without the flag is the worse half of the inconsistency: the
    // athlete shows as online to anyone already holding the roster, while
    // get_arena_data omits them for everyone loading it fresh.
    mockToggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "nope" },
    });
    const { result } = mount();

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockJoinLobby).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });

  it("retries the flag write once before giving up", async () => {
    mockToggleMatchPreferences
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "UNKNOWN", message: "transient" },
      })
      .mockResolvedValueOnce({ ok: true, data: undefined });
    const { result } = mount();

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(2);
    expect(result.current.isLive).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("produces exactly one write for a double tap", async () => {
    const { result } = mount();

    // Both taps inside one act, with no await between them: this is the
    // window where React state has not settled and only a synchronous ref
    // closes it.
    await act(async () => {
      const a = result.current.toggle();
      const b = result.current.toggle();
      await Promise.all([a, b]);
    });

    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(1);
    expect(mockJoinLobby).toHaveBeenCalledTimes(1);
  });

  it("re-asserts a flag the athlete arrived with, instead of trusting it", async () => {
    // The auth context caches the athlete row, so a second visit in the same
    // session can hand us a `true` we ourselves cleared on the way out.
    // Writing it again is what makes "flagged" and "present" true together.
    const { result } = mount({ initialRanked: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(flagWrite(0)).toEqual({
      lookingForCasual: false,
      lookingForRanked: true,
    });
    expect(mockJoinLobby).toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });
});

describe("going offline", () => {
  it("issues the untrack first but does not sequence the flag write behind it", async () => {
    // Order of ISSUE, not of completion: both go out in the same tick. The
    // untrack goes first because it shortens the window where the athlete is
    // still challengeable, and the flag write does not wait for it because
    // the flag is the half that never heals itself.
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockCalls.length = 0;

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockCalls).toEqual(["leaveLobby", "flag:false"]);
    expect(result.current.isLive).toBe(false);
  });

  it("writes the clearing flag without waiting for a slow untrack", async () => {
    // The whole reason this hook exists. `leaveLobby()` can hang for ten
    // seconds on a socket that is already gone, and iOS suspends a
    // backgrounded process long before that, so a flag write queued behind
    // the untrack is a write that never leaves the device: the athlete sits
    // in "Open to challenges" with the app closed, and the next visit
    // re-asserts the flag rather than correcting it.
    const untrack = deferred();
    mockLeaveLobby.mockReturnValue(untrack.promise);
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();

    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });

    // Still in flight, exactly as it would be for the whole ten seconds.
    expect(mockLeaveLobby).toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });

    await act(async () => {
      untrack.resolve();
      await Promise.resolve();
    });
  });

  it("settles the toggle without waiting for a slow untrack", async () => {
    // Same reasoning one layer up: awaiting the untrack would leave the
    // switch spinning for ten seconds on a bad connection. Asserted on a
    // flushed microtask queue rather than by awaiting the toggle, so a
    // regression fails this test instead of hanging the suite.
    const untrack = deferred();
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockLeaveLobby.mockReturnValue(untrack.promise);

    let settled = false;
    await act(async () => {
      void result.current.toggle().then(() => {
        settled = true;
      });
      await flush();
    });

    expect(settled).toBe(true);
    expect(result.current.isLive).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(mockToastError).not.toHaveBeenCalled();

    await act(async () => {
      untrack.resolve();
      await flush();
    });
  });

  it("clears the flag even when the untrack rejects", async () => {
    // An untrack that throws must not take the flag write down with it.
    // Presence lapses when the socket dies; the column does not.
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockLeaveLobby.mockRejectedValue(new Error("untrack failed"));
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();

    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });

    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
  });

  it("clears BOTH signals when the app goes to the background", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();

    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });

    expect(mockLeaveLobby).toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
  });

  it("does NOT drop you for an 'inactive' transition", async () => {
    // iOS reports "inactive" for the notification shade, Control Center, an
    // incoming-call banner, a system alert and a half-swiped app switcher.
    // None of those mean the athlete left, and there is no way back: the
    // reconcile-on-arrival effect is one-shot.
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();
    mockLeaveLobby.mockClear();

    await act(async () => {
      appStateHandler?.("inactive");
      await Promise.resolve();
    });

    expect(mockLeaveLobby).not.toHaveBeenCalled();
    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });

  it("does not write anything on background when not live", async () => {
    mount();

    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(mockLeaveLobby).not.toHaveBeenCalled();
  });

  it("does not take a live athlete offline on foreground", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();
    mockLeaveLobby.mockClear();

    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(mockLeaveLobby).not.toHaveBeenCalled();
  });

  it("clears BOTH signals on a real teardown", async () => {
    const { result, unmount } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(mockLeaveLobby).toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
  });
});

describe("coming back from the background", () => {
  it("puts a backgrounded athlete back in the lobby on return", async () => {
    // Backgrounding clears both signals defensively, not because the athlete
    // asked to stop. Without a re-assert on the way back they are silently
    // offline, with a toggle that still reads live-capable, until they think
    // to tap it twice.
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });
    expect(result.current.isLive).toBe(false);
    mockCalls.length = 0;
    mockJoinLobby.mockClear();

    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });

    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });

  it("does NOT resurrect a state the athlete themselves turned off", async () => {
    // The intent read at background time is the whole guard: an athlete who
    // toggled off and then closed the app must not come back advertised.
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });
    mockCalls.length = 0;

    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });

    expect(mockCalls).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });

  it("resumes wherever the athlete lands, not only on the Arena", async () => {
    // Live belongs to the athlete, not to a screen: there is no tab input any
    // more, so a re-render between background and foreground (the athlete
    // came back on Home, or Rankings) must not stop the resume.
    const { result, rerender } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });
    await act(async () => {
      rerender({ ...ARGS });
      await Promise.resolve();
    });
    mockCalls.length = 0;

    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });

    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });

  it("resumes only once per background, not on every later 'active'", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });
    await act(async () => {
      appStateHandler?.("active");
      await Promise.resolve();
    });
    // An athlete who toggles off after returning stays off, even though the
    // OS keeps reporting "active" through every Control Center swipe.
    await act(async () => {
      await result.current.toggle();
    });
    mockCalls.length = 0;

    await act(async () => {
      appStateHandler?.("inactive");
      appStateHandler?.("active");
      await Promise.resolve();
    });

    expect(mockCalls).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });
});

describe("staying live across the app", () => {
  it("keeps you live across re-renders: switching tabs does not end live", async () => {
    // The owner is mounted once for the signed-in app, so moving between
    // Home, Arena, Rankings and Profile only ever re-renders it. Nothing in a
    // re-render may clear either signal.
    const { result, rerender } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();
    mockLeaveLobby.mockClear();

    await act(async () => {
      rerender({ ...ARGS });
      rerender({ ...ARGS, currentElo: 1210 });
      await Promise.resolve();
    });

    expect(mockLeaveLobby).not.toHaveBeenCalled();
    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });

  it("goOffline clears BOTH signals, silently, and resolves true once landed", async () => {
    // The sign-out path: no toast (there is no screen left to show it on),
    // and the caller awaits the flag clear before dropping the session.
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.goOffline();
    });

    expect(ok).toBe(true);
    expect(mockLeaveLobby).toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("goOffline when already offline writes nothing", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.goOffline();
    });

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(mockLeaveLobby).not.toHaveBeenCalled();
  });
});

describe("overlapping transitions", () => {
  it("still goes offline when the app backgrounds DURING the go-live write", async () => {
    // The flag write is a round trip and can be two. If "am I live?" only
    // became true after it, this background would find nothing to clear and
    // return happy, leaving the athlete live and unreachable with no path
    // that ever clears them: the AppState handler only resumes on "active",
    // it never clears there.
    let releaseWrite: (() => void) | null = null;
    mockToggleMatchPreferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseWrite = () => resolve({ ok: true, data: undefined });
        }),
    );

    const { result } = mount();

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.toggle();
      await Promise.resolve();
    });

    // Mid-write.
    expect(mockJoinLobby).not.toHaveBeenCalled();

    await act(async () => {
      appStateHandler?.("background");
      releaseWrite?.();
      await pending;
      await Promise.resolve();
    });

    // Never advertised: the join is skipped entirely once the intent flips.
    expect(mockJoinLobby).not.toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
  });

  it("issues the clearing write only after the setting write has landed", async () => {
    // Two unordered writes can reach the database in either order, and a
    // clear that loses that race leaves the flag true forever.
    let releaseWrite: (() => void) | null = null;
    mockToggleMatchPreferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseWrite = () => resolve({ ok: true, data: undefined });
        }),
    );

    const { result } = mount();

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.toggle();
      await Promise.resolve();
    });

    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });

    // The set has not resolved, so the clear must not have been sent yet.
    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseWrite?.();
      await pending;
      await Promise.resolve();
    });

    expect(mockCalls.filter((c) => c.startsWith("flag:"))).toEqual([
      "flag:true",
      "flag:false",
    ]);
  });
});

describe("launch resume", () => {
  it("does NOT go live when the JS cold-launched in the background (silent push)", async () => {
    setAppState("background");
    const { result } = mount({ initialRanked: true });
    await act(flush);

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(mockJoinLobby).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(false);

    // The first time the athlete actually opens the app, they are live.
    await act(async () => {
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });

  it("does not go live at launch straight into a match, and goes live after it", async () => {
    const { result, rerender } = mount({ initialRanked: true, inMatch: true });
    await act(flush);
    expect(mockJoinLobby).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...ARGS, initialRanked: true, inMatch: false });
      await flush();
    });
    expect(result.current.isLive).toBe(true);
  });

  it("tells the athlete when coming back live failed", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    mockToggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "down" },
    });

    await act(async () => {
      appStateHandler?.("active");
      await flush();
    });

    expect(result.current.isLive).toBe(false);
    expect(mockToastError).toHaveBeenCalledWith(
      "You're offline. Go live again in the Arena.",
    );
  });
});

describe("offline during a match", () => {
  async function liveThenMatch() {
    const hook = mount();
    await act(async () => {
      await hook.result.current.toggle();
    });
    mockCalls.length = 0;
    await act(async () => {
      hook.rerender({ ...ARGS, inMatch: true });
      await flush();
    });
    return hook;
  }

  it("clears BOTH signals when a match starts", async () => {
    const { result } = await liveThenMatch();

    expect(mockCalls).toEqual(["leaveLobby", "flag:false"]);
    expect(result.current.isLive).toBe(false);
  });

  it("goes live again when the match screen is left", async () => {
    const { result, rerender } = await liveThenMatch();
    mockCalls.length = 0;

    await act(async () => {
      rerender({ ...ARGS, inMatch: false });
      await flush();
    });

    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });

  it("does not go live after a match the athlete entered while offline", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      rerender({ ...ARGS, inMatch: true });
      await flush();
    });
    await act(async () => {
      rerender({ ...ARGS, inMatch: false });
      await flush();
    });

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(false);
  });

  it("does NOT restore live on foreground while still in the match", async () => {
    const { result, rerender } = await liveThenMatch();
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    mockCalls.length = 0;

    await act(async () => {
      appStateHandler?.("active");
      await flush();
    });
    expect(mockCalls).toEqual([]);
    expect(result.current.isLive).toBe(false);

    // ...but the intent survives to the end of the match.
    await act(async () => {
      rerender({ ...ARGS, inMatch: false });
      await flush();
    });
    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
    expect(result.current.isLive).toBe(true);
  });
});
