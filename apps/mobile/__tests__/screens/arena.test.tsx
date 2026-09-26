/**
 * The Arena screen: the roster split and the action matrix.
 *
 * The split is the product: "Online now" comes from Presence and is the only
 * section that can carry a Challenge, because an offline opponent cannot
 * answer a live prompt. Everything below fixes one cell of that matrix, and
 * every state the screen can reach has to be reachable here, none of them a
 * dead end.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    accentCta: "#E63946",
    bgPrimary: "#0D0F14",
    bgSecondary: "#13151B",
    textPrimary: "#E8EDF2",
    textSecondary: "#9CA3AF",
    textTertiary: "#8D929D",
    textOnAccent: "#0D0F14",
  }),
}));

// The bell has its own realtime subscription; it is not what this screen test
// is about.
jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef(
      (props: { children: React.ReactNode }, ref: unknown) => {
        R.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return R.createElement(RN.View, {}, props.children);
      },
    ),
    BottomSheetView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

const mockAthlete = {
  id: "me-1",
  display_name: "Me",
  current_elo: 1200,
  current_weight: 180,
  looking_for_ranked: false,
};
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ athlete: mockAthlete, isLoading: false }),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | undefined> = {};
// Records each focus effect so a test can simulate the tab losing focus.
const mockFocusCleanups: (() => void)[] = [];
// Stable, like expo-router's own (useRouter returns the imperative singleton).
const mockRouter = {
  push: (...a: unknown[]) => mockPush(...a),
  replace: jest.fn(),
  back: jest.fn(),
  // The rematch param must be cleared on THIS route, never through the
  // global router, so this one must stay untouched.
  setParams: jest.fn(),
};
// Route-scoped navigation. setParams really updates the params, as the route
// would.
const mockNavigation = {
  setParams: (p: Record<string, string | undefined>) => {
    mockSetParams(p);
    mockParams = { ...mockParams, ...p };
  },
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react");
    R.useEffect(() => {
      const cleanup = cb();
      if (cleanup) mockFocusCleanups.push(cleanup);
      return cleanup;
    }, [cb]);
  },
}));

let mockIsFocused = true;
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: () => mockIsFocused,
}));

const mockImpact = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (...a: unknown[]) => mockImpact(...a),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

let mockLobbyIds = new Set<string>();
const mockUseLobbyPresence = jest.fn();
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: (...a: unknown[]) => mockUseLobbyPresence(...a),
  useLobbyIds: () => mockLobbyIds,
}));

// The screen must never own a live writer or a challenge listener of its own:
// both are mounted once, app-wide, by <ArenaBootstrap />. These mocks exist
// only so a regression that re-mounts them here is caught below.
const mockUseArenaLive = jest.fn();
jest.mock("@/lib/arena/use-arena-live", () => ({
  useArenaLive: (...a: unknown[]) => mockUseArenaLive(...a),
}));
const mockUseArenaChallenge = jest.fn();
jest.mock("@/lib/arena/use-arena-challenge", () => ({
  useArenaChallenge: (...a: unknown[]) => mockUseArenaChallenge(...a),
}));

const mockRefresh = jest.fn();
const mockRefreshQuietly = jest.fn();
let mockRoster = {
  competitors: [] as unknown[],
  challengedIds: new Set<string>(),
  isLoading: false,
  isRefreshing: false,
  hasError: false,
  isFetching: false,
  lastReadOk: true,
  refresh: mockRefresh,
  refreshQuietly: mockRefreshQuietly,
};
jest.mock("@/lib/arena/use-arena-roster", () => ({
  useArenaRoster: () => mockRoster,
}));

const mockToggle = jest.fn();
const mockSendChallenge = jest.fn();
const mockCancelOutgoing = jest.fn();
const mockClearCap = jest.fn();
const mockSetUnavailable = jest.fn();
let mockIsLive = false;
let mockInMatch = false;
let mockChallenge = {
  incoming: null as unknown,
  outgoing: null as unknown,
  isBusy: false,
  capReached: false,
};
jest.mock("@/lib/arena/arena-store", () => ({
  useArenaState: () => ({ isLive: mockIsLive, isSaving: false, ...mockChallenge }),
  useIsArenaLive: () => mockIsLive,
  useIsInArenaMatch: () => mockInMatch,
  arenaActions: {
    toggle: (...a: unknown[]) => mockToggle(...a),
    sendChallenge: (...a: unknown[]) => mockSendChallenge(...a),
    cancelOutgoing: (...a: unknown[]) => mockCancelOutgoing(...a),
    clearCap: (...a: unknown[]) => mockClearCap(...a),
    goOffline: jest.fn(),
  },
  setOpponentUnavailableHandler: (...a: unknown[]) => mockSetUnavailable(...a),
}));

import ArenaScreen from "@/app/(app)/(tabs)/arena/index";

// ---- fixtures ----

function competitor(over: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    displayName: "Alpha",
    currentElo: 1300,
    gymName: "Gracie",
    weight: 185,
    profilePhotoUrl: null,
    eloDiff: 100,
    acceptsRanked: true,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFocusCleanups.length = 0;
  mockLobbyIds = new Set();
  mockIsFocused = true;
  mockIsLive = false;
  mockInMatch = false;
  mockRoster = {
    competitors: [],
    challengedIds: new Set(),
    isLoading: false,
    isRefreshing: false,
    hasError: false,
    isFetching: false,
    lastReadOk: true,
    refresh: mockRefresh,
    refreshQuietly: mockRefreshQuietly,
  };
  mockChallenge = {
    incoming: null,
    outgoing: null,
    isBusy: false,
    capReached: false,
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Arena screen", () => {
  it("shows a skeleton, never a blank screen, while the roster loads", () => {
    mockRoster.isLoading = true;
    const { getByLabelText, queryByText } = render(<ArenaScreen />);

    expect(getByLabelText("Loading the Arena")).toBeTruthy();
    expect(queryByText("Online now")).toBeNull();
  });

  it("splits the roster on presence and counts each side", () => {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha" }),
      competitor({ id: "a-2", displayName: "Bravo" }),
    ];
    mockLobbyIds = new Set(["a-1"]);

    const { getByText, getByLabelText, queryByLabelText } = render(
      <ArenaScreen />,
    );

    expect(getByText("Online now")).toBeTruthy();
    expect(getByText("Open to challenges")).toBeTruthy();
    // Only the present athlete can answer a live prompt, so only that row
    // carries the action.
    expect(getByLabelText("Challenge Alpha")).toBeTruthy();
    expect(queryByLabelText("Challenge Bravo")).toBeNull();
  });

  it("challenges by id and name when the action is tapped", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const { getByLabelText } = render(<ArenaScreen />);
    fireEvent.press(getByLabelText("Challenge Alpha"));

    expect(mockSendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("offers a working way to go live instead of a dead button", () => {
    // The viewer is offline. The affordance names the reason AND fixes it.
    mockIsLive = false;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const { getByLabelText, queryByLabelText } = render(<ArenaScreen />);
    expect(queryByLabelText("Challenge Alpha")).toBeNull();

    fireEvent.press(getByLabelText("Go live to challenge Alpha"));
    expect(mockToggle).toHaveBeenCalled();
  });

  it("suppresses the action for an athlete who does not take ranked", () => {
    // opponent_accepts_match_type() reads looking_for_ranked, so the insert
    // would be refused by RLS. Offering it would promise a failure.
    mockIsLive = true;
    mockRoster.competitors = [competitor({ acceptsRanked: false })];
    mockLobbyIds = new Set(["a-1"]);

    const { getByText, queryByLabelText } = render(<ArenaScreen />);
    expect(queryByLabelText("Challenge Alpha")).toBeNull();
    expect(getByText("Casual only")).toBeTruthy();
  });

  it("shows an already-challenged athlete as pending", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockRoster.challengedIds = new Set(["a-1"]);

    const { getByText, queryByLabelText } = render(<ArenaScreen />);
    expect(getByText("Pending")).toBeTruthy();
    expect(queryByLabelText("Challenge Alpha")).toBeNull();
  });

  it("states the 3-challenge cap and stops offering challenges", () => {
    mockIsLive = true;
    mockChallenge.capReached = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const { getByText, queryByLabelText } = render(<ArenaScreen />);

    expect(getByText("You have 3 challenges out")).toBeTruthy();
    expect(queryByLabelText("Challenge Alpha")).toBeNull();
    expect(getByText("3 out")).toBeTruthy();
  });

  it("offers a retry inline when the roster read failed", () => {
    mockRoster.hasError = true;
    const { getByText, getByLabelText } = render(<ArenaScreen />);

    expect(getByText(/couldn't reach the lobby/i)).toBeTruthy();
    fireEvent.press(getByLabelText("Retry"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not claim the lobby is empty when the read failed", () => {
    mockRoster.hasError = true;
    const { queryByText } = render(<ArenaScreen />);
    expect(queryByText("Lobby empty")).toBeNull();
  });

  it("says the lobby is empty only when the read succeeded with nobody in it", () => {
    const { getByText } = render(<ArenaScreen />);
    expect(getByText("Lobby empty")).toBeTruthy();
  });

  it("keeps the offline list when nobody is online", () => {
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set();

    const { getByText } = render(<ArenaScreen />);
    expect(
      getByText(
        "Nobody is live right now. Go live and you'll be first in the lobby.",
      ),
    ).toBeTruthy();
    expect(getByText("Open to challenges")).toBeTruthy();
    expect(getByText("Alpha")).toBeTruthy();
  });

  it("never tells a live viewer that nobody is live", () => {
    // The viewer is in the lobby themselves, so "nobody" has to mean "nobody
    // else", and the offline rows must not be promised a challenge.
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set();

    const { getByText, queryByText } = render(<ArenaScreen />);
    expect(
      getByText(
        "Nobody else is live right now. Stay live and anyone who goes live shows up here.",
      ),
    ).toBeTruthy();
    expect(queryByText(/Nobody has the app open/)).toBeNull();
    expect(queryByText(/will see it next time/)).toBeNull();
    expect(
      getByText(
        "Not in the app right now. They can take a challenge once they open it and go live.",
      ),
    ).toBeTruthy();
  });

  it("titles the plate as offline until the athlete is live", () => {
    const offline = render(<ArenaScreen />);
    expect(offline.getByText("You're offline")).toBeTruthy();
    expect(offline.queryByText(/Looking for/)).toBeNull();
    expect(offline.getByLabelText("Go live")).toBeTruthy();
    offline.unmount();

    mockIsLive = true;
    const live = render(<ArenaScreen />);
    expect(live.getByText("Looking for a match")).toBeTruthy();
    expect(live.queryByText("You're offline")).toBeNull();
    expect(live.getByLabelText("Go offline")).toBeTruthy();
  });

  it("gives a light haptic when a challenge is sent, and none when locked", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const { getByLabelText, unmount } = render(<ArenaScreen />);
    fireEvent.press(getByLabelText("Challenge Alpha"));
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledWith("light");
    unmount();

    mockImpact.mockClear();
    mockChallenge.isBusy = true;
    const locked = render(<ArenaScreen />);
    fireEvent.press(locked.getByLabelText("Challenge Alpha"));
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockSendChallenge).toHaveBeenCalledTimes(1);
  });

  it("still sends the challenge when the haptic engine fails", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockImpact.mockImplementationOnce(() => Promise.reject(new Error("no")));

    const { getByLabelText } = render(<ArenaScreen />);
    fireEvent.press(getByLabelText("Challenge Alpha"));
    expect(mockSendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("replaces the go-live plate with a cancellable waiting plate", () => {
    mockChallenge.outgoing = {
      challengeId: "ch-1",
      opponentId: "a-1",
      opponentName: "Alpha",
    };
    const { getByText, getByLabelText, queryByLabelText } = render(
      <ArenaScreen />,
    );

    expect(getByText("Waiting for Alpha")).toBeTruthy();
    expect(queryByLabelText("Go live")).toBeNull();
    fireEvent.press(getByLabelText("Cancel challenge"));
    expect(mockCancelOutgoing).toHaveBeenCalled();
  });

  it("does not render its own challenge prompt", () => {
    // The prompt is app-wide (ArenaBootstrap). A second copy here would show
    // two sheets for one challenge.
    mockChallenge.incoming = {
      challengeId: "ch-1",
      challengerId: "a-9",
      challengerName: "Rival",
      challengerElo: 1350,
      challengerWeight: 190,
    };
    const { queryByText, queryByLabelText } = render(<ArenaScreen />);

    expect(queryByText("Rival wants to roll")).toBeNull();
    expect(queryByLabelText("Accept challenge")).toBeNull();
  });

  it("locks row actions while a challenge prompt is up", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockChallenge.incoming = {
      challengeId: "ch-1",
      challengerId: "a-9",
      challengerName: "Rival",
      challengerElo: 1350,
      challengerWeight: 190,
    };
    const { getByLabelText } = render(<ArenaScreen />);

    fireEvent.press(getByLabelText("Challenge Alpha"));
    expect(mockSendChallenge).not.toHaveBeenCalled();
  });

  it("opens the athlete profile from a row", () => {
    mockRoster.competitors = [competitor()];
    const { getByLabelText } = render(<ArenaScreen />);

    fireEvent.press(getByLabelText("Alpha, ELO 1300"));
    expect(mockPush).toHaveBeenCalledWith("/athlete/a-1");
  });

  it("owns no live writer, presence channel or challenge listener", () => {
    // Being live persists across tabs, so all three are mounted once by the
    // app-wide owner. Mounting any of them here would double-write the flag,
    // double-track presence, or double-prompt.
    render(<ArenaScreen />);

    expect(mockUseArenaLive).not.toHaveBeenCalled();
    expect(mockUseLobbyPresence).not.toHaveBeenCalled();
    expect(mockUseArenaChallenge).not.toHaveBeenCalled();
  });

  it("shows the header LIVE signal as static, not as a link to itself", () => {
    mockIsLive = true;
    const { getByTestId, getByLabelText } = render(<ArenaScreen />);

    expect(getByTestId("live-header-signal")).toBeTruthy();
    expect(getByLabelText("You are live in the Arena")).toBeTruthy();
  });

  it("re-reads the roster when an opponent turns out to have left", () => {
    // The roster is a snapshot with no realtime feed on `athletes`, so the
    // stale row has to be corrected by something.
    const { unmount } = render(<ArenaScreen />);

    const handler = mockSetUnavailable.mock.calls[0][0] as (id: string) => void;
    handler("a-1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshQuietly).not.toHaveBeenCalled();
    unmount();
    expect(mockSetUnavailable).toHaveBeenLastCalledWith(null);
  });

  it("re-reads quietly after the stale-challenge sweep (no spinner, no error plate)", () => {
    // `notifyStaleChallengesCancelled` calls the handler with an empty id:
    // a background sweep nobody tapped for.
    render(<ArenaScreen />);

    const handler = mockSetUnavailable.mock.calls[0][0] as (id: string) => void;
    handler("");
    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("Arena screen: a challenge ending without a match (Pending tag)", () => {
  const OUT = { challengeId: "c-1", opponentId: "a-1", opponentName: "Alpha" };
  const IN = {
    challengeId: "c-2",
    challengerId: "a-2",
    challengerName: "Bravo",
    challengerElo: 1250,
    challengerWeight: 180,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockIsLive = true;
    mockRoster.competitors = [competitor({ id: "a-1" })];
    mockLobbyIds = new Set(["a-1"]);
  });

  it("quietly re-reads the roster when my outgoing challenge ends", () => {
    mockChallenge.outgoing = OUT;
    const { rerender } = render(<ArenaScreen />);

    mockChallenge = { ...mockChallenge, outgoing: null };
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("quietly re-reads the roster when an incoming challenge ends", () => {
    mockChallenge.incoming = IN;
    const { rerender } = render(<ArenaScreen />);

    mockChallenge = { ...mockChallenge, incoming: null };
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
  });

  it("does not read when nothing ended (mount, a challenge going out)", () => {
    const { rerender } = render(<ArenaScreen />);
    mockChallenge = { ...mockChallenge, outgoing: OUT };
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).not.toHaveBeenCalled();
  });

  it("skips the read when the challenge ended in a match already mounted", () => {
    mockChallenge.outgoing = OUT;
    const { rerender } = render(<ArenaScreen />);

    mockInMatch = true;
    mockChallenge = { ...mockChallenge, outgoing: null };
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).not.toHaveBeenCalled();
  });

  it("skips the read when the match screen mounts just after the slot clears", () => {
    // enterMatch clears the slot, then pushes the match screen.
    mockChallenge.outgoing = OUT;
    const { rerender } = render(<ArenaScreen />);

    mockChallenge = { ...mockChallenge, outgoing: null };
    rerender(<ArenaScreen />);
    mockInMatch = true;
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).not.toHaveBeenCalled();
  });

  it("reads once when both slots clear together", () => {
    mockChallenge.outgoing = OUT;
    mockChallenge.incoming = IN;
    const { rerender } = render(<ArenaScreen />);

    mockChallenge = { ...mockChallenge, outgoing: null, incoming: null };
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
  });
});

describe("Arena screen: rematch handoff (jits-00fr)", () => {
  function rematchRoster() {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha" }),
      competitor({ id: "a-2", displayName: "Bravo" }),
      competitor({ id: "a-3", displayName: "Charlie" }),
    ];
  }

  function rowOrder(getAllByLabelText: (r: RegExp) => { props: { accessibilityLabel?: string } }[]) {
    return getAllByLabelText(/, ELO \d+/).map((n) =>
      String(n.props.accessibilityLabel).split(",")[0],
    );
  }

  it("pins the rematch opponent to the top of Online now with a tag", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-1", "a-2", "a-3"]);
    mockParams = { rematch: "a-3" };

    const { getAllByLabelText, getByText, queryByTestId } = render(
      <ArenaScreen />,
    );

    expect(rowOrder(getAllByLabelText)).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(getByText("Rematch")).toBeTruthy();
    expect(queryByTestId("arena-rematch-hint")).toBeNull();
  });

  it("never sends a challenge on its own; the row's Challenge does", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-3"]);
    mockParams = { rematch: "a-3" };

    const { getByLabelText, queryByText } = render(<ArenaScreen />);
    expect(mockSendChallenge).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText("Challenge Charlie"));
    expect(mockSendChallenge).toHaveBeenCalledWith("a-3", "Charlie");
    expect(queryByText("Rematch")).toBeTruthy();
  });

  it("ends the pin only once the challenge to them actually went out", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-3"]);
    mockParams = { rematch: "a-3" };

    const { getByLabelText, getByText, queryByText, rerender } = render(
      <ArenaScreen />,
    );
    fireEvent.press(getByLabelText("Challenge Charlie"));
    // The tap alone is not success: the pin holds until the outgoing slot
    // names them.
    expect(getByText("Rematch")).toBeTruthy();

    mockChallenge.outgoing = {
      challengeId: "ch-1",
      opponentId: "a-3",
      opponentName: "Charlie",
    };
    rerender(<ArenaScreen />);
    expect(queryByText("Rematch")).toBeNull();

    // And it does not come back once the challenge resolves.
    mockChallenge.outgoing = null;
    rerender(<ArenaScreen />);
    expect(queryByText("Rematch")).toBeNull();
  });

  it("keeps the pin and tag when the challenge send fails", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-3"]);
    mockParams = { rematch: "a-3" };
    // A refused or failed send leaves no outgoing challenge behind.
    mockSendChallenge.mockResolvedValueOnce(undefined);

    const { getByLabelText, getByText, rerender } = render(<ArenaScreen />);
    fireEvent.press(getByLabelText("Challenge Charlie"));
    rerender(<ArenaScreen />);

    expect(getByText("Rematch")).toBeTruthy();
    expect(getByLabelText("Challenge Charlie")).toBeTruthy();
  });

  it("does not end the pin for a challenge to someone else", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-1", "a-3"]);
    mockParams = { rematch: "a-3" };

    const { getByText, rerender } = render(<ArenaScreen />);
    mockChallenge.outgoing = {
      challengeId: "ch-2",
      opponentId: "a-1",
      opponentName: "Alpha",
    };
    rerender(<ArenaScreen />);
    expect(getByText("Rematch")).toBeTruthy();
  });

  it("marks the pinned row's profile label, not the Challenge label", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-3"]);
    mockParams = { rematch: "a-3" };

    const { getByLabelText } = render(<ArenaScreen />);
    expect(getByLabelText("Charlie, ELO 1300, rematch")).toBeTruthy();
    expect(getByLabelText("Challenge Charlie")).toBeTruthy();
  });

  it("clears the route param as soon as it is read", () => {
    rematchRoster();
    mockParams = { rematch: "a-3" };

    render(<ArenaScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ rematch: undefined });
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it("names an opponent on the roster who is not live", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-1"]);
    mockParams = { rematch: "a-2" };

    const { getByTestId, getByText, queryByText } = render(<ArenaScreen />);
    expect(getByTestId("arena-rematch-hint")).toBeTruthy();
    expect(getByText("Bravo isn't back in the Arena yet. Their Challenge button appears here the moment they are.")).toBeTruthy();
    // Not in the lobby, so not pinned and never challengeable.
    expect(queryByText("Rematch")).toBeNull();
  });

  it("falls back to a neutral name when the opponent is not on the roster", () => {
    rematchRoster();
    mockParams = { rematch: "zz-9" };

    const { getByText } = render(<ArenaScreen />);
    expect(getByText("Your opponent isn't back in the Arena yet. Their Challenge button appears here the moment they are.")).toBeTruthy();
  });

  it("re-reads the roster once when the opponent is live but not listed yet", () => {
    rematchRoster();
    mockLobbyIds = new Set(["zz-9"]);
    mockParams = { rematch: "zz-9" };

    const { rerender } = render(<ArenaScreen />);
    rerender(<ArenaScreen />);
    // A background read: no pull spinner, no error plate over a good roster.
    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("quietly re-reads the roster when someone goes live after it loaded (jits-hlm1.4)", () => {
    jest.useFakeTimers();
    mockRoster.competitors = [competitor({ id: "a-1" })];
    mockLobbyIds = new Set(["a-1"]);
    const { rerender } = render(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockRefreshQuietly).not.toHaveBeenCalled();

    mockLobbyIds = new Set(["a-1", "late-joiner"]);
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
    // No pull spinner for a read nobody asked for.
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("holds the re-read while the Arena is not focused, then catches up", () => {
    jest.useFakeTimers();
    mockIsFocused = false;
    mockRoster.competitors = [competitor({ id: "a-1" })];
    mockLobbyIds = new Set(["a-1", "late-joiner"]);
    const { rerender } = render(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mockRefreshQuietly).not.toHaveBeenCalled();

    mockIsFocused = true;
    rerender(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
  });

  it("never re-reads the roster for the viewer's own lobby entry", () => {
    jest.useFakeTimers();
    mockIsLive = true;
    mockRoster.competitors = [competitor({ id: "a-1" })];
    mockLobbyIds = new Set(["a-1", mockAthlete.id]);
    render(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockRefreshQuietly).not.toHaveBeenCalled();
  });

  it("does not re-read the roster for an opponent who is simply offline", () => {
    rematchRoster();
    mockParams = { rematch: "a-2" };

    render(<ArenaScreen />);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockRefreshQuietly).not.toHaveBeenCalled();
  });

  it("drops the pin when the tab loses focus", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-1", "a-3"]);
    mockParams = { rematch: "a-3" };

    const { getByText, queryByText, rerender } = render(<ArenaScreen />);
    expect(getByText("Rematch")).toBeTruthy();

    // The param was cleared on read, so coming back cannot re-pin.
    expect(mockParams.rematch).toBeUndefined();
    act(() => {
      mockFocusCleanups.forEach((c) => c());
    });
    rerender(<ArenaScreen />);
    expect(queryByText("Rematch")).toBeNull();
  });

  it("clears a param that outlived the read when the tab loses focus (jits-tlk3)", () => {
    // A match exit into an already-mounted Arena (dismissTo) re-applies the
    // params after the read-time clear, so the param can still be there.
    rematchRoster();
    mockLobbyIds = new Set(["a-1", "a-3"]);
    mockParams = { rematch: "a-3" };
    const { rerender } = render(<ArenaScreen />);
    mockParams = { rematch: "a-3" };
    rerender(<ArenaScreen />);
    mockSetParams.mockClear();

    act(() => {
      mockFocusCleanups.forEach((c) => c());
    });
    expect(mockSetParams).toHaveBeenCalledWith({ rematch: undefined });
    expect(mockParams.rematch).toBeUndefined();
    expect(mockRouter.setParams).not.toHaveBeenCalled();
  });

  it("dispatches nothing on blur when there is no param to clear", () => {
    rematchRoster();
    render(<ArenaScreen />);

    act(() => {
      mockFocusCleanups.forEach((c) => c());
    });
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("is inert without the param", () => {
    rematchRoster();
    mockLobbyIds = new Set(["a-1", "a-3"]);

    const { getAllByLabelText, queryByText, queryByTestId } = render(
      <ArenaScreen />,
    );
    expect(rowOrder(getAllByLabelText)).toEqual(["Alpha", "Charlie", "Bravo"]);
    expect(queryByText("Rematch")).toBeNull();
    expect(queryByTestId("arena-rematch-hint")).toBeNull();
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
