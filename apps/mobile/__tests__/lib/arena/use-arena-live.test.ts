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

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { useArenaLive, type UseArenaLiveArgs } from "@/lib/arena/use-arena-live";

// ---- fixtures ----

const ARGS: UseArenaLiveArgs = {
  athleteId: "me-1",
  displayName: "Me",
  currentElo: 1200,
  initialRanked: false,
  isArenaTabSelected: true,
};

let appStateHandler: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
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
  it("leaves presence before clearing the flag", async () => {
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

describe("staying live inside the Arena", () => {
  it("keeps you live while the Arena TAB is still selected", async () => {
    // Pushing an athlete profile or a match blurs the Arena SCREEN while the
    // tab stays selected. Keying on screen focus would drop the athlete out
    // of the lobby for reading a profile, or for the match they just accepted.
    const { result, rerender } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();
    mockLeaveLobby.mockClear();

    await act(async () => {
      rerender({ ...ARGS, isArenaTabSelected: true });
      await Promise.resolve();
    });

    expect(mockLeaveLobby).not.toHaveBeenCalled();
    expect(mockToggleMatchPreferences).not.toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });

  it("clears BOTH signals when the athlete switches to another tab", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockToggleMatchPreferences.mockClear();
    mockLeaveLobby.mockClear();

    await act(async () => {
      rerender({ ...ARGS, isArenaTabSelected: false });
      await Promise.resolve();
    });

    expect(mockLeaveLobby).toHaveBeenCalled();
    expect(lastFlagWrite()).toEqual({
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
  });
});

describe("overlapping transitions", () => {
  it("still goes offline when the app backgrounds DURING the go-live write", async () => {
    // The flag write is a round trip and can be two. If "am I live?" only
    // became true after it, this background would find nothing to clear and
    // return happy, leaving the athlete live and unreachable with no path
    // that ever clears them: the AppState handler ignores "active" and the
    // tab effect cannot fire until they come back.
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
