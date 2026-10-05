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
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
  },
}));

// The client is an opaque handle here: the hook only ever passes it through
// to `toggleMatchPreferences`. What matters for timing is the `leaveLobby`
// mock above, because that is the call that wraps `channel.untrack()`.
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { CLEAR_RETRY_MAX_MS, CLEAR_RETRY_MS, useArenaLive, type UseArenaLiveArgs } from "@/lib/arena/use-arena-live";
import { GO_OFFLINE_FAILED_MESSAGE } from "@/lib/arena/constants";
import {
  __resetArenaStoreForTests,
  getLiveIntent,
  liveSwitch,
  registerArenaController,
  setAppLiveIntent,
  takeArenaOfflineBeforeSignOut,
} from "@/lib/arena/arena-store";

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
  __resetArenaStoreForTests();
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

  it("tracks a missing rating as null, not 0", async () => {
    const { result } = mount({ currentElo: null });
    await act(async () => {
      await result.current.goLive();
    });
    expect(mockJoinLobby).toHaveBeenCalledWith(
      expect.objectContaining({ current_elo: null }),
    );
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
    // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
    expect(mockToastInfo).toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
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
    expect(mockToastInfo).not.toHaveBeenCalled();
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
    expect(mockToastInfo).not.toHaveBeenCalled();

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
    expect(mockToastInfo).not.toHaveBeenCalled();
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

    expect(mockJoinLobby).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(false);
    // The stale `true` it arrived with is cleared rather than left
    // advertising an athlete whose app is closed (jits-yiwx).
    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(1);
    expect(flagWrite(0)).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });

    // The first time the athlete actually opens the app, they are live.
    mockCalls.length = 0;
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

  it("clears a stale flag for the whole match when launched straight into one (jits-yiwx)", async () => {
    // Seeded as uncommitted, the match's clear looked like a no-op and the
    // flag stayed true all match, so web could still challenge the athlete.
    mount({ initialRanked: true, inMatch: true });
    await act(flush);

    expect(mockCalls).toEqual(["leaveLobby", "flag:false"]);
  });

  it("writes nothing at launch when the athlete arrived offline", async () => {
    mount({ initialRanked: false, inMatch: true });
    await act(flush);
    setAppState("background");
    mount({ initialRanked: false });
    await act(flush);

    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
  });

  it("does not re-run the arrival resume when the athlete prop later flips to true", async () => {
    // The post-match `refreshAthleteSoft` hands a fresh `looking_for_ranked`
    // down as a new prop. Arrival already happened: re-running on it would be
    // an extra flag write and lobby track against the presence rate limit.
    const { result, rerender } = mount({ initialRanked: false });
    await act(flush);
    expect(mockCalls).toEqual([]);

    await act(async () => {
      rerender({ ...ARGS, initialRanked: true });
      await flush();
    });

    expect(mockCalls).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });

  it("does not force back live an athlete who tapped offline when the prop re-reads true", async () => {
    const { result, rerender } = mount({ initialRanked: true });
    await act(flush);
    expect(result.current.isLive).toBe(true);

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isLive).toBe(false);

    // A soft athlete re-read races the clear and still says `true`.
    mockCalls.length = 0;
    await act(async () => {
      rerender({ ...ARGS, initialRanked: false });
      await flush();
    });
    await act(async () => {
      rerender({ ...ARGS, initialRanked: true });
      await flush();
    });

    expect(mockCalls).toEqual([]);
    expect(result.current.isLive).toBe(false);
  });

  it("still runs a full go-live (flag AND lobby) for a flag it arrived with", async () => {
    // The seed marks the flag committed; the foreground path must not let
    // that skip the lobby join.
    const { result } = mount({ initialRanked: true });
    await act(flush);

    expect(mockCalls).toEqual(["flag:true", "joinLobby"]);
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
    expect(mockToastInfo).toHaveBeenCalledWith(
      "You're offline. Go live again in the Arena.",
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("last write failed (AC-H11, `OFFLINE · RETRY`)", () => {
  const DOWN = { ok: false, error: { code: "UNKNOWN", message: "down" } };

  it("is set by a failed go-live from the toggle and cleared by the next one that lands", async () => {
    const { result } = mount();
    expect(result.current.lastWriteFailed).toBe(false);
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(true);

    mockToggleMatchPreferences.mockResolvedValue({ ok: true, data: undefined });
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isLive).toBe(true);
    expect(result.current.lastWriteFailed).toBe(false);
  });

  it("is set by a failed foreground restore the athlete never tapped", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    expect(result.current.lastWriteFailed).toBe(false);
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      appStateHandler?.("active");
      await flush();
    });
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(true);

    // The chip's RETRY is a go-live; once it lands the flag clears.
    mockToggleMatchPreferences.mockResolvedValue({ ok: true, data: undefined });
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.lastWriteFailed).toBe(false);
  });

  it("is set by a failed arrival re-assert", async () => {
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    const { result } = mount({ initialRanked: true });
    await act(flush);
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(true);
  });

  it("is cleared by a match the athlete entered after a failed go-live", async () => {
    const { result, rerender } = mount();
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.lastWriteFailed).toBe(true);

    mockToggleMatchPreferences.mockResolvedValue({ ok: true, data: undefined });
    await act(async () => {
      rerender({ ...ARGS, inMatch: true });
      await flush();
    });
    await act(async () => {
      rerender({ ...ARGS, inMatch: false });
      await flush();
    });
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(false);
  });

  it("is cleared by backgrounding after a failed go-live", async () => {
    const { result } = mount();
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.lastWriteFailed).toBe(true);
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    expect(result.current.lastWriteFailed).toBe(false);
  });

  it("survives a go-live queued behind a failing go-live (intent read at enqueue)", async () => {
    const { result } = mount();
    const first = deferred<typeof DOWN>();
    // Both attempts of the one flag write fail (the first held open so the
    // second go-live queues behind it).
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    mockToggleMatchPreferences.mockReturnValueOnce(first.promise);
    let a: Promise<boolean> = Promise.resolve(true);
    let b: Promise<boolean> = Promise.resolve(true);
    act(() => {
      a = result.current.goLive();
      b = result.current.goLive();
    });
    let outA: boolean | undefined;
    let outB: boolean | undefined;
    await act(async () => {
      first.resolve(DOWN);
      outA = await a;
      outB = await b;
    });
    // Only the one write (two attempts) was made; the second pass found the intent the
    // failure dropped and must neither clear the flag nor claim success.
    expect(mockCalls.filter((c) => c.startsWith("flag:"))).toEqual([
      "flag:true",
      "flag:true",
    ]);
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(true);
    expect(outA).toBe(false);
    expect(outB).toBe(false);
  });

  it("does not report an earlier failure for a go-live cancelled by backgrounding", async () => {
    const { result } = mount();
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.lastWriteFailed).toBe(true);

    // Tapped RETRY, then the app went to the background before the pass ran:
    // the go-live was cancelled, not failed.
    mockToggleMatchPreferences.mockClear();
    let retry: Promise<boolean> = Promise.resolve(false);
    act(() => {
      retry = result.current.goLive();
      appStateHandler?.("background");
    });
    let out: boolean | undefined;
    await act(async () => {
      out = await retry;
      await flush();
    });
    // No live write. Round 4 (R1): the failed go-live may have committed
    // (its answer was lost), so the background's offline pass writes false.
    expect(
      mockToggleMatchPreferences.mock.calls.every((c) => !(c[2] as { lookingForRanked: boolean }).lookingForRanked),
    ).toBe(true);
    expect(result.current.isLive).toBe(false);
    expect(out).toBe(true);
  });

  it("is not set by a failed go-offline", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.goOffline();
    });
    expect(result.current.lastWriteFailed).toBe(false);
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

describe("a lobby join that never settles (jits-fa9x)", () => {
  // A rate-limited presence call can go unanswered, and the transition queue
  // is serialized. Unbounded, one hung join froze the toggle on "saving" and
  // queued every later transition behind it, including the go-offline on
  // match entry, so `looking_for_ranked` was never cleared.
  afterEach(() => {
    jest.useRealTimers();
  });

  it("settles the go-live within the bound and still lets the athlete go offline", async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockJoinLobby.mockReturnValue(new Promise(() => {}));
    const { result } = mount();

    let toggled = false;
    await act(async () => {
      void result.current.toggle().then(() => {
        toggled = true;
      });
      await flush();
    });
    expect(result.current.isLive).toBe(true);
    expect(toggled).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(12_000);
      await flush();
    });
    expect(toggled).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.goOffline();
    });
    expect(ok).toBe(true);
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
    warn.mockRestore();
  });

  it("does not fail the go-live when the lobby join rejects", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockJoinLobby.mockRejectedValue(new Error("socket gone"));
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isLive).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("manual go-offline vs being taken offline (decision Q3)", () => {
  it("calls onManualOffline when the toggle turns live off, before the flag write", async () => {
    const onManualOffline = jest.fn(() => {
      mockCalls.push("manual");
    });
    const { result } = mount({ onManualOffline });
    await act(async () => {
      await result.current.toggle();
    });
    expect(onManualOffline).not.toHaveBeenCalled();

    mockCalls.length = 0;
    await act(async () => {
      await result.current.toggle();
    });
    expect(onManualOffline).toHaveBeenCalledTimes(1);
    expect(mockCalls[0]).toBe("manual");
  });

  it("settles the manual go-offline with whether the athlete is now offline", async () => {
    const settled: boolean[] = [];
    const onManualOffline = jest.fn(() => (wentOffline: boolean) => {
      mockCalls.push(`settled:${wentOffline}`);
      settled.push(wentOffline);
    });
    const { result } = mount({ onManualOffline });
    await act(async () => {
      await result.current.goLive();
    });
    mockCalls.length = 0;
    await act(async () => {
      await result.current.toggle();
    });
    // Told after the write, never before it.
    expect(settled).toEqual([true]);
    expect(mockCalls.indexOf("flag:false")).toBeLessThan(
      mockCalls.indexOf("settled:true"),
    );

    // A clear that fails twice: presence was already untracked and the
    // committed state is offline (grey chip, gone from the lobby), so the
    // athlete IS offline as far as they can tell and the settle says so
    // (decision Q3 drops the tucked challenge), even though the call itself
    // reports the failed write.
    await act(async () => {
      await result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "down" },
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.goOffline();
    });
    expect(ok).toBe(false);
    expect(result.current.isLive).toBe(false);
    expect(settled).toEqual([true, true]);
  });

  it("settles false when the go-offline never committed (the intent flipped back to live)", async () => {
    const settled: boolean[] = [];
    const onManualOffline = jest.fn(() => (wentOffline: boolean) => {
      settled.push(wentOffline);
    });
    const { result } = mount({ onManualOffline });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      const off = result.current.goOffline();
      // Asked for live again before the queued go-offline ran.
      const on = result.current.goLive();
      await Promise.all([off, on]);
      await flush();
    });
    expect(result.current.isLive).toBe(true);
    expect(settled).toEqual([false]);
  });

  it("calls onManualOffline for goOffline (the popover, sign-out)", async () => {
    const onManualOffline = jest.fn();
    const { result } = mount({ onManualOffline });
    await act(async () => {
      await result.current.goOffline();
    });
    expect(onManualOffline).toHaveBeenCalledTimes(1);
  });

  it("does NOT call it when backgrounding takes the athlete offline", async () => {
    const onManualOffline = jest.fn();
    const { result } = mount({ onManualOffline });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    expect(result.current.isLive).toBe(false);
    expect(onManualOffline).not.toHaveBeenCalled();
  });

  it("does NOT call it when entering a match takes the athlete offline", async () => {
    const onManualOffline = jest.fn();
    const { result, rerender } = mount({ onManualOffline });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      rerender({ ...ARGS, onManualOffline, inMatch: true });
      await flush();
    });
    expect(result.current.isLive).toBe(false);
    expect(onManualOffline).not.toHaveBeenCalled();
  });
});

describe("transition: a restore the athlete did not start (review: toggle during restore)", () => {
  it("reads going-live while the foreground restore is in flight, and null once it landed", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.transition).toBeNull();
    await act(async () => {
      appStateHandler?.("background");
      await flush();
    });
    expect(result.current.transition).toBeNull();

    const write = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(write.promise);
    await act(async () => {
      appStateHandler?.("active");
      await flush();
    });
    // Intent live, nothing committed yet, and `isSaving` never set for it.
    expect(result.current.isLive).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.transition).toBe("going-live");

    await act(async () => {
      write.resolve({ ok: true, data: undefined });
      await flush();
    });
    expect(result.current.isLive).toBe(true);
    expect(result.current.transition).toBeNull();
  });

  it("reads going-offline while a background clear is in flight", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    const write = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(write.promise);
    await act(async () => {
      appStateHandler?.("background");
      await Promise.resolve();
    });
    expect(result.current.transition).toBe("going-offline");
    await act(async () => {
      write.resolve({ ok: true, data: undefined });
      await flush();
    });
    expect(result.current.transition).toBeNull();
  });

  it("stays null for a call that has nothing to do", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goOffline();
    });
    expect(result.current.transition).toBeNull();
    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
  });
});

describe("a failed flag clear is retried in the background", () => {
  const DOWN = { ok: false, error: { code: "UNKNOWN", message: "down" } };
  const OK = { ok: true, data: undefined };

  afterEach(() => {
    jest.useRealTimers();
  });

  async function liveThenFailedClear() {
    const hook = mount();
    await act(async () => {
      await hook.result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    let out: boolean | undefined;
    await act(async () => {
      out = await hook.result.current.goOffline();
    });
    return { ...hook, out };
  }

  it("queues exactly one follow-up clear after CLEAR_RETRY_MS, and it lands", async () => {
    jest.useFakeTimers();
    const { result, out } = await liveThenFailedClear();
    expect(out).toBe(false);
    // Offline in the app all the same (grey chip), and not RETRY.
    expect(result.current.isLive).toBe(false);
    expect(result.current.lastWriteFailed).toBe(false);
    const writes = mockToggleMatchPreferences.mock.calls.length;

    mockToggleMatchPreferences.mockResolvedValue(OK);
    await act(async () => {
      jest.advanceTimersByTime(CLEAR_RETRY_MS - 1);
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes);
    await act(async () => {
      jest.advanceTimersByTime(1);
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes + 1);
    expect(lastFlagWrite()).toEqual(expect.objectContaining({ lookingForRanked: false }));

    // Landed: nothing further is queued, even on a later foreground.
    await act(async () => {
      jest.advanceTimersByTime(10 * CLEAR_RETRY_MS);
      appStateHandler?.("active");
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes + 1);
  });

  it("tries again on the next foreground when the follow-up failed too", async () => {
    jest.useFakeTimers();
    await liveThenFailedClear();
    await act(async () => {
      jest.advanceTimersByTime(CLEAR_RETRY_MS);
      await flush();
    });
    const writes = mockToggleMatchPreferences.mock.calls.length;
    mockToggleMatchPreferences.mockResolvedValue(OK);
    await act(async () => {
      appStateHandler?.("active");
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes + 1);
    expect(lastFlagWrite()).toEqual(expect.objectContaining({ lookingForRanked: false }));
  });

  it("drops the follow-up once the athlete goes live again", async () => {
    jest.useFakeTimers();
    const { result } = await liveThenFailedClear();
    mockToggleMatchPreferences.mockResolvedValue(OK);
    await act(async () => {
      await result.current.goLive();
    });
    const writes = mockToggleMatchPreferences.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(CLEAR_RETRY_MS);
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes);
    expect(result.current.isLive).toBe(true);
  });

  it("toasts the honest copy from the toggle", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockToastInfo).toHaveBeenCalledWith(GO_OFFLINE_FAILED_MESSAGE);
    expect(GO_OFFLINE_FAILED_MESSAGE).not.toMatch(/try again/i);
  });
});

describe("match_location_required (contract-location-flag 4 and 6)", () => {
  const refused = { ok: false, error: { code: "LOCATION_REQUIRED", message: "no reading" } };

  it("a location_required refusal is not retried and is reported", async () => {
    mockToggleMatchPreferences.mockResolvedValue(refused);
    const { result } = mount();
    let ok = true;
    await act(async () => {
      ok = await result.current.goLive();
    });
    expect(ok).toBe(false);
    // One write: the same write cannot fix a missing reading.
    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(1);
    expect(result.current.lastGoLiveRefusal()).toBe("location_required");
    expect(result.current.isLive).toBe(false);
  });

  it("any other failure is retried once and carries no refusal", async () => {
    mockToggleMatchPreferences.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(2);
    expect(result.current.lastGoLiveRefusal()).toBeNull();
  });

  it("a landed go-live clears an earlier refusal", async () => {
    mockToggleMatchPreferences.mockResolvedValueOnce(refused);
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.isLive).toBe(true);
    expect(result.current.lastGoLiveRefusal()).toBeNull();
  });

  it("a foreground restore takes a silent reading before the live write", async () => {
    const beforeAutoLive = jest.fn(async () => {
      mockCalls.push("reading");
    });
    const { result } = mount({ beforeAutoLive });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
    });
    mockCalls.length = 0;
    await act(async () => {
      setAppState("active");
      appStateHandler?.("active");
      await flush();
      await flush();
    });
    expect(beforeAutoLive).toHaveBeenCalledTimes(1);
    expect(mockCalls.indexOf("reading")).toBeLessThan(mockCalls.indexOf("flag:true"));
    expect(result.current.isLive).toBe(true);
  });

  it("backgrounded again during that reading: stays offline, restores on the next foreground", async () => {
    const reading = deferred();
    const beforeAutoLive = jest.fn(() => reading.promise);
    const { result } = mount({ beforeAutoLive });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
    });
    await act(async () => {
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    mockCalls.length = 0;
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      reading.resolve();
      await flush();
      await flush();
    });
    expect(mockCalls).not.toContain("flag:true");
    expect(result.current.isLive).toBe(false);
    beforeAutoLive.mockResolvedValue(undefined);
    await act(async () => {
      setAppState("active");
      appStateHandler?.("active");
      await flush();
      await flush();
    });
    expect(result.current.isLive).toBe(true);
  });

  it("the arrival re-assert also reads first", async () => {
    const beforeAutoLive = jest.fn(async () => {
      mockCalls.push("reading");
    });
    const { result } = mount({ initialRanked: true, beforeAutoLive });
    await act(async () => {
      await flush();
      await flush();
    });
    expect(beforeAutoLive).toHaveBeenCalledTimes(1);
    expect(mockCalls.indexOf("reading")).toBeLessThan(mockCalls.indexOf("flag:true"));
    expect(result.current.isLive).toBe(true);
  });
});

describe("live location fixes 1b: a restore whose reading says permission is gone", () => {
  it("foreground restore: beforeAutoLive false makes NO live write and stays offline, silently", async () => {
    const beforeAutoLive = jest.fn(async () => true as boolean);
    const { result } = mount({ beforeAutoLive });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
    });
    beforeAutoLive.mockResolvedValue(false);
    mockCalls.length = 0;
    mockToastInfo.mockClear();
    await act(async () => {
      setAppState("active");
      appStateHandler?.("active");
      await flush();
      await flush();
    });
    expect(beforeAutoLive).toHaveBeenCalledTimes(1);
    expect(mockCalls).not.toContain("flag:true");
    expect(mockCalls).not.toContain("joinLobby");
    expect(result.current.isLive).toBe(false);
    // The caller already offered the CTA: no "You're offline" toast on top.
    expect(mockToastInfo).not.toHaveBeenCalled();
    // A later tap still goes live.
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.isLive).toBe(true);
  });

  it("post-match resume: beforeAutoLive false makes no live write", async () => {
    const beforeAutoLive = jest.fn(async () => true as boolean);
    const { result, rerender } = mount({ beforeAutoLive });
    await act(async () => {
      await result.current.goLive();
    });
    await act(async () => {
      rerender({ ...ARGS, beforeAutoLive, inMatch: true });
      await flush();
    });
    beforeAutoLive.mockResolvedValue(false);
    mockCalls.length = 0;
    await act(async () => {
      rerender({ ...ARGS, beforeAutoLive, inMatch: false });
      await flush();
      await flush();
    });
    expect(mockCalls).not.toContain("flag:true");
    expect(result.current.isLive).toBe(false);
  });

  it("arrival with the flag set: beforeAutoLive false clears the stale flag instead of re-asserting it", async () => {
    const beforeAutoLive = jest.fn(async () => false);
    const { result } = mount({ initialRanked: true, beforeAutoLive });
    await act(async () => {
      await flush();
      await flush();
    });
    expect(mockCalls).not.toContain("flag:true");
    expect(mockCalls).toContain("flag:false");
    expect(result.current.isLive).toBe(false);
  });

  it("a reading that resolves undefined (other failures) still goes ahead, as before", async () => {
    const beforeAutoLive = jest.fn(async () => undefined);
    const { result } = mount({ initialRanked: true, beforeAutoLive });
    await act(async () => {
      await flush();
      await flush();
    });
    expect(mockCalls).toContain("flag:true");
    expect(result.current.isLive).toBe(true);
  });
});

describe("live location fixes D7: the server expired the live session", () => {
  it("drops to offline when the server says off and nothing moved meanwhile (no flag write)", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    mockCalls.length = 0;
    let dropped = false;
    await act(async () => {
      dropped = await result.current.dropIfServerOffline(async () => false);
    });
    expect(dropped).toBe(true);
    expect(result.current.isLive).toBe(false);
    expect(mockCalls).toEqual(["leaveLobby"]);
    // Going live again works (intent and committed state were both reset).
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.isLive).toBe(true);
    expect(mockCalls).toContain("flag:true");
  });

  it("keeps live when the server says live, or the read failed (null)", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    for (const answer of [true, null]) {
      let dropped = true;
      await act(async () => {
        dropped = await result.current.dropIfServerOffline(async () => answer);
      });
      expect(dropped).toBe(false);
      expect(result.current.isLive).toBe(true);
    }
  });

  it("never drops when not live, and never reads", async () => {
    const { result } = mount();
    const read = jest.fn(async () => false);
    let dropped = true;
    await act(async () => {
      dropped = await result.current.dropIfServerOffline(read);
    });
    expect(dropped).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("a transition that started during the read wins (a stale 'off' never undoes it)", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    const answer = deferred<boolean | null>();
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.dropIfServerOffline(() => answer.promise);
    });
    // The athlete goes offline and back live while the read is in flight.
    await act(async () => {
      await result.current.goOffline();
      await result.current.goLive();
    });
    let dropped = true;
    await act(async () => {
      answer.resolve(false);
      dropped = await pending;
    });
    expect(dropped).toBe(false);
    expect(result.current.isLive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// autoLive: the location ladder's restores (review round 1, B2)
// ---------------------------------------------------------------------------

describe("autoLive (instant go-live restores): runAutoLive and canWrite", () => {
  type Ctx = Parameters<NonNullable<UseArenaLiveArgs["autoLive"]>>[0];
  type Outcome = "live" | "failed" | "parked" | "cancelled";

  /** An autoLive the test answers by hand; records every ctx it was given. */
  function controlledAutoLive() {
    const calls: { ctx: Ctx; answer: ReturnType<typeof deferred<Outcome>> }[] = [];
    const autoLive = jest.fn((ctx: Ctx) => {
      const answer = deferred<Outcome>();
      calls.push({ ctx, answer });
      return answer.promise;
    });
    return { autoLive, calls };
  }

  it("a background while a restore runs parks it (never 'cancelled'), and the resume intent survives", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ autoLive });
    await act(async () => {
      await result.current.goLive();
    });
    // Away and back: the foreground restore starts.
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(calls).toHaveLength(1);
    // A quick app switch mid-restore (a silent fix running).
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
    });
    expect(calls[0].ctx.canWrite()).toBe("parked");
    await act(async () => {
      calls[0].answer.resolve("parked");
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    // Restored again on return, not dropped.
    expect(calls).toHaveLength(2);
  });

  it("a restore that fails while the app is in the background keeps the intent for the next foreground", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ autoLive });
    await act(async () => {
      await result.current.goLive();
      setAppState("background");
      appStateHandler?.("background");
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(calls).toHaveLength(1);
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
      // The fix failed while away: the ladder could say nothing.
      calls[0].answer.resolve("failed");
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(calls).toHaveLength(2);
  });

  it("only the athlete's own go-offline cancels a restore in flight", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ autoLive });
    await act(async () => {
      await result.current.goLive();
      setAppState("background");
      appStateHandler?.("background");
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(calls[0].ctx.canWrite()).toBe("ok");
    await act(async () => {
      await result.current.goOffline();
    });
    expect(calls[0].ctx.canWrite()).toBe("cancelled");
  });

  it.each(["failed", "parked", "cancelled"] as const)(
    "cold start while live: a restore that ends %s clears the stale looking_for_ranked = true",
    async (outcome) => {
      const { autoLive, calls } = controlledAutoLive();
      mount({ initialRanked: true, autoLive });
      await act(async () => {
        await flush();
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].ctx.reason).toBe("arrival");
      await act(async () => {
        // Parked means the app went away mid-restore.
        if (outcome === "parked") {
          setAppState("background");
          appStateHandler?.("background");
        }
        calls[0].answer.resolve(outcome);
        await flush();
      });
      // The arrived `true` is written back to false: never advertised while
      // the app shows GO LIVE.
      expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
    },
  );

  it("cold start while live: a restore that lands keeps the athlete live (no clear)", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ initialRanked: true, autoLive });
    await act(async () => {
      await flush();
    });
    await act(async () => {
      const ok = await calls[0].ctx.write();
      expect(ok).toBe(true);
      calls[0].answer.resolve("live");
      await flush();
    });
    expect(result.current.isLive).toBe(true);
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: true });
  });

  it("cold start while live: the athlete tapping Go live meanwhile wins over the clear", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ initialRanked: true, autoLive });
    await act(async () => {
      await flush();
      await result.current.goLive();
    });
    const writes = mockToggleMatchPreferences.mock.calls.length;
    await act(async () => {
      calls[0].answer.resolve("failed");
      await flush();
    });
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(writes);
    expect(result.current.isLive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Review round 2
// ---------------------------------------------------------------------------

describe("round 2: single-flight restores, cancel races, an abandoned tap", () => {
  type Ctx = Parameters<NonNullable<UseArenaLiveArgs["autoLive"]>>[0];
  type Outcome = "live" | "failed" | "parked" | "cancelled";

  function controlledAutoLive() {
    const calls: { ctx: Ctx; answer: ReturnType<typeof deferred<Outcome>> }[] = [];
    const autoLive = jest.fn((ctx: Ctx) => {
      const answer = deferred<Outcome>();
      calls.push({ ctx, answer });
      return answer.promise;
    });
    return { autoLive, calls };
  }

  async function away() {
    setAppState("background");
    appStateHandler?.("background");
    await flush();
  }
  async function back() {
    setAppState("active");
    appStateHandler?.("active");
    await flush();
  }

  it("SF1: background then foreground before the restore's first canWrite starts NO second restore; the first carries on", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ autoLive });
    await act(async () => {
      await result.current.goLive();
      await away();
      await back();
    });
    expect(calls).toHaveLength(1);
    await act(async () => {
      await away();
      await back();
    });
    // Still one run: no concurrent restore.
    expect(calls).toHaveLength(1);
    // The running one may write now.
    expect(calls[0].ctx.canWrite()).toBe("ok");
    await act(async () => {
      const ok = await calls[0].ctx.write();
      expect(ok).toBe(true);
      calls[0].answer.resolve("live");
      await flush();
    });
    expect(result.current.isLive).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("SF1: a run that saw the background (parked) but finds the app back in front carries on once more", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const { result } = mount({ autoLive });
    await act(async () => {
      await result.current.goLive();
      await away();
      await back();
      await away();
      await back();
    });
    expect(calls).toHaveLength(1);
    await act(async () => {
      calls[0].answer.resolve("parked");
      await flush();
    });
    // Re-run once, from the run itself (the "active" handler left it to it).
    expect(calls).toHaveLength(2);
  });

  it("QA A: offline chosen while the live write is in flight: the final write is offline", async () => {
    const write = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(write.promise);
    const { result } = mount();
    let live!: Promise<boolean>;
    act(() => {
      live = result.current.goLive();
    });
    // The live write is out (in flight) before the athlete chooses offline.
    await act(async () => {
      await flush();
    });
    expect(mockToggleMatchPreferences).toHaveBeenCalledTimes(1);
    let off!: Promise<boolean>;
    act(() => {
      off = result.current.goOffline();
    });
    await act(async () => {
      write.resolve({ ok: true, data: undefined });
      await live;
      await off;
    });
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
    expect(result.current.isLive).toBe(false);
  });

  it("QA A: the write lands first, then offline: the final write is offline too", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    expect(result.current.isLive).toBe(true);
    await act(async () => {
      await result.current.goOffline();
    });
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
    expect(result.current.isLive).toBe(false);
  });

  it("QA B: a tapped go-live abandoned by the background is not restored on return, and ends offline", async () => {
    const { autoLive, calls } = controlledAutoLive();
    const write = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(write.promise);
    const { result } = mount({ autoLive });
    // The athlete's own tapped go-live, through the guard, write in flight.
    registerArenaController({
      toggle: jest.fn(),
      goOffline: () => result.current.goOffline(),
      goLive: () => result.current.goLive(),
      sendChallenge: jest.fn(),
      cancelOutgoing: jest.fn(),
      clearCap: jest.fn(),
      tuckIncoming: jest.fn(),
      reopenIncoming: jest.fn(),
    });
    let tap!: Promise<unknown>;
    act(() => {
      tap = liveSwitch.goLive();
    });
    await act(async () => {
      await flush();
      await away();
      // The write lands while the app is away.
      write.resolve({ ok: true, data: undefined });
      await tap;
      await flush();
      await back();
    });
    // Not restored on return (spec 2.2: pending flows are cancelled).
    expect(calls).toHaveLength(0);
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
  });
});

// ---------------------------------------------------------------------------
// Review round 3: resume derived from the athlete's last choice
// ---------------------------------------------------------------------------

describe("round 3: the athlete's last choice decides every resume", () => {
  type Ctx = Parameters<NonNullable<UseArenaLiveArgs["autoLive"]>>[0];

  function wire(result: { current: ReturnType<typeof useArenaLive> }) {
    return registerArenaController({
      toggle: jest.fn(),
      goOffline: () => result.current.goOffline(),
      goLive: () => result.current.goLive(),
      committed: () => result.current.committed(),
      ensureOffline: () => result.current.ensureOffline(),
      sendChallenge: jest.fn(),
      cancelOutgoing: jest.fn(),
      clearCap: jest.fn(),
      tuckIncoming: jest.fn(),
      reopenIncoming: jest.fn(),
    });
  }

  it("X1: live, Go offline chosen, then the background: back in front stays OFFLINE (no restore)", async () => {
    const autoLive = jest.fn(async (ctx: Ctx) => ((await ctx.write()) ? "live" : "failed")) as never;
    const { result } = mount({ autoLive });
    wire(result);
    await act(async () => {
      await liveSwitch.goLive();
    });
    expect(result.current.isLive).toBe(true);
    // Hung clear: the offline choice is not even written yet.
    const hung = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(hung.promise);
    act(() => {
      void liveSwitch.goOffline();
    });
    await act(async () => {
      setAppState("background");
      appStateHandler?.("background");
      await flush();
      hung.resolve({ ok: true, data: undefined });
      await flush();
      setAppState("active");
      appStateHandler?.("active");
      await flush();
    });
    expect(autoLive).not.toHaveBeenCalled();
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
  });

  it("kill and relaunch after choosing offline: the persisted choice clears the stale true, never restores", async () => {
    const autoLive = jest.fn(async () => "live" as const);
    const { result } = mount({
      initialRanked: true,
      autoLive,
      loadPersistedIntent: () => Promise.resolve({ live: false, at: 1, confirmed: false }),
    });
    wire(result);
    await act(async () => {
      await flush();
    });
    expect(autoLive).not.toHaveBeenCalled();
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
    // Round 4 (QA cold start): held offline in the app too, not only on the server.
    expect(getLiveIntent()).toMatchObject({ decided: true, live: false });
    expect(result.current.isLive).toBe(false);
  });

  it("round 4 (R2): an offline choice whose clear LANDED, then a server true (a newer session, e.g. web): adopted, restored", async () => {
    const autoLive = jest.fn(async () => "live" as const);
    mount({
      initialRanked: true,
      autoLive,
      loadPersistedIntent: () => Promise.resolve({ live: false, at: 1, confirmed: true }),
    });
    await act(async () => {
      await flush();
    });
    expect(autoLive).toHaveBeenCalledTimes(1);
  });

  it("round 4 nit: a stored-choice read that hangs is given up after 1 s (restores as unknown)", async () => {
    jest.useFakeTimers();
    try {
      const autoLive = jest.fn(async () => "live" as const);
      mount({ initialRanked: true, autoLive, loadPersistedIntent: () => new Promise(() => undefined) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(999);
      });
      expect(autoLive).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(autoLive).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("kill and relaunch after choosing live: restored as before", async () => {
    const autoLive = jest.fn(async () => "live" as const);
    mount({
      initialRanked: true,
      autoLive,
      loadPersistedIntent: () => Promise.resolve({ live: true, at: 1, confirmed: false }),
    });
    await act(async () => {
      await flush();
    });
    expect(autoLive).toHaveBeenCalledTimes(1);
  });

  it("an offline choice makes the executor refuse any live write (one source of truth)", async () => {
    const { result } = mount();
    wire(result);
    act(() => {
      void liveSwitch.goOffline();
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.goLive();
    });
    expect(ok).toBe(false);
    expect(mockToggleMatchPreferences.mock.calls.some((c) => (c[2] as { lookingForRanked: boolean }).lookingForRanked)).toBe(false);
  });

  it("sign-out started: the executor refuses any live write", async () => {
    const { result } = mount();
    wire(result);
    await act(async () => {
      await takeArenaOfflineBeforeSignOut(10);
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.goLive();
    });
    expect(ok).toBe(false);
    expect(mockToggleMatchPreferences.mock.calls.some((c) => (c[2] as { lookingForRanked: boolean }).lookingForRanked)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Review round 4: the server may still say live after a failed clear (R1)
// ---------------------------------------------------------------------------

describe("round 4 (R1): a failed clear never leaves the athlete advertised", () => {
  const DOWN = { ok: false, error: { code: "UNKNOWN", message: "down" } };
  const OK = { ok: true, data: undefined };

  afterEach(() => {
    jest.useRealTimers();
  });

  async function liveThenFailedClear() {
    const hook = mount();
    await act(async () => {
      await hook.result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      await hook.result.current.goOffline();
    });
    mockToggleMatchPreferences.mockResolvedValue(OK);
    return hook;
  }

  const falseWrites = () =>
    mockToggleMatchPreferences.mock.calls.filter((c) => !(c[2] as { lookingForRanked: boolean }).lookingForRanked).length;

  it("a later go-offline tap writes false again (never 'desired equals committed')", async () => {
    jest.useFakeTimers();
    const { result } = await liveThenFailedClear();
    expect(result.current.committed().settled).toBe(false);
    const before = falseWrites();
    await act(async () => {
      expect(await result.current.goOffline()).toBe(true);
    });
    expect(falseWrites()).toBe(before + 1);
    expect(result.current.committed()).toEqual({ live: false, settled: true });
  });

  it("sign-out writes false unconditionally, at once (seed 777102)", async () => {
    jest.useFakeTimers();
    const { result } = await liveThenFailedClear();
    const before = falseWrites();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.signOutOffline();
    });
    expect(ok).toBe(true);
    expect(falseWrites()).toBeGreaterThan(before);
  });

  it("sign-out writes false even when the hook believes it is already offline and settled", async () => {
    const { result } = mount();
    const before = falseWrites();
    await act(async () => {
      await result.current.signOutOffline();
    });
    expect(falseWrites()).toBeGreaterThan(before);
  });

  it("keeps retrying a failed clear with backoff while in front, until it lands", async () => {
    jest.useFakeTimers();
    const { result } = await liveThenFailedClear();
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    const at = (ms: number) =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });
    const before = falseWrites();
    await at(CLEAR_RETRY_MS);
    expect(falseWrites()).toBe(before + 2); // one retry (two attempts inside writeLookingFlag)
    await at(2 * CLEAR_RETRY_MS);
    expect(falseWrites()).toBe(before + 4);
    mockToggleMatchPreferences.mockResolvedValue(OK);
    await at(4 * CLEAR_RETRY_MS);
    expect(falseWrites()).toBe(before + 5);
    expect(result.current.committed().settled).toBe(true);
    await at(10 * CLEAR_RETRY_MAX_MS);
    expect(falseWrites()).toBe(before + 5);
  });

  it("a go-live write that failed without a refusal may have committed: the offline that follows writes false", async () => {
    const { result } = mount();
    mockToggleMatchPreferences.mockResolvedValue(DOWN);
    await act(async () => {
      expect(await result.current.goLive()).toBe(false);
    });
    mockToggleMatchPreferences.mockResolvedValue(OK);
    const before = falseWrites();
    await act(async () => {
      await result.current.ensureOffline();
    });
    expect(falseWrites()).toBe(before + 1);
  });

  it("a false that lands is reported (the owner confirms a persisted offline choice)", async () => {
    const onOfflineLanded = jest.fn();
    const { result } = mount({ onOfflineLanded });
    await act(async () => {
      await result.current.goLive();
      await result.current.goOffline();
    });
    expect(onOfflineLanded).toHaveBeenCalledTimes(1);
  });
});

describe("round 4: the own-row check corrects any disagreement", () => {
  it("drawn and committed live, server false: dropped", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    let r: unknown;
    await act(async () => {
      r = await result.current.checkServer(() => Promise.resolve(false));
    });
    expect(r).toBe("dropped");
    expect(result.current.isLive).toBe(false);
  });

  it("an offline choice the server still has live (its clear never landed): a clear goes out", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    mockToggleMatchPreferences.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "down" } });
    await act(async () => {
      await result.current.goOffline();
    });
    mockToggleMatchPreferences.mockResolvedValue({ ok: true, data: undefined });
    act(() => {
      setAppLiveIntent(false);
    });
    await act(async () => {
      await flush();
    });
    // The follow-up clear has not run yet (a timer): the server still says live.
    const before = mockToggleMatchPreferences.mock.calls.length;
    let r: unknown;
    await act(async () => {
      r = await result.current.checkServer(() => Promise.resolve(true));
      await flush();
    });
    expect(r).toBe("cleared");
    expect(mockToggleMatchPreferences.mock.calls.length).toBeGreaterThan(before);
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
  });

  it("an offline choice the server acknowledged, then the server live (web went live after it): adopted", async () => {
    const autoLive = jest.fn(async (ctx: { write: () => Promise<boolean> }) =>
      (await ctx.write()) ? ("live" as const) : ("failed" as const),
    );
    const { result } = mount({ autoLive });
    act(() => {
      setAppLiveIntent(false);
    });
    let r: unknown;
    await act(async () => {
      r = await result.current.checkServer(() => Promise.resolve(true));
      await flush();
    });
    expect(r).toBe("adopted");
    expect(getLiveIntent()).toMatchObject({ decided: true, live: true });
    expect(autoLive).toHaveBeenCalledTimes(1);
  });

  it("agreement (offline, server false): nothing", async () => {
    const { result } = mount();
    let r: unknown;
    await act(async () => {
      r = await result.current.checkServer(() => Promise.resolve(false));
    });
    expect(r).toBeNull();
  });

  it("a read failure or a transition during the read changes nothing", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.goLive();
    });
    let r: unknown;
    await act(async () => {
      r = await result.current.checkServer(async () => {
        void result.current.goOffline();
        return false;
      });
    });
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Review round 5: adoption of a session started elsewhere never loops (A1)
// ---------------------------------------------------------------------------

describe("round 5 (A1): a web session the phone cannot meet is adopted at most once", () => {
  type Ctx = Parameters<NonNullable<UseArenaLiveArgs["autoLive"]>>[0];

  function wire(result: { current: ReturnType<typeof useArenaLive> }) {
    return registerArenaController({
      toggle: jest.fn(),
      goOffline: () => result.current.goOffline(),
      goLive: () => result.current.goLive(),
      committed: () => result.current.committed(),
      ensureOffline: () => result.current.ensureOffline(),
      sendChallenge: jest.fn(),
      cancelOutgoing: jest.fn(),
      clearCap: jest.fn(),
      tuckIncoming: jest.fn(),
      reopenIncoming: jest.fn(),
    });
  }

  const liveWrites = () =>
    mockToggleMatchPreferences.mock.calls.filter((c) => (c[2] as { lookingForRanked: boolean }).lookingForRanked).length;

  it("reviewer probe: three checks with the server live and a restore that fails: 1 restore, 1 toast, then declined", async () => {
    const toasts: string[] = [];
    const autoLive = jest.fn(async (_ctx: Ctx) => {
      // As the real ladder does without a tag or permission: says so once,
      // holds offline.
      toasts.push("Location is off");
      setAppLiveIntent(false);
      return "failed" as const;
    });
    const { result } = mount({ autoLive });
    wire(result);
    await act(async () => {
      await liveSwitch.goOffline();
    });
    const out: unknown[] = [];
    for (let k = 0; k < 3; k++) {
      await act(async () => {
        out.push(await result.current.checkServer(() => Promise.resolve(true)));
        await flush();
      });
    }
    expect(out).toEqual(["adopted", null, null]);
    expect(autoLive).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveLength(1);
    expect(liveWrites()).toBe(0);
  });

  it("not likely to work without asking (no tag, no permission): declined at once, no ladder, no toast", async () => {
    const autoLive = jest.fn(async () => "live" as const);
    const { result } = mount({ autoLive, canAdopt: () => false });
    wire(result);
    for (let k = 0; k < 3; k++) {
      await act(async () => {
        expect(await result.current.checkServer(() => Promise.resolve(true))).toBeNull();
        await flush();
      });
    }
    expect(autoLive).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("a declined session is offered again once the server reads false (a new session), or after a new choice here", async () => {
    const autoLive = jest.fn(async () => {
      setAppLiveIntent(false);
      return "failed" as const;
    });
    const { result } = mount({ autoLive });
    wire(result);
    const check = (v: boolean) =>
      act(async () => {
        await result.current.checkServer(() => Promise.resolve(v));
        await flush();
      });
    await check(true);
    await check(true);
    expect(autoLive).toHaveBeenCalledTimes(1);
    // The web session ended, a new one started: adopted once more.
    await check(false);
    await check(true);
    expect(autoLive).toHaveBeenCalledTimes(2);
    // A new explicit choice here (offline, acknowledged): the decline is over.
    await act(async () => {
      await liveSwitch.goOffline();
    });
    await check(true);
    expect(autoLive).toHaveBeenCalledTimes(3);
  });
});

describe("round 5 (A2): sign-out waits for both false writes", () => {
  it("resolves only after the immediate false AND the serialized clear behind a write in flight", async () => {
    const { result } = mount();
    // A live write in flight (hung), then sign-out.
    const hung = deferred<{ ok: true; data: undefined }>();
    mockToggleMatchPreferences.mockReturnValueOnce(hung.promise);
    act(() => {
      void result.current.goLive();
    });
    await act(async () => {
      await flush();
    });
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: true });
    const before = mockToggleMatchPreferences.mock.calls.length;
    let done = false;
    let ok: boolean | undefined;
    act(() => {
      void result.current.signOutOffline().then((r) => {
        done = true;
        ok = r;
      });
    });
    await act(async () => {
      await flush();
    });
    // The immediate false went out (and landed); the serialized clear waits on the hung write.
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(before + 1);
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
    expect(done).toBe(false);
    await act(async () => {
      hung.resolve({ ok: true, data: undefined });
      await flush();
    });
    expect(done).toBe(true);
    expect(ok).toBe(true);
    // The serialized clear followed the hung live write.
    expect(mockToggleMatchPreferences.mock.calls.length).toBe(before + 2);
    expect(lastFlagWrite()).toMatchObject({ lookingForRanked: false });
  });
});
