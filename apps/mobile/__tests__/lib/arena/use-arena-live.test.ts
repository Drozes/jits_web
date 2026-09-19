/**
 * Going live, and the thing web gets wrong: coming back off.
 *
 * "Online now" is Presence and "Open to challenges" is the `looking_for_ranked`
 * column. Presence lapses on its own when the socket dies; the column does
 * not. Anything that drops one without the other leaves an athlete advertised
 * as available and unreachable, so every assertion here is about the two
 * moving together.
 */
import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

// ---- mocks ----

const mockCalls: string[] = [];

const mockToggleMatchPreferences = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  toggleMatchPreferences: (...args: unknown[]) =>
    mockToggleMatchPreferences(...args),
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

// The screen is focused for the life of the render; the returned cleanup is
// the blur, which is what actually means "not in the Arena" on a tab
// navigator that keeps its screens mounted.
jest.mock("expo-router", () => {
  const R = require("react");
  return {
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      R.useEffect(cb, [cb]);
    },
  };
});

import { useArenaLive } from "@/lib/arena/use-arena-live";

// ---- fixtures ----

const ARGS = {
  athleteId: "me-1",
  displayName: "Me",
  currentElo: 1200,
  initialRanked: false,
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

function mount(overrides: Partial<typeof ARGS> = {}) {
  return renderHook(() => useArenaLive({ ...ARGS, ...overrides }));
}

describe("useArenaLive", () => {
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

  it("leaves presence before clearing the flag when going offline", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.toggle();
    });
    mockCalls.length = 0;
    mockToggleMatchPreferences.mockClear();

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockCalls[0]).toBe("leaveLobby");
    expect(mockToggleMatchPreferences).toHaveBeenCalledWith({}, "me-1", {
      lookingForCasual: false,
      lookingForRanked: false,
    });
    expect(result.current.isLive).toBe(false);
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
    expect(mockToggleMatchPreferences).toHaveBeenCalledWith({}, "me-1", {
      lookingForCasual: false,
      lookingForRanked: false,
    });
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

  it("clears BOTH signals when the athlete leaves the surface", async () => {
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
    expect(mockToggleMatchPreferences).toHaveBeenCalledWith({}, "me-1", {
      lookingForCasual: false,
      lookingForRanked: false,
    });
  });

  it("re-asserts a flag the athlete arrived with, instead of trusting it", async () => {
    // The auth context caches the athlete row, so a second visit in the same
    // session can hand us a `true` we ourselves cleared on the way out.
    // Writing it again is what makes "flagged" and "present" true together.
    const { result } = mount({ initialRanked: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockToggleMatchPreferences).toHaveBeenCalledWith({}, "me-1", {
      lookingForCasual: false,
      lookingForRanked: true,
    });
    expect(mockJoinLobby).toHaveBeenCalled();
    expect(result.current.isLive).toBe(true);
  });
});
