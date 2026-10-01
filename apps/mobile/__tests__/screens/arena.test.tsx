/**
 * The Arena screen as a Mat Board (spec arena-live-chip section 6): the
 * control bar, the challenge strip, Closest Match and On The Mat (Just
 * Rolled was removed by the owner, 2026-10-01). The Arena lists online athletes only (spec 14, D1), and every
 * count on it is derived from exactly the rows it renders (D2).
 *
 * The split is the product: "on the mat" comes from Presence and is the only
 * place that can carry a challenge, because an athlete who is not live cannot
 * answer a live prompt. Every state the screen can reach has to be reachable
 * here, none of them a dead end.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";

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
  NotificationBell: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "notification-bell" });
  },
}));

// The header status chip reads app-wide stores this suite mocks; it has its
// own suite (__tests__/components/layout/header-status-chip.test.tsx).
jest.mock("@/components/layout/header-status-chip", () => ({
  HeaderStatusChip: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "header-status-chip" });
  },
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
// Null while auth is still resolving (a push can land before it does).
let mockAuthAthlete: typeof mockAthlete | null = mockAthlete;
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ athlete: mockAuthAthlete, isLoading: false }),
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | undefined> = {};
// Records each focus effect so a test can simulate the tab losing focus.
const mockFocusCleanups: (() => void)[] = [];
// Stable, like expo-router's own (useRouter returns the imperative singleton).
const mockRouter = {
  push: (...a: unknown[]) => mockPush(...a),
  navigate: (...a: unknown[]) => mockNavigate(...a),
  replace: jest.fn(),
  back: jest.fn(),
  // Route params are cleared on THIS route, never through the global
  // router, so this one must stay untouched.
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
let mockLobbyKnown = true;
const mockUseLobbyPresence = jest.fn();
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useLobbyPresence: (...a: unknown[]) => mockUseLobbyPresence(...a),
  useLobbyIds: () => mockLobbyIds,
  useLobbyKnown: () => mockLobbyKnown,
}));

let mockConfirm: { matchId: string; status: string; opponentName: string | null } | null = null;
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useMatchToConfirm: () => mockConfirm,
}));

let mockStakes: Record<string, number> | null = null;
jest.mock("@/lib/match-flow/use-viewer-stakes", () => ({
  useViewerStakes: () => mockStakes,
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// Invites + friends (jr_be spec 016): controllable stand-ins for the realtime
// and RPC-backed hooks the Arena reads.
// eslint-disable-next-line no-var
var mockFriendIds: Set<string> = new Set();
// eslint-disable-next-line no-var
var mockInvitesOn = false;
jest.mock("@/lib/invites/use-friend-ids", () => ({ useFriendIds: () => mockFriendIds }));
jest.mock("@/lib/invites/use-invites-enabled", () => ({ useInvitesEnabled: () => mockInvitesOn }));
// eslint-disable-next-line no-var
var mockLocationRequired = false;
// eslint-disable-next-line no-var
var mockFlagKnown = true;
const mockLoadFlag = jest.fn();
jest.mock("@/lib/arena/match-location-flag", () => ({
  useMatchLocationRequired: () => mockLocationRequired,
  useMatchLocationFlag: () => ({ required: mockLocationRequired, known: mockFlagKnown }),
  loadMatchLocationRequired: () => mockLoadFlag(),
}));
// eslint-disable-next-line no-var
var mockBooked: Record<string, unknown> = {};
const mockUseBookings = jest.fn();
jest.mock("@/lib/invites/use-bookings", () => ({
  useBookings: (args: unknown) => {
    mockUseBookings(args);
    return { bookings: [], locationOff: false, reload: jest.fn(), presence: {}, starting: {}, startErrors: {}, ...mockBooked };
  },
}));
const mockGetPending = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getPendingChallengesForAthlete: (...a: unknown[]) => mockGetPending(...a),
}));
const mockResync = jest.fn();
jest.mock("@/lib/arena/use-pending-challenge-recovery", () => ({
  requestPendingChallengeResync: (...a: unknown[]) => mockResync(...a),
  // The real freshness rule: created within 10 minutes, not expired.
  isFreshPending: (c: { createdAt: string; expiresAt: string }, now: number) =>
    Date.parse(c.expiresAt) > now && now - Date.parse(c.createdAt) <= 10 * 60_000,
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

// Arena nearby (jr_be 016 addendum): the view the nearby hook returns. The
// hook itself (reads, browse readings, cadence) has its own suite.
// eslint-disable-next-line no-var
var mockNearbyView: unknown = { mode: "fallback" };
const mockUseArenaNearby = jest.fn();
jest.mock("@/lib/arena/use-arena-nearby", () => ({
  ...jest.requireActual("@/lib/arena/use-arena-nearby"),
  useArenaNearby: (args: unknown) => {
    mockUseArenaNearby(args);
    return mockNearbyView;
  },
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
  hasRoster: true,
  refresh: mockRefresh,
  refreshQuietly: mockRefreshQuietly,
};
jest.mock("@/lib/arena/use-arena-roster", () => ({
  useArenaRoster: () => mockRoster,
}));

jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const mockToggle = jest.fn();
const mockGuardedGoLive = jest.fn<Promise<boolean | "ignored">, []>(() =>
  Promise.resolve(true),
);
const mockSendChallenge = jest.fn();
const mockCancelOutgoing = jest.fn();
const mockClearCap = jest.fn();
const mockSetUnavailable = jest.fn();
const mockClearUnavailable = jest.fn();
const mockGuardedGoOffline = jest.fn<Promise<boolean | "ignored">, []>(() =>
  Promise.resolve(true),
);
// The challenge hook's "this incoming challenge ended" signal.
const mockEndedListeners = new Set<(id: string) => void>();
function endIncomingChallenge(id: string) {
  for (const l of [...mockEndedListeners]) l(id);
}
const mockReopen = jest.fn();
// Challenges the owner's challenge hook dismissed for good (decision Q3).
const mockDismissed = new Set<string>();
let mockIsLive = false;
let mockInMatch = false;
let mockSwitchPhase: "ready" | "saving" | "cooldown" = "ready";
let mockChallenge = {
  incoming: null as unknown,
  outgoing: null as unknown,
  incomingCount: 0,
  incomingTucked: false,
  isBusy: false,
  capReached: false,
};
const mockPublishNearbyCount = jest.fn();
jest.mock("@/lib/arena/arena-store", () => ({
  publishNearbyOnMatCount: (...a: unknown[]) => mockPublishNearbyCount(...a),
  useArenaState: () => ({ isLive: mockIsLive, isSaving: false, ...mockChallenge }),
  useIsArenaLive: () => mockIsLive,
  useIsInArenaMatch: () => mockInMatch,
  useLiveSwitchPhase: () => mockSwitchPhase,
  arenaActions: {
    toggle: (...a: unknown[]) => mockToggle(...a),
    sendChallenge: (...a: unknown[]) => mockSendChallenge(...a),
    cancelOutgoing: (...a: unknown[]) => mockCancelOutgoing(...a),
    clearCap: (...a: unknown[]) => mockClearCap(...a),
    reopenIncoming: () => mockReopen(),
    goOffline: () => mockGuardedGoOffline(),
    goLive: () => mockGuardedGoLive(),
  },
  setOpponentUnavailableHandler: (...a: unknown[]) => mockSetUnavailable(...a),
  clearOpponentUnavailableHandler: (...a: unknown[]) => mockClearUnavailable(...a),
  subscribeIncomingChallengeEnded: (l: (id: string) => void) => {
    mockEndedListeners.add(l);
    return () => mockEndedListeners.delete(l);
  },
  isIncomingChallengeDismissed: (id: string) => mockDismissed.has(id),
}));

import ArenaScreen from "@/app/(app)/(tabs)/arena/index";
import { publishBellBadge, resetBellStore } from "@/lib/notifications/bell-store";
import { __resetArenaNearbyForTests } from "@/lib/arena/use-arena-nearby";

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
    ...over,
  };
}

beforeEach(() => {
  mockNearbyView = { mode: "fallback" };
  __resetArenaNearbyForTests();
  mockLocationRequired = false;
  mockFlagKnown = true;
  mockBooked = {};
  mockFriendIds = new Set();
  mockInvitesOn = false;
  jest.clearAllMocks();
  mockAuthAthlete = mockAthlete;
  mockDismissed.clear();
  mockParams = {};
  mockFocusCleanups.length = 0;
  mockLobbyIds = new Set();
  mockLobbyKnown = true;
  mockIsFocused = true;
  mockIsLive = false;
  mockInMatch = false;
  mockSwitchPhase = "ready";
  mockRoster = {
    competitors: [],
    challengedIds: new Set(),
    isLoading: false,
    isRefreshing: false,
    hasError: false,
    isFetching: false,
    lastReadOk: true,
    hasRoster: true,
    refresh: mockRefresh,
    refreshQuietly: mockRefreshQuietly,
  };
  mockChallenge = {
    incoming: null,
    outgoing: null,
    incomingCount: 0,
    incomingTucked: false,
    isBusy: false,
    capReached: false,
  };
  mockConfirm = null;
  mockStakes = null;
  mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [], outgoing: [] } });
});

afterEach(() => {
  jest.useRealTimers();
});

/** The ROLL button on an On The Mat row (the Closest Match CTA shares its label). */
function rowButton(
  r: { getByTestId: (id: string) => unknown },
  id: string,
  label: string,
) {
  return within(r.getByTestId(`arena-mat-row-${id}`) as never).getByLabelText(label);
}

function isDisabled(node: { props: { accessibilityState?: { disabled?: boolean } } }) {
  return node.props.accessibilityState?.disabled === true;
}

/** Distinct Signal Red buttons on screen (composite and host share props). */
function redCount(r: { UNSAFE_root: { findAll: (p: (n: { props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] } }) {
  const reds = r.UNSAFE_root.findAll(
    (n) =>
      typeof n.props.className === "string" &&
      /(^|\s)bg-cta(\s|$)/.test(n.props.className as string) &&
      n.props.accessibilityRole === "button",
  );
  return new Set(reds.map((n) => n.props.accessibilityLabel)).size;
}

const INCOMING = {
  challengeId: "ch-1",
  challengerId: "a-9",
  challengerName: "Rival",
  challengerElo: 1350,
  challengerWeight: 190,
  createdAt: null,
  expiresAt: null,
};

describe("Arena screen", () => {
  it("shows a skeleton, never a blank screen, while the roster loads", () => {
    mockRoster.isLoading = true;
    const { getByLabelText, queryByTestId } = render(<ArenaScreen />);

    expect(getByLabelText("Loading the Arena")).toBeTruthy();
    expect(queryByTestId("arena-on-the-mat")).toBeNull();
    // The control bar is not roster data: it is there from the first frame.
    expect(queryByTestId("arena-control-bar")).toBeTruthy();
  });

  it("splits the roster on presence: only athletes on the mat carry a challenge (F13)", () => {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha" }),
      competitor({ id: "a-2", displayName: "Bravo" }),
    ];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);

    expect(r.getByTestId("arena-mat-row-a-1")).toBeTruthy();
    expect(r.queryByTestId("arena-mat-row-a-2")).toBeNull();
    expect(rowButton(r, "a-1", "Challenge Alpha")).toBeTruthy();
    expect(r.queryByLabelText("Challenge Bravo")).toBeNull();
    // Bravo is not on the mat, so not on the Arena at all (D1).
    expect(r.queryByText("Bravo")).toBeNull();
    expect(r.queryByText(/off the mat/i)).toBeNull();
  });

  it("challenges by id and name when a row's ROLL is tapped", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    fireEvent.press(rowButton(r, "a-1", "Challenge Alpha"));

    expect(mockSendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("offers a working way to go live from a row instead of a dead button", () => {
    mockIsLive = false;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    expect(r.queryByLabelText("Challenge Alpha")).toBeNull();

    fireEvent.press(rowButton(r, "a-1", "Go live to challenge Alpha"));
    // The guarded, non-reversing go-live, never a toggle of the intent.
    expect(mockGuardedGoLive).toHaveBeenCalled();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it("says so when a row's go-live fails, and stays silent when it was ignored", async () => {
    mockIsLive = false;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    const { toast } = jest.requireMock("@/components/ui/toast") as {
      toast: { error: jest.Mock; info: jest.Mock };
    };
    toast.info.mockClear();

    const { getByLabelText } = render(<ArenaScreen />);
    mockGuardedGoLive.mockImplementationOnce(() => Promise.resolve("ignored"));
    await act(async () => {
      fireEvent.press(getByLabelText("Go live to challenge Alpha"));
    });
    expect(toast.info).not.toHaveBeenCalled();

    mockGuardedGoLive.mockImplementationOnce(() => Promise.resolve(false));
    await act(async () => {
      fireEvent.press(getByLabelText("Go live to challenge Alpha"));
    });
    expect(toast.info).toHaveBeenCalledWith("Couldn't take you live. Try again.");

    // A rejected go-live is a failure too.
    toast.info.mockClear();
    mockGuardedGoLive.mockImplementationOnce(() => Promise.reject(new Error("x")));
    await act(async () => {
      fireEvent.press(getByLabelText("Go live to challenge Alpha"));
    });
    expect(toast.info).toHaveBeenCalledWith("Couldn't take you live. Try again.");
    // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("every on-mat row offers Roll: there is no casual-only state (every match is ranked)", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    expect(r.queryByText(/casual/i)).toBeNull();
    // The mat row's Roll and the Closest Match card both offer the challenge.
    expect(r.getAllByLabelText("Challenge Alpha").length).toBe(2);
    expect(r.getByTestId("arena-closest-cta")).toBeTruthy();
  });

  it("shows an already-challenged athlete as pending", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockRoster.challengedIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    expect(r.getByText("Pending")).toBeTruthy();
    // Nowhere on screen: not the row, and not the Closest Match card either.
    expect(r.queryByLabelText("Challenge Alpha")).toBeNull();
    expect(r.queryByTestId("arena-closest-cta")).toBeNull();
    expect(r.getByText("No opponent free on the mat")).toBeTruthy();
  });

  it("never suggests an athlete a challenge is already pending with; the next one instead", () => {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha", eloDiff: 5 }),
      competitor({ id: "a-2", displayName: "Bravo", eloDiff: 40 }),
    ];
    mockLobbyIds = new Set(["a-1", "a-2"]);
    // Pending in either direction (a web profile challenge, an older tuck).
    mockRoster.challengedIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    expect(r.getByTestId("arena-closest-cta").props.accessibilityLabel).toBe("Challenge Bravo");
    expect(r.queryByLabelText("Challenge Alpha")).toBeNull();
    fireEvent.press(r.getByTestId("arena-closest-cta"));
    expect(mockSendChallenge).toHaveBeenCalledWith("a-2", "Bravo");
    expect(mockSendChallenge).not.toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("never suggests the athlete my outgoing challenge is waiting on", () => {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha", eloDiff: 5 }),
      competitor({ id: "a-2", displayName: "Bravo", eloDiff: 40 }),
    ];
    mockLobbyIds = new Set(["a-1", "a-2"]);
    mockChallenge.outgoing = { challengeId: "o-1", opponentId: "a-1", opponentName: "Alpha" };

    const r = render(<ArenaScreen />);
    // One state per person: Alpha's row reads SENT, and no second
    // `Challenge Alpha` button exists for the harness to match.
    expect(r.queryByLabelText("Challenge Alpha")).toBeNull();
    expect(r.getByTestId("arena-closest-cta").props.accessibilityLabel).toBe("Challenge Bravo");
  });

  it("a lost lobby channel keeps the last On The Mat split, never 'Nobody else on the mat'", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    const r = render(<ArenaScreen />);
    expect(r.getByTestId("arena-on-the-mat")).toHaveTextContent(/Alpha/);

    // The channel drops: presence is cleared and marked unknown.
    mockLobbyKnown = false;
    mockLobbyIds = new Set();
    r.rerender(<ArenaScreen />);
    expect(r.getByTestId("arena-on-the-mat")).toHaveTextContent(/Alpha/);
    expect(r.queryByText("Nobody else on the mat")).toBeNull();

    // Back and synced with an empty mat: now it is true.
    mockLobbyKnown = true;
    r.rerender(<ArenaScreen />);
    expect(r.queryByTestId("arena-on-the-mat")).toBeNull();
    expect(r.getByText("Nobody else on the mat")).toBeTruthy();
  });

  it("while the lobby is not known yet, the empty mat reads Reconnecting, not Nobody", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyKnown = false;
    mockLobbyIds = new Set();
    const r = render(<ArenaScreen />);
    expect(r.getByText("Reconnecting to the mat")).toBeTruthy();
    expect(r.queryByText("Nobody else on the mat")).toBeNull();
  });

  it("says so when the Closest Match go-live fails, and stays silent when it was ignored", async () => {
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    const { toast } = jest.requireMock("@/components/ui/toast") as {
      toast: { error: jest.Mock; info: jest.Mock };
    };
    toast.info.mockClear();
    const r = render(<ArenaScreen />);

    mockGuardedGoLive.mockImplementationOnce(() => Promise.resolve("ignored"));
    await act(async () => {
      fireEvent.press(r.getByTestId("arena-closest-cta"));
    });
    expect(toast.info).not.toHaveBeenCalled();

    mockGuardedGoLive.mockImplementationOnce(() => Promise.resolve(false));
    await act(async () => {
      fireEvent.press(r.getByTestId("arena-closest-cta"));
    });
    expect(toast.info).toHaveBeenCalledWith("Couldn't take you live. Try again.");

    toast.info.mockClear();
    mockGuardedGoLive.mockImplementationOnce(() => Promise.reject(new Error("x")));
    await act(async () => {
      fireEvent.press(r.getByTestId("arena-closest-cta"));
    });
    expect(toast.info).toHaveBeenCalledWith("Couldn't take you live. Try again.");
    // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("states the 3-challenge cap and stops offering challenges", () => {
    mockIsLive = true;
    mockChallenge.capReached = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);

    expect(r.getByText("You have 3 challenges out")).toBeTruthy();
    expect(r.getByText("3 out")).toBeTruthy();
    expect(within(r.getByTestId("arena-mat-row-a-1")).queryByLabelText("Challenge Alpha")).toBeNull();
    expect(isDisabled(r.getByTestId("arena-closest-cta"))).toBe(true);
  });

  it("offers a retry inline when the roster read failed", () => {
    mockIsLive = true;
    mockRoster.hasError = true;
    const { getByText, getByLabelText, queryByTestId } = render(<ArenaScreen />);

    expect(getByText(/couldn't reach the lobby/i)).toBeTruthy();
    // A failed read is not an empty mat.
    expect(queryByTestId("arena-closest-empty")).toBeNull();
    expect(queryByTestId("arena-closest-cta")).toBeNull();
    fireEvent.press(getByLabelText("Retry"));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("offline with a failed roster read: still a red GO LIVE TO ROLL, no empty-mat claim (AC-A3)", () => {
    mockRoster.hasError = true;
    const r = render(<ArenaScreen />);
    expect(r.getByText(/couldn't reach the lobby/i)).toBeTruthy();
    expect(r.queryByText("Nobody else on the mat")).toBeNull();
    const cta = r.getByTestId("arena-closest-cta");
    expect(cta.props.accessibilityLabel).toBe("Go live to roll");
    expect(cta.props.className).toMatch(/bg-cta/);
    expect(redCount(r)).toBe(1);
    fireEvent.press(cta);
    expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
  });

  it("live, shows an empty Closest Match with no CTA when nobody else is on the mat", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set();

    const { getByTestId, queryByTestId, queryByText } = render(<ArenaScreen />);
    expect(getByTestId("arena-closest-empty")).toBeTruthy();
    expect(queryByTestId("arena-closest-cta")).toBeNull();
    // The roster athlete who is not live is listed nowhere (D1).
    expect(queryByText("Alpha")).toBeNull();
    expect(getByTestId("arena-mat-counts").props.children).toBe("NOBODY ELSE ON MAT");
  });

  it("removes the old prose plates (AC-A7)", () => {
    mockRoster.competitors = [competitor({ id: "a-1" }), competitor({ id: "a-2", displayName: "Bravo" })];
    mockLobbyIds = new Set(["a-1"]);
    const { queryByText, queryByTestId } = render(<ArenaScreen />);
    expect(queryByText("You're offline")).toBeNull();
    expect(queryByText("Looking for a match")).toBeNull();
    expect(queryByText("Online now")).toBeNull();
    expect(queryByText("Open to challenges")).toBeNull();
    expect(queryByText(/Not in the app right now/)).toBeNull();
    expect(queryByText(/Nobody (else )?is live right now/)).toBeNull();
    expect(queryByTestId("arena-waiting-plate")).toBeNull();
  });

  it("clears the tab bar without the shared container's 96pt pad (AC-A7)", () => {
    mockRoster.competitors = [competitor()];
    const { UNSAFE_root } = render(<ArenaScreen />);
    const { ScrollView } = require("react-native");
    const scroll = UNSAFE_root.findByType(ScrollView);
    const styles = [scroll.props.contentContainerStyle].flat(3);
    const pad = Object.assign({}, ...styles).paddingBottom;
    expect(pad).toBe(24);
  });

  describe("control bar (AC-A1)", () => {
    it("offers Go live while offline and states where the athlete is", () => {
      const { getByLabelText, queryByLabelText } = render(<ArenaScreen />);
      const goLive = getByLabelText("Go live");
      expect(isDisabled(goLive)).toBe(false);
      expect(getByLabelText("You are offline").props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      );
      // Exactly one live action on screen: the harness taps it by label.
      expect(queryByLabelText("Go offline")).toBeNull();
      fireEvent.press(goLive);
      // The guarded, non-reversing go-live: never the reversing toggle.
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
      expect(mockGuardedGoOffline).not.toHaveBeenCalled();
      expect(mockToggle).not.toHaveBeenCalled();
    });

    it("offers Go offline while live", () => {
      mockIsLive = true;
      const { getByLabelText, queryByLabelText } = render(<ArenaScreen />);
      expect(queryByLabelText("Go live")).toBeNull();
      expect(getByLabelText("You are live")).toBeTruthy();
      fireEvent.press(getByLabelText("Go offline"));
      expect(mockGuardedGoOffline).toHaveBeenCalledTimes(1);
      expect(mockGuardedGoLive).not.toHaveBeenCalled();
      expect(mockToggle).not.toHaveBeenCalled();
    });

    it("a tap on a segment rendered from a stale live state never flips the other way", () => {
      // The LIVE segment is always go-live and OFFLINE always go-offline,
      // whatever `isLive` the render held: a restore that commits between
      // paint and press cannot turn "Go live" into a go-offline.
      const offline = render(<ArenaScreen />);
      const goLive = offline.getByLabelText("Go live");
      // A restore commits live after this render painted, before the tap.
      mockIsLive = true;
      fireEvent.press(goLive);
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
      expect(mockGuardedGoOffline).not.toHaveBeenCalled();
      offline.unmount();

      mockIsLive = true;
      const live = render(<ArenaScreen />);
      const goOffline = live.getByLabelText("Go offline");
      mockIsLive = false;
      fireEvent.press(goOffline);
      expect(mockGuardedGoOffline).toHaveBeenCalledTimes(1);
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
      expect(mockToggle).not.toHaveBeenCalled();
    });

    it("says so when a segment's go-offline fails, and stays silent when it was ignored", async () => {
      mockIsLive = true;
      const { toast } = jest.requireMock("@/components/ui/toast") as {
        toast: { error: jest.Mock; info: jest.Mock };
      };
      const r = render(<ArenaScreen />);
      mockGuardedGoOffline.mockImplementationOnce(() => Promise.resolve("ignored"));
      await act(async () => {
        fireEvent.press(r.getByLabelText("Go offline"));
      });
      expect(toast.info).not.toHaveBeenCalled();
      mockGuardedGoOffline.mockImplementationOnce(() => Promise.resolve(false));
      await act(async () => {
        fireEvent.press(r.getByLabelText("Go offline"));
      });
      expect(toast.info).toHaveBeenCalledWith(
        "You're offline here, but we couldn't update your status. We'll retry.",
      );
      // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("mirrors the store: flipping live re-renders the selected segment", () => {
      const r = render(<ArenaScreen />);
      expect(r.getByLabelText("You are offline")).toBeTruthy();
      mockIsLive = true;
      r.rerender(<ArenaScreen />);
      expect(r.getByLabelText("You are live")).toBeTruthy();
      expect(r.queryByLabelText("You are offline")).toBeNull();
    });

    it("disables the switch while locked (saving or cooldown), keeping its label", () => {
      mockSwitchPhase = "cooldown";
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set(["a-1"]);
      const offline = render(<ArenaScreen />);
      const seg = offline.getByLabelText("Go live");
      expect(isDisabled(seg)).toBe(true);
      fireEvent.press(seg);
      // Every go-live on the surface is the same switch.
      fireEvent.press(rowButton(offline, "a-1", "Go live to challenge Alpha"));
      fireEvent.press(offline.getByTestId("arena-closest-cta"));
      expect(mockToggle).not.toHaveBeenCalled();
      expect(mockGuardedGoLive).not.toHaveBeenCalled();
      expect(mockGuardedGoOffline).not.toHaveBeenCalled();
      offline.unmount();

      // A challenge is not the live switch: the cooldown must not hold it.
      mockIsLive = true;
      const live = render(<ArenaScreen />);
      expect(isDisabled(live.getByLabelText("Go offline"))).toBe(true);
      fireEvent.press(rowButton(live, "a-1", "Challenge Alpha"));
      expect(mockSendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
    });

    it("shows ON MAT and IN BAND counts from the rows, and CONNECTING when the lobby is unknown", () => {
      mockRoster.competitors = [
        competitor({ id: "a-1", displayName: "Alpha", currentElo: 1300, eloDiff: 100 }),
        competitor({ id: "a-2", displayName: "Bravo", currentElo: 1301, eloDiff: 101 }),
        competitor({ id: "a-3", displayName: "Charlie", currentElo: 1150, eloDiff: -50 }),
      ];
      mockLobbyIds = new Set(["a-1", "a-2", "a-3"]);
      const r = render(<ArenaScreen />);
      // In band is inclusive at the displayed +100 gap; +101 is out.
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("3 ON MAT · 2 IN BAND");
      mockLobbyKnown = false;
      r.rerender(<ArenaScreen />);
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("CONNECTING");
    });
  });

  describe("every displayed count is derived from its rows (spec 14, D2)", () => {
    /**
     * The invariant: whatever the bar says, it says about exactly the rows
     * On The Mat renders. A number with no rows behind it (a stray presence
     * key, self, a roster not loaded yet) fails here.
     */
    function assertCountsMatchRows(r: ReturnType<typeof render>) {
      const rows = r.queryAllByTestId(/^arena-mat-row-/);
      const text = r.getByTestId("arena-mat-counts").props.children as string;
      if (text === "CONNECTING") return { rows: rows.length, onMat: null };
      if (text === "NOBODY ELSE ON MAT") {
        expect(rows).toHaveLength(0);
        return { rows: 0, onMat: 0 };
      }
      const m = /^(\d+) ON MAT · (\d+) IN BAND$/.exec(text);
      expect(m).not.toBeNull();
      const onMat = Number(m![1]);
      const inBand = Number(m![2]);
      expect(onMat).toBeGreaterThan(0);
      expect(onMat).toBe(rows.length);
      // The section's own count reads the same rows.
      const section = r.getByTestId("arena-on-the-mat");
      expect(within(section).getByText(String(onMat))).toBeTruthy();
      // IN BAND uses the gap each row displays.
      const shownGaps = mockRoster.competitors
        .filter((c) => rows.some((row) => row.props.testID === `arena-mat-row-${(c as { id: string }).id}`))
        .map((c) => Math.abs((c as { eloDiff: number }).eloDiff));
      expect(inBand).toBe(shownGaps.filter((g) => g <= 100).length);
      return { rows: rows.length, onMat };
    }

    it("never counts stray presence keys or self", () => {
      mockIsLive = true;
      mockRoster.competitors = [
        competitor({ id: "a-1", displayName: "Alpha", eloDiff: 40 }),
        competitor({ id: "a-2", displayName: "Bravo", eloDiff: 250 }),
        // Not present: no row, no count.
        competitor({ id: "a-3", displayName: "Charlie", eloDiff: 10 }),
      ];
      // Self, and three keys no roster athlete stands behind.
      mockLobbyIds = new Set(["me-1", "a-1", "a-2", "ghost-1", "ghost-2", "ghost-3"]);
      const r = render(<ArenaScreen />);
      expect(assertCountsMatchRows(r)).toEqual({ rows: 2, onMat: 2 });
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("2 ON MAT · 1 IN BAND");
    });

    it("presence with nobody on the roster claims nobody", () => {
      mockIsLive = true;
      mockRoster.competitors = [];
      mockLobbyIds = new Set(["me-1", "ghost-1", "ghost-2"]);
      const r = render(<ArenaScreen />);
      expect(assertCountsMatchRows(r)).toEqual({ rows: 0, onMat: 0 });
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("NOBODY ELSE ON MAT");
    });

    it("reads CONNECTING, never a number, while the roster has not loaded", () => {
      mockRoster.isLoading = true;
      mockRoster.hasRoster = false;
      mockLobbyIds = new Set(["a-1", "a-2", "ghost-1"]);
      const r = render(<ArenaScreen />);
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("CONNECTING");
      expect(r.queryAllByTestId(/^arena-mat-row-/)).toHaveLength(0);
    });

    it("reads CONNECTING after a failed first read, with presence but no roster", () => {
      mockRoster.hasError = true;
      mockRoster.lastReadOk = false;
      mockRoster.hasRoster = false;
      mockLobbyIds = new Set(["a-1", "ghost-1"]);
      const r = render(<ArenaScreen />);
      expect(r.getByTestId("arena-mat-counts").props.children).toBe("CONNECTING");
      expect(assertCountsMatchRows(r)).toEqual({ rows: 0, onMat: null });
    });

    it("follows the rows as the lobby changes", () => {
      mockIsLive = true;
      mockRoster.competitors = [
        competitor({ id: "a-1", displayName: "Alpha", eloDiff: 0 }),
        competitor({ id: "a-2", displayName: "Bravo", eloDiff: -100 }),
      ];
      mockLobbyIds = new Set(["a-1"]);
      const r = render(<ArenaScreen />);
      expect(assertCountsMatchRows(r)).toEqual({ rows: 1, onMat: 1 });
      mockLobbyIds = new Set(["a-1", "a-2", "ghost"]);
      r.rerender(<ArenaScreen />);
      expect(assertCountsMatchRows(r)).toEqual({ rows: 2, onMat: 2 });
      mockLobbyIds = new Set(["ghost"]);
      r.rerender(<ArenaScreen />);
      expect(assertCountsMatchRows(r)).toEqual({ rows: 0, onMat: 0 });
    });
  });

  describe("Closest Match (AC-A3)", () => {
    function mat() {
      mockRoster.competitors = [
        competitor({ id: "far", displayName: "Far", currentElo: 1500, eloDiff: 300 }),
        competitor({ id: "near", displayName: "Near", currentElo: 1190, eloDiff: -10 }),
        competitor({ id: "mid", displayName: "Mid", currentElo: 1250, eloDiff: 50 }),
      ];
      mockLobbyIds = new Set(["far", "near", "mid"]);
    }

    it("suggests the smallest |ΔELO| with its stakes and one red CHALLENGE", () => {
      mockIsLive = true;
      mat();
      mockStakes = { challenger_win: 15, challenger_loss: -15, challenger_draw: 0 };
      const r = render(<ArenaScreen />);
      const cta = r.getByTestId("arena-closest-cta");
      expect(cta.props.accessibilityLabel).toBe("Challenge Near");
      expect(cta.props.className).toMatch(/bg-cta/);
      expect(r.getByTestId("arena-closest-stakes").props.children).toBe("Win +15 · Loss −15");
      expect(redCount(r)).toBe(1);

      fireEvent.press(cta);
      expect(mockSendChallenge).toHaveBeenCalledWith("near", "Near");
      expect(mockImpact).toHaveBeenCalledWith("light");
    });

    it("offline, the CTA is a red GO LIVE TO ROLL", () => {
      mat();
      const r = render(<ArenaScreen />);
      const cta = r.getByTestId("arena-closest-cta");
      expect(cta.props.accessibilityLabel).toBe("Go live to roll");
      expect(cta.props.className).toMatch(/bg-cta/);
      expect(redCount(r)).toBe(1);
      fireEvent.press(cta);
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
      expect(mockSendChallenge).not.toHaveBeenCalled();
    });

    // AC-A3's offline red GO LIVE TO ROLL; spec 6.3's "empty lobby: no red
    // CTA" is read as the LIVE empty lobby (pending product confirmation).
    it("offline on an empty mat: the empty state still carries a red GO LIVE TO ROLL", () => {
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set();
      const r = render(<ArenaScreen />);
      expect(r.getByText("Nobody else on the mat")).toBeTruthy();
      const cta = r.getByTestId("arena-closest-cta");
      expect(cta.props.accessibilityLabel).toBe("Go live to roll");
      expect(cta.props.className).toMatch(/bg-cta/);
      expect(redCount(r)).toBe(1);
      fireEvent.press(cta);
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
    });

    it("offline with only pending athletes on the mat: still a red GO LIVE TO ROLL", () => {
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set(["a-1"]);
      mockRoster.challengedIds = new Set(["a-1"]);
      const r = render(<ArenaScreen />);
      expect(r.getByText("No opponent free on the mat")).toBeTruthy();
      expect(r.getByTestId("arena-closest-cta").props.accessibilityLabel).toBe("Go live to roll");
      expect(redCount(r)).toBe(1);
    });

    it("at the 3-challenge cap the disabled CHALLENGE is outline: no dead red button", () => {
      mockIsLive = true;
      mat();
      mockChallenge.capReached = true;
      const r = render(<ArenaScreen />);
      const cta = r.getByTestId("arena-closest-cta");
      expect(isDisabled(cta)).toBe(true);
      expect(cta.props.className).not.toMatch(/bg-cta/);
      expect(redCount(r)).toBe(0);
    });

    it("demotes to outline with an incoming or a waiting challenge (red means someone wants you)", () => {
      mockIsLive = true;
      mat();
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 1;
      const a = render(<ArenaScreen />);
      expect(a.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);
      expect(redCount(a)).toBe(0);
      a.unmount();

      mockChallenge.incoming = null;
      mockChallenge.outgoing = { challengeId: "o-1", opponentId: "far", opponentName: "Far" };
      const b = render(<ArenaScreen />);
      expect(b.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);
      expect(redCount(b)).toBe(0);
    });

    it("tells the card's Challenge apart from the same athlete's ROLL row", () => {
      mockIsLive = true;
      mat();
      const r = render(<ArenaScreen />);
      // Harness contract: both read `Challenge Near`, the card first.
      const both = r.getAllByLabelText("Challenge Near");
      expect(both).toHaveLength(2);
      expect(both[0].props.testID).toBe("arena-closest-cta");
      expect(both[0].props.accessibilityHint).toBe("Closest match");
      expect(both[1].props.accessibilityHint).toBeUndefined();
    });
  });

  describe("On The Mat (AC-A4)", () => {
    it("sorts rows by |ΔELO| ascending with a signed gap", () => {
      mockIsLive = true;
      mockRoster.competitors = [
        competitor({ id: "far", displayName: "Far", eloDiff: 300 }),
        competitor({ id: "near", displayName: "Near", eloDiff: -10 }),
        competitor({ id: "mid", displayName: "Mid", eloDiff: 50 }),
      ];
      mockLobbyIds = new Set(["far", "near", "mid"]);
      const r = render(<ArenaScreen />);
      const order = r
        .getAllByTestId(/^arena-mat-row-/)
        .map((n) => String(n.props.testID).replace("arena-mat-row-", ""));
      expect(order).toEqual(["near", "mid", "far"]);
      expect(r.getByTestId("arena-mat-gap-near").props.children).toBe("−10");
      expect(r.getByTestId("arena-mat-gap-mid").props.children).toBe("+50");
    });

    it("friends sort first with a FRIEND badge; the closest card stays strictly closest (jr_be spec 016)", () => {
      mockIsLive = true;
      mockFriendIds = new Set(["far"]);
      mockRoster.competitors = [
        competitor({ id: "far", displayName: "Far", eloDiff: 300 }),
        competitor({ id: "near", displayName: "Near", eloDiff: -10 }),
        competitor({ id: "mid", displayName: "Mid", eloDiff: 50 }),
      ];
      mockLobbyIds = new Set(["far", "near", "mid"]);
      const r = render(<ArenaScreen />);
      const order = r
        .getAllByTestId(/^arena-mat-row-/)
        .map((n) => String(n.props.testID).replace("arena-mat-row-", ""));
      expect(order).toEqual(["far", "near", "mid"]);
      expect(r.getByTestId("arena-friend-badge-far")).toBeTruthy();
      expect(r.queryByTestId("arena-friend-badge-near")).toBeNull();
      expect(r.getAllByLabelText("Challenge Near")[0].props.testID).toBe("arena-closest-cta");
      // The section label names the order it shows.
      expect(r.getByText("On the mat · friends first")).toBeTruthy();
      expect(r.queryByText("On the mat · closest first")).toBeNull();
    });

    it("the invite actions are pinned at the bottom, only while invites are enabled", () => {
      mockIsLive = true;
      mockRoster.competitors = [];
      mockLobbyIds = new Set();
      const off = render(<ArenaScreen />);
      expect(off.queryByLabelText("Invite a training partner")).toBeNull();
      off.unmount();
      mockInvitesOn = true;
      const on = render(<ArenaScreen />);
      expect(on.getByText("Invite a training partner")).toBeTruthy();
      on.unmount();
      // Shown with athletes on the mat too, and after the On The Mat list.
      mockRoster.competitors = [competitor({ id: "near", displayName: "Near", eloDiff: -10 })];
      mockLobbyIds = new Set(["near"]);
      const full = render(<ArenaScreen />);
      const invite = full.getByTestId("arena-invite-actions");
      expect(within(invite).getByText("Invite a training partner")).toBeTruthy();
      expect(within(invite).getByText("Got a challenge code?")).toBeTruthy();
      const ids = full
        .UNSAFE_root.findAll((n: { props: { testID?: unknown } }) => typeof n.props.testID === "string")
        .map((n: { props: { testID?: unknown } }) => n.props.testID as string);
      expect(ids.lastIndexOf("arena-invite-actions")).toBeGreaterThan(ids.indexOf("arena-on-the-mat"));
      // Pinned: the actions live outside the scroll view, so they never
      // scroll off screen.
      const insideScroll = (start: unknown) => {
        let node = start as { type: unknown; parent: unknown } | null;
        while (node) {
          if (node.type === ScrollView) return true;
          node = node.parent as { type: unknown; parent: unknown } | null;
        }
        return false;
      };
      expect(insideScroll(full.getByTestId("arena-on-the-mat"))).toBe(true);
      expect(insideScroll(invite)).toBe(false);
    });

    it("the invite actions stay hidden while the roster loads and on a roster error", () => {
      mockInvitesOn = true;
      mockIsLive = true;
      mockRoster.isLoading = true;
      const loading = render(<ArenaScreen />);
      expect(loading.queryByTestId("arena-invite-actions")).toBeNull();
      expect(loading.queryByText("Invite a training partner")).toBeNull();
      loading.unmount();
      mockRoster.isLoading = false;
      mockRoster.hasError = true;
      const failed = render(<ArenaScreen />);
      expect(failed.queryByTestId("arena-invite-actions")).toBeNull();
      expect(failed.queryByText("Got a challenge code?")).toBeNull();
      failed.unmount();
      // Back to a good read: the footer returns.
      mockRoster.hasError = false;
      const ok = render(<ArenaScreen />);
      expect(ok.getByTestId("arena-invite-actions")).toBeTruthy();
    });

    it("the signed gap is data: ink, never red or green (spec 3)", () => {
      mockIsLive = true;
      mockRoster.competitors = [
        competitor({ id: "near", displayName: "Near", eloDiff: -10 }),
        competitor({ id: "mid", displayName: "Mid", eloDiff: 50 }),
      ];
      mockLobbyIds = new Set(["near", "mid"]);
      const r = render(<ArenaScreen />);
      for (const id of ["near", "mid"]) {
        const cls = String(r.getByTestId(`arena-mat-gap-${id}`).props.className);
        expect(cls).toMatch(/text-ink-2/);
        expect(cls).not.toMatch(/text-negative|text-positive|text-cta/);
      }
    });

    it("shows SENT m:ss instead of ROLL on the row I challenged", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-09-28T12:01:48Z"));
      mockIsLive = true;
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set(["a-1"]);
      mockChallenge.outgoing = {
        challengeId: "o-1",
        opponentId: "a-1",
        opponentName: "Alpha",
        createdAt: "2026-09-28T12:00:00Z",
        expiresAt: "2026-10-05T12:00:00Z",
      };
      const r = render(<ArenaScreen />);
      expect(r.getByTestId("arena-mat-sent-a-1").props.children).toBe("Sent 8:12");
      expect(within(r.getByTestId("arena-mat-row-a-1")).queryByLabelText("Challenge Alpha")).toBeNull();
      // Ticks once a second.
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(r.getByTestId("arena-mat-sent-a-1").props.children).toBe("Sent 8:11");
    });
  });

  describe("challenge strip (AC-A2)", () => {
    it("is absent when nothing is in flight", () => {
      const { queryByTestId } = render(<ArenaScreen />);
      expect(queryByTestId(/^arena-strip-/)).toBeNull();
    });

    it("waiting: keeps the harness text and a cancellable challenge", () => {
      mockIsLive = true;
      mockChallenge.outgoing = { challengeId: "ch-1", opponentId: "a-1", opponentName: "Alpha" };
      const { getByLabelText, getByTestId } = render(<ArenaScreen />);

      expect(getByTestId("arena-strip-waiting")).toBeTruthy();
      // The StaticText the match-loop harness waits for.
      expect(getByLabelText("Waiting for Alpha")).toBeTruthy();
      fireEvent.press(getByLabelText("Cancel challenge"));
      expect(mockCancelOutgoing).toHaveBeenCalled();
    });

    it("incoming: a red rail, the challenger and OPEN, which reopens the prompt", () => {
      mockIsLive = true;
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 1;
      mockChallenge.incomingTucked = true;
      const { getByTestId, getByText, getByLabelText } = render(<ArenaScreen />);
      expect(getByTestId("arena-strip-incoming").props.className).toMatch(/border-l-cta/);
      expect(getByText("Rival wants to roll")).toBeTruthy();
      fireEvent.press(getByLabelText("Open challenge"));
      expect(mockReopen).toHaveBeenCalledTimes(1);
    });

    it("incoming tucked with my own challenge out: the waiting strip and Cancel challenge stay reachable", () => {
      mockIsLive = true;
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set(["a-1"]);
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 1;
      mockChallenge.incomingTucked = true;
      mockChallenge.outgoing = { challengeId: "o-1", opponentId: "a-1", opponentName: "Alpha" };
      const r = render(<ArenaScreen />);
      // The tucked incoming leads (red rail), my challenge is under it.
      expect(r.getByTestId("arena-strip-incoming").props.className).toMatch(/border-l-cta/);
      expect(r.getByTestId("arena-strip-waiting")).toBeTruthy();
      expect(r.getByLabelText("Waiting for Alpha")).toBeTruthy();
      fireEvent.press(r.getByLabelText("Cancel challenge"));
      expect(mockCancelOutgoing).toHaveBeenCalled();
      // Both are outline actions: no red CTA is added.
      expect(redCount(r)).toBe(0);
    });

    it("incoming, several: keeps the first challenger's name and counts the rest after the countdown", () => {
      mockIsLive = true;
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 3;
      const { getByText, getByTestId, queryByText } = render(<ArenaScreen />);
      expect(getByText("Rival wants to roll")).toBeTruthy();
      expect(queryByText("3 want to roll")).toBeNull();
      const tail = getByTestId("arena-strip-tail");
      expect(tail.props.children).toBe(" · +2");
      expect(tail.props.accessibilityLabel).toBe("plus 2 more");
    });

    it("incoming, one: no count tail", () => {
      mockIsLive = true;
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 1;
      const { queryByTestId } = render(<ArenaScreen />);
      expect(queryByTestId("arena-strip-tail")).toBeNull();
    });

    it("result to confirm: Confirm opens the match, and live state is untouched", () => {
      mockIsLive = true;
      mockConfirm = { matchId: "m-1", status: "in_progress", opponentName: "Alpha" };
      const { getByTestId, getByLabelText } = render(<ArenaScreen />);
      expect(getByTestId("arena-strip-confirm")).toBeTruthy();
      expect(getByLabelText("You are live")).toBeTruthy();
      fireEvent.press(getByLabelText("Confirm result"));
      fireEvent.press(getByLabelText("Confirm result"));
      // navigate, like the chip's CONFIRM: a double tap never stacks two
      // match screens.
      expect(mockNavigate).toHaveBeenCalledWith("/match/m-1");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("keeps a result to confirm reachable under a challenge strip", () => {
      mockIsLive = true;
      mockConfirm = { matchId: "m-1", status: "in_progress", opponentName: "Alpha" };
      mockChallenge.outgoing = { challengeId: "ch-1", opponentId: "a-1", opponentName: "Alpha" };
      const r = render(<ArenaScreen />);
      // Both strips, the challenge first.
      const ids = r
        .getAllByTestId(/^arena-strip-(waiting|confirm)$/)
        .map((n) => n.props.testID);
      expect(ids).toEqual(["arena-strip-waiting", "arena-strip-confirm"]);
      fireEvent.press(r.getByLabelText("Confirm result"));
      expect(mockNavigate).toHaveBeenCalledWith("/match/m-1");
      r.unmount();

      // Under an incoming strip too.
      mockChallenge.outgoing = null;
      mockChallenge.incoming = INCOMING;
      mockChallenge.incomingCount = 1;
      const b = render(<ArenaScreen />);
      expect(b.getByTestId("arena-strip-incoming")).toBeTruthy();
      expect(b.getByTestId("arena-strip-confirm")).toBeTruthy();
    });

    it("keeps the countdown in its own node that never shrinks, so a long name truncates first", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-09-28T12:01:48Z"));
      mockIsLive = true;
      const name = "Christopher Montgomery-Wellington";
      mockChallenge.outgoing = {
        challengeId: "ch-1",
        opponentId: "a-1",
        opponentName: name,
        createdAt: "2026-09-28T12:00:00Z",
        expiresAt: "2026-10-05T12:00:00Z",
      };
      const r = render(<ArenaScreen />);
      const strip = r.getByTestId("arena-strip-waiting");
      // The harness StaticText is still exact, on the name node alone.
      const head = within(strip).getByLabelText(`Waiting for ${name}`);
      expect(head.props.numberOfLines).toBe(1);
      expect(head.props.className).toMatch(/(^|\s)shrink(\s|$)/);
      const countdown = within(strip).getByTestId("arena-strip-countdown");
      expect(countdown.props.children).toBe(" · 8:12");
      expect(countdown.props.className).toMatch(/shrink-0/);
      // VoiceOver hears the countdown too.
      expect(countdown.props.accessibilityLabel).toBe("8 minutes 12 seconds left");
    });
  });

  describe("Just Rolled is removed (owner, 2026-10-01)", () => {
    it("renders no Just Rolled section", () => {
      const { queryByTestId, queryByText } = render(<ArenaScreen />);
      expect(queryByTestId("arena-just-rolled")).toBeNull();
      expect(queryByText(/Just rolled/i)).toBeNull();
    });
  });

  it("locks Challenge while any live transition is in flight, not only the toggle's own (liveTransition, chip)", () => {
    mockSwitchPhase = "saving";
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    const r = render(<ArenaScreen />);
    const row = rowButton(r, "a-1", "Challenge Alpha");
    expect(isDisabled(row)).toBe(true);
    fireEvent.press(row);
    fireEvent.press(r.getByTestId("arena-closest-cta"));
    expect(mockSendChallenge).not.toHaveBeenCalled();
  });

  it("gives a light haptic when a challenge is sent, and none when locked", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);

    const r = render(<ArenaScreen />);
    fireEvent.press(rowButton(r, "a-1", "Challenge Alpha"));
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledWith("light");
    r.unmount();

    mockImpact.mockClear();
    mockChallenge.isBusy = true;
    const locked = render(<ArenaScreen />);
    fireEvent.press(rowButton(locked, "a-1", "Challenge Alpha"));
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockSendChallenge).toHaveBeenCalledTimes(1);
  });

  it("still sends the challenge when the haptic engine fails", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockImpact.mockImplementationOnce(() => Promise.reject(new Error("no")));

    const r = render(<ArenaScreen />);
    fireEvent.press(rowButton(r, "a-1", "Challenge Alpha"));
    expect(mockSendChallenge).toHaveBeenCalledWith("a-1", "Alpha");
  });

  it("does not render its own challenge prompt", () => {
    // The prompt is app-wide (ArenaBootstrap). A second copy here would show
    // two sheets for one challenge.
    mockChallenge.incoming = INCOMING;
    const { queryByLabelText } = render(<ArenaScreen />);
    expect(queryByLabelText("Accept challenge")).toBeNull();
    expect(queryByLabelText("Decline challenge")).toBeNull();
  });

  it("locks row actions while a challenge prompt is up", () => {
    mockIsLive = true;
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    mockChallenge.incoming = INCOMING;
    const r = render(<ArenaScreen />);

    fireEvent.press(rowButton(r, "a-1", "Challenge Alpha"));
    fireEvent.press(r.getByTestId("arena-closest-cta"));
    expect(mockSendChallenge).not.toHaveBeenCalled();
  });

  it("opens the athlete profile from a row", () => {
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1"]);
    const { getByLabelText } = render(<ArenaScreen />);

    fireEvent.press(getByLabelText("Alpha, ELO 1300, plus 100 vs you, 185 pounds"));
    expect(mockPush).toHaveBeenCalledWith("/athlete/a-1");
  });

  it("owns no live writer, presence channel or challenge listener", () => {
    render(<ArenaScreen />);

    expect(mockUseArenaLive).not.toHaveBeenCalled();
    expect(mockUseLobbyPresence).not.toHaveBeenCalled();
    expect(mockUseArenaChallenge).not.toHaveBeenCalled();
  });

  it("header is the ARENA title, then the status chip (kept on the Arena, decision) and the bell", () => {
    mockIsLive = true;
    const { getByTestId, getByRole, UNSAFE_root } = render(<ArenaScreen />);

    expect(getByRole("header").props.children).toBe("Arena");
    const ids = UNSAFE_root.findAll(
      (n: { type: unknown; props: { testID?: unknown } }) =>
        typeof n.type === "string" && typeof n.props.testID === "string",
    ).map((n: { props: { testID?: unknown } }) => n.props.testID as string);
    expect(ids.indexOf("header-status-chip")).toBeGreaterThan(-1);
    expect(ids.indexOf("header-status-chip")).toBeLessThan(ids.indexOf("notification-bell"));
  });

  it("re-reads the roster when an opponent turns out to have left", () => {
    const { unmount } = render(<ArenaScreen />);

    const handler = mockSetUnavailable.mock.calls[0][0] as (id: string) => void;
    handler("a-1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshQuietly).not.toHaveBeenCalled();
    unmount();
    // Identity-safe: clears only the handler this screen installed.
    expect(mockClearUnavailable).toHaveBeenLastCalledWith(handler);
  });

  it("re-reads quietly after the stale-challenge sweep (no spinner, no error plate)", () => {
    render(<ArenaScreen />);

    const handler = mockSetUnavailable.mock.calls[0][0] as (id: string) => void;
    handler("");
    expect(mockRefreshQuietly).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("Arena screen: a challenge push (?challenge=<id>, AC-A8)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  function pending(createdAgoMs: number) {
    const now = Date.now();
    return {
      challengeId: ID,
      challengerId: "a-9",
      opponentId: mockAthlete.id,
      challengerName: "Rival",
      opponentName: "Me",
      matchType: "ranked",
      createdAt: new Date(now - createdAgoMs).toISOString(),
      expiresAt: new Date(now + 7 * 86_400_000).toISOString(),
      challengerWeight: null,
      opponentWeight: null,
    };
  }

  it("clears the param on this route at once", async () => {
    mockParams = { challenge: ID };
    render(<ArenaScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ challenge: undefined });
    expect(mockRouter.setParams).not.toHaveBeenCalled();
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
  });

  it("live: asks recovery to raise THAT challenge, and shows no offer", async () => {
    mockIsLive = true;
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const { queryByTestId } = render(<ArenaScreen />);
    await waitFor(() => expect(mockResync).toHaveBeenCalledWith({ prefer: ID }));
    expect(queryByTestId("arena-strip-offer")).toBeNull();
  });

  it("offline: offers going live as the one red CTA; going live is the guarded switch", async () => {
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1", "a-9"]);
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    const strip = await r.findByTestId("arena-strip-offer");
    expect(within(strip).getByText("Rival wants to roll")).toBeTruthy();
    expect(within(strip).getByTestId("arena-strip-countdown").props.children).toMatch(
      /^ · [89]:\d\d$/,
    );
    expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
    // The Closest Match demotes so red stays single.
    expect(r.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);

    fireEvent.press(r.getByLabelText("Go live to answer Rival"));
    expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);

    // Once live, recovery owns it: the offer goes.
    mockIsLive = true;
    r.rerender(<ArenaScreen />);
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
  });

  it("offline: a failed go-live from the offer says so", async () => {
    mockLobbyIds = new Set(["a-9"]);
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const { toast } = jest.requireMock("@/components/ui/toast") as {
      toast: { error: jest.Mock; info: jest.Mock };
    };
    toast.info.mockClear();
    const r = render(<ArenaScreen />);
    await r.findByTestId("arena-strip-offer");
    mockGuardedGoLive.mockImplementationOnce(() => Promise.resolve(false));
    await act(async () => {
      fireEvent.press(r.getByLabelText("Go live to answer Rival"));
    });
    expect(toast.info).toHaveBeenCalledWith("Couldn't take you live. Try again.");
    // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("offline: offers going live only while the challenger is on the mat", async () => {
    // The challenger is not in lobby:online: recovery could not raise the
    // prompt, so a red go-live would take the athlete live for nothing.
    mockLobbyIds = new Set();
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await waitFor(() => expect(mockResync).toHaveBeenCalledWith({ prefer: ID }));
    await act(async () => {});
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();

    // They come back inside the window: the offer shows.
    mockLobbyIds = new Set(["a-9"]);
    r.rerender(<ArenaScreen />);
    expect(r.getByTestId("arena-strip-offer")).toBeTruthy();

    // They leave again: it hides.
    mockLobbyIds = new Set();
    r.rerender(<ArenaScreen />);
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
  });

  it("a stale challenge shows nothing and asks for nothing", async () => {
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(11 * 60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const { queryByTestId } = render(<ArenaScreen />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalled());
    await act(async () => {});
    expect(queryByTestId("arena-strip-offer")).toBeNull();
    expect(mockResync).not.toHaveBeenCalled();
  });

  it("an unknown id or a failed read shows nothing", async () => {
    mockGetPending.mockResolvedValueOnce({ ok: false, error: { message: "x" } });
    mockParams = { challenge: ID };
    const { queryByTestId } = render(<ArenaScreen />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalled());
    await act(async () => {});
    expect(queryByTestId("arena-strip-offer")).toBeNull();
    expect(mockResync).not.toHaveBeenCalled();
  });

  it("a challenge dropped by a manual go-offline (Q3) is never offered from its push", async () => {
    // Tucked with "Later", then the athlete went offline on purpose: the
    // challenge hook dismissed it for good, so recovery would never raise it.
    mockDismissed.add(ID);
    mockLobbyIds = new Set(["a-9"]);
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
    expect(mockResync).not.toHaveBeenCalled();
    // The Closest Match keeps the surface's red.
    expect(r.getByTestId("arena-closest-cta").props.className).toMatch(/bg-cta/);
  });

  describe("no param: the tab's red count has an offer behind it (AC-T1)", () => {
    afterEach(() => {
      act(() => resetBellStore());
    });

    it("offline, 1 fresh incoming from an on-mat challenger: the Arena shows the offer strip", async () => {
      mockRoster.competitors = [competitor()];
      mockLobbyIds = new Set(["a-1", "a-9"]);
      mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
      act(() => publishBellBadge(1, 1));
      const r = render(<ArenaScreen />);
      const strip = await r.findByTestId("arena-strip-offer");
      expect(within(strip).getByText("Rival wants to roll")).toBeTruthy();
      // The Closest Match demotes so red stays single.
      expect(r.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);
      expect(mockResync).not.toHaveBeenCalled();

      fireEvent.press(r.getByLabelText("Go live to answer Rival"));
      // Recovery is asked to raise THIS challenge once live.
      expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
      expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);

      mockIsLive = true;
      r.rerender(<ArenaScreen />);
      expect(r.queryByTestId("arena-strip-offer")).toBeNull();
    });

    it("no read and no offer while the bell counts nothing fresh", async () => {
      mockLobbyIds = new Set(["a-9"]);
      mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
      const r = render(<ArenaScreen />);
      await act(async () => {});
      expect(mockGetPending).not.toHaveBeenCalled();
      expect(r.queryByTestId("arena-strip-offer")).toBeNull();
    });

    it("the challenger off the mat: no red offer, but a neutral Not-on-the-mat strip (spec 14)", async () => {
      mockLobbyIds = new Set();
      mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
      act(() => publishBellBadge(1, 1));
      const r = render(<ArenaScreen />);
      const away = await r.findByTestId("arena-strip-away");
      expect(r.queryByTestId("arena-strip-offer")).toBeNull();
      expect(within(away).getByText("Rival wants to roll")).toBeTruthy();
      expect(within(away).getByText("Not on the mat")).toBeTruthy();
      // Neutral rail and no action: nothing can be answered yet.
      expect(away.props.className).toMatch(/border-l-ink-3/);
      expect(within(away).queryByRole("button")).toBeNull();
      // The Closest Match keeps the surface's one red CTA.
      expect(r.getByTestId("arena-closest-cta").props.className).toMatch(/bg-cta/);

      // The challenger comes back: the away strip becomes the red offer.
      mockLobbyIds = new Set(["a-9"]);
      r.rerender(<ArenaScreen />);
      expect(r.getByTestId("arena-strip-offer")).toBeTruthy();
      expect(r.queryByTestId("arena-strip-away")).toBeNull();
    });

    it("a dismissed (Q3) or stale challenge is never seeded", async () => {
      mockDismissed.add(ID);
      mockLobbyIds = new Set(["a-9"]);
      const stale = { ...pending(11 * 60_000), challengeId: "22222222-2222-4222-8222-222222222222" };
      mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000), stale], outgoing: [] } });
      act(() => publishBellBadge(1, 1));
      const r = render(<ArenaScreen />);
      await waitFor(() => expect(mockGetPending).toHaveBeenCalled());
      await act(async () => {});
      expect(r.queryByTestId("arena-strip-offer")).toBeNull();
    });
  });

  it("offline with A tucked: a push for B shows B's offer as the one red CTA", async () => {
    mockChallenge.incoming = { ...INCOMING, challengeId: "ch-a" };
    mockChallenge.incomingCount = 1;
    mockChallenge.incomingTucked = true;
    mockLobbyIds = new Set(["a-9"]);
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    const strip = await r.findByTestId("arena-strip-offer");
    expect(within(strip).getByText("Rival wants to roll")).toBeTruthy();
    expect(r.queryByTestId("arena-strip-incoming")).toBeNull();
    expect(mockResync).toHaveBeenCalledWith({ prefer: ID });
    expect(r.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);
    expect(redCount(r)).toBe(1);
    fireEvent.press(r.getByLabelText("Go live to answer Rival"));
    expect(mockGuardedGoLive).toHaveBeenCalledTimes(1);
  });

  it("offline with my own challenge out: the push's offer leads and Cancel challenge stays under it", async () => {
    mockRoster.competitors = [competitor()];
    mockLobbyIds = new Set(["a-1", "a-9"]);
    mockChallenge.outgoing = { challengeId: "o-1", opponentId: "a-1", opponentName: "Alpha" };
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    const strip = await r.findByTestId("arena-strip-offer");
    expect(within(strip).getByText("Rival wants to roll")).toBeTruthy();
    // My own challenge is under it, still cancellable.
    expect(r.getByTestId("arena-strip-waiting")).toBeTruthy();
    expect(r.getByLabelText("Waiting for Alpha")).toBeTruthy();
    fireEvent.press(r.getByLabelText("Cancel challenge"));
    expect(mockCancelOutgoing).toHaveBeenCalled();
    // The offer's go-live is the one red CTA.
    expect(r.getByTestId("arena-closest-cta").props.className).not.toMatch(/bg-cta/);
    expect(redCount(r)).toBe(1);
  });

  it("the challenge already tucked into the chip is reopened without a read", () => {
    mockIsLive = true;
    mockChallenge.incoming = { ...INCOMING, challengeId: ID };
    mockChallenge.incomingCount = 1;
    mockChallenge.incomingTucked = true;
    mockParams = { challenge: ID };
    render(<ArenaScreen />);
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockGetPending).not.toHaveBeenCalled();
  });

  it("ignores an id that is not a UUID", () => {
    mockParams = { challenge: "not-a-uuid" };
    render(<ArenaScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ challenge: undefined });
    expect(mockGetPending).not.toHaveBeenCalled();
  });

  it("offline: the offer goes the moment its challenge ends (cancelled by the challenger)", async () => {
    mockLobbyIds = new Set(["a-9"]);
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await r.findByTestId("arena-strip-offer");

    // Another challenge ending changes nothing.
    act(() => endIncomingChallenge("22222222-2222-4222-8222-222222222222"));
    expect(r.getByTestId("arena-strip-offer")).toBeTruthy();

    // The challenger cancels from their waiting strip, and stays on the mat.
    act(() => endIncomingChallenge(ID));
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
    expect(mockGuardedGoLive).not.toHaveBeenCalled();
  });

  it("offline: a challenge that ended while its read was in flight is never offered", async () => {
    mockLobbyIds = new Set(["a-9"]);
    let resolve: (v: unknown) => void = () => {};
    mockGetPending.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
    act(() => endIncomingChallenge(ID));
    await act(async () => {
      resolve({ ok: true, data: { incoming: [pending(60_000)], outgoing: [] } });
    });
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
  });

  it("a push that lands before auth resolves waits for the athlete, then reads once", async () => {
    mockAuthAthlete = null;
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ challenge: undefined });
    await act(async () => {});
    expect(mockGetPending).not.toHaveBeenCalled();

    mockAuthAthlete = mockAthlete;
    r.rerender(<ArenaScreen />);
    await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
    expect(mockGetPending).toHaveBeenCalledWith(expect.anything(), mockAthlete.id);
    await act(async () => {});
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it("a second push while the first read is in flight: only the latest is acted on", async () => {
    const ID_B = "33333333-3333-4333-8333-333333333333";
    mockLobbyIds = new Set(["a-9", "a-8"]);
    const resolvers: ((v: unknown) => void)[] = [];
    mockGetPending.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const both = {
      ok: true,
      data: {
        incoming: [
          pending(60_000),
          { ...pending(30_000), challengeId: ID_B, challengerId: "a-8", challengerName: "Other" },
        ],
        outgoing: [],
      },
    };
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await waitFor(() => expect(resolvers).toHaveLength(1));

    mockParams = { ...mockParams, challenge: ID_B };
    r.rerender(<ArenaScreen />);
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // The first read lands late: it was cancelled, so it raises nothing.
    await act(async () => {
      resolvers[0](both);
    });
    expect(mockResync).not.toHaveBeenCalled();
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();

    await act(async () => {
      resolvers[1](both);
    });
    expect(mockResync).toHaveBeenCalledTimes(1);
    expect(mockResync).toHaveBeenCalledWith({ prefer: ID_B });
    expect(within(r.getByTestId("arena-strip-offer")).getByText("Other wants to roll")).toBeTruthy();
  });

  it("the offer lapses at the 10-minute mark", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    mockLobbyIds = new Set(["a-9"]);
    // 9:59 left in the fresh window.
    mockGetPending.mockResolvedValue({ ok: true, data: { incoming: [pending(1_000)], outgoing: [] } });
    mockParams = { challenge: ID };
    const r = render(<ArenaScreen />);
    await act(async () => {});
    expect(r.getByTestId("arena-strip-offer")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(9 * 60_000 + 58_000);
    });
    expect(r.getByTestId("arena-strip-offer")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(r.queryByTestId("arena-strip-offer")).toBeNull();
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

describe("Arena screen: no rematch handoff (jits-02vo.8)", () => {
  function roster() {
    mockIsLive = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha" }),
      competitor({ id: "a-2", displayName: "Bravo" }),
      competitor({ id: "a-3", displayName: "Charlie" }),
    ];
  }

  it("ignores a stale ?rematch=<id>&send=1 link: no tag, no auto-send, no go-live, no param handling", () => {
    jest.useFakeTimers();
    roster();
    mockIsLive = false;
    mockLobbyIds = new Set(["a-1", "a-3"]);
    mockParams = { rematch: "a-3", send: "1" };

    const { queryByText, queryByLabelText, rerender } = render(<ArenaScreen />);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    rerender(<ArenaScreen />);

    expect(queryByText("Rematch")).toBeNull();
    expect(queryByLabelText(/, rematch$/)).toBeNull();
    expect(mockSendChallenge).not.toHaveBeenCalled();
    expect(mockGuardedGoLive).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it("a normal Arena challenge to the same opponent still works", () => {
    roster();
    mockLobbyIds = new Set(["a-1", "a-3"]);

    const r = render(<ArenaScreen />);
    fireEvent.press(rowButton(r, "a-3", "Challenge Charlie"));
    expect(mockSendChallenge).toHaveBeenCalledWith("a-3", "Charlie");
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
});

describe("Arena Booked strip and match_location_required", () => {
  const BOOKING = {
    challenge_id: "c1",
    invite_id: "i1",
    role: "invitee",
    opponent: { athlete_id: "a1", display_name: "Alex R", first_name: "Alex" },
  };

  it("flag off: the strip offers Start match, which starts that booking", () => {
    const start = jest.fn(() => Promise.resolve("started"));
    mockBooked = { bookings: [BOOKING], location: "unknown", start };
    const r = render(<ArenaScreen />);
    expect(mockUseBookings).toHaveBeenLastCalledWith(expect.objectContaining({ locationRequired: false }));
    expect(r.getByText("Tap Start when you're both on the mat.")).toBeTruthy();
    fireEvent.press(r.getByTestId("arena-booked-start-c1"));
    expect(start).toHaveBeenCalledWith("c1");
  });

  it("flag off: a refused start shows on the strip", () => {
    mockBooked = {
      bookings: [BOOKING],
      location: "unknown",
      start: jest.fn(),
      startErrors: { c1: { short: "Finish your match first.", full: "Finish your current match first. Your booking with Alex is saved." } },
    };
    const r = render(<ArenaScreen />);
    expect(r.getByText("Finish your match first.")).toBeTruthy();
  });

  it("M1: re-reads the flag each time the Arena gains focus", () => {
    mockIsFocused = false;
    const r = render(<ArenaScreen />);
    expect(mockLoadFlag).not.toHaveBeenCalled();
    mockIsFocused = true;
    r.rerender(<ArenaScreen />);
    expect(mockLoadFlag).toHaveBeenCalledTimes(1);
    mockIsFocused = false;
    r.rerender(<ArenaScreen />);
    mockIsFocused = true;
    r.rerender(<ArenaScreen />);
    expect(mockLoadFlag).toHaveBeenCalledTimes(2);
  });

  it("L4: flag not known yet: the bookings run nothing and the strip shows no Start match", () => {
    mockFlagKnown = false;
    mockBooked = { bookings: [BOOKING], location: "unknown", start: jest.fn() };
    const r = render(<ArenaScreen />);
    expect(mockUseBookings).toHaveBeenLastCalledWith(expect.objectContaining({ locationRequired: null }));
    expect(r.queryByTestId("arena-booked-start-c1")).toBeNull();
    expect(r.getByTestId("booked-message")).toHaveTextContent("Starts when you're both on the mat.");
  });

  it("flag on: no Start match, the location flow drives it", () => {
    mockLocationRequired = true;
    mockBooked = { bookings: [BOOKING], location: "denied", start: jest.fn() };
    const r = render(<ArenaScreen />);
    expect(mockUseBookings).toHaveBeenLastCalledWith(expect.objectContaining({ locationRequired: true }));
    expect(r.queryByTestId("arena-booked-start-c1")).toBeNull();
    expect(r.getByLabelText("Open Settings")).toBeTruthy();
  });
});

describe("Arena nearby: On the mat by proximity and Online & close (016 addendum)", () => {
  function nearby(onMat: string[], close: [string, string][]) {
    return { mode: "nearby", onTheMat: new Set(onMat), close: new Map(close) };
  }

  beforeEach(() => {
    mockIsLive = true;
    mockLocationRequired = true;
    mockRoster.competitors = [
      competitor({ id: "a-1", displayName: "Alpha", eloDiff: 300 }),
      competitor({ id: "a-2", displayName: "Bravo", eloDiff: 10 }),
      competitor({ id: "a-3", displayName: "Charlie", eloDiff: 50 }),
      competitor({ id: "a-4", displayName: "Delta", eloDiff: 20 }),
      competitor({ id: "a-5", displayName: "Echo", eloDiff: 5 }),
    ];
    mockLobbyIds = new Set(["a-1", "a-2", "a-3", "a-4", "a-5"]);
  });

  it("M2: publishes the nearby On the mat count for the header chip; fallback publishes none", () => {
    mockNearbyView = nearby(["a-1"], [["a-2", "under_500m"], ["a-3", "under_2km"]]);
    const r = render(<ArenaScreen />);
    // One row on my mat: the chip's number, not the five live in the lobby.
    expect(mockPublishNearbyCount).toHaveBeenLastCalledWith({ count: 1 });
    mockNearbyView = { mode: "fallback" };
    r.rerender(<ArenaScreen />);
    expect(mockPublishNearbyCount).toHaveBeenLastCalledWith(null);
    // And leaving the Arena hands the chip back to the lobby count.
    mockNearbyView = nearby(["a-1"], []);
    r.rerender(<ArenaScreen />);
    expect(mockPublishNearbyCount).toHaveBeenLastCalledWith({ count: 1 });
    r.unmount();
    expect(mockPublishNearbyCount).toHaveBeenLastCalledWith(null);
  });

  it("reads the nearby view with focus, live state, flag and the lobby", () => {
    render(<ArenaScreen />);
    expect(mockUseArenaNearby).toHaveBeenCalledWith({
      focused: true,
      isLive: true,
      locationRequired: true,
      lobbyKey: "a-1,a-2,a-3,a-4,a-5",
    });
  });

  it("nearby: On the mat is only my mat, labelled near you; others are in a collapsed count", () => {
    mockNearbyView = nearby(["a-1"], [["a-2", "under_500m"], ["a-3", "under_2km"]]);
    const r = render(<ArenaScreen />);

    const mat = r.getByTestId("arena-on-the-mat");
    expect(within(mat).getByText("On the mat · near you")).toBeTruthy();
    expect(within(mat).getByTestId("arena-mat-row-a-1")).toBeTruthy();
    expect(within(mat).queryByTestId("arena-mat-row-a-2")).toBeNull();
    // In neither list: not on the Arena at all.
    expect(r.queryByText("Delta")).toBeNull();
    expect(r.queryByText("Echo")).toBeNull();

    // Collapsed by default: the header with its count, no rows.
    const header = r.getByTestId("arena-online-close-header");
    expect(header.props.accessibilityRole).toBe("button");
    expect(header.props.accessibilityLabel).toBe("Online and close, 2 athletes");
    expect(header.props.accessibilityState).toEqual({ expanded: false });
    expect(r.getByText("Online & close · 2")).toBeTruthy();
    expect(r.queryByTestId("arena-mat-row-a-2")).toBeNull();
    expect(r.queryByTestId("arena-mat-row-a-3")).toBeNull();
  });

  it("expands and collapses; rows show their band and a non-red hint instead of ROLL", () => {
    mockNearbyView = nearby(["a-1"], [["a-3", "under_2km"], ["a-2", "under_500m"]]);
    const r = render(<ArenaScreen />);
    fireEvent.press(r.getByTestId("arena-online-close-header"));

    expect(r.getByTestId("arena-online-close-header").props.accessibilityState).toEqual({ expanded: true });
    const section = r.getByTestId("arena-online-close");
    // Hidden from VoiceOver (the row's label speaks it), so include hidden.
    const hidden = { includeHiddenElements: true };
    expect(within(section).getByTestId("arena-close-band-a-2", hidden)).toHaveTextContent("< 500 m");
    expect(within(section).getByTestId("arena-close-band-a-3", hidden)).toHaveTextContent("< 2 km");
    expect(within(section).getByTestId("arena-not-on-mat-a-2")).toHaveTextContent("Not on your mat");
    // No challenge from a close row, and nothing red there.
    expect(r.queryByLabelText("Challenge Bravo")).toBeNull();
    expect(r.queryByLabelText("Challenge Charlie")).toBeNull();
    const hint = within(section).getByTestId("arena-not-on-mat-a-2");
    expect(hint.props.className).not.toMatch(/primary|cta|negative/);
    // Nearest band first.
    const ids = within(section)
      .getAllByTestId(/^arena-mat-row-/)
      .map((n) => n.props.testID);
    expect(ids).toEqual(["arena-mat-row-a-2", "arena-mat-row-a-3"]);
    // The row's label carries the band.
    expect(r.getByLabelText(/^Bravo, ELO 1300, .*under 500 meters$/)).toBeTruthy();

    fireEvent.press(r.getByTestId("arena-online-close-header"));
    expect(r.getByTestId("arena-online-close-header").props.accessibilityState).toEqual({ expanded: false });
    expect(r.queryByTestId("arena-mat-row-a-2")).toBeNull();
  });

  it("remembers expanded for the session (a remount keeps it)", () => {
    mockNearbyView = nearby([], [["a-2", "under_1km"]]);
    const first = render(<ArenaScreen />);
    fireEvent.press(first.getByTestId("arena-online-close-header"));
    first.unmount();
    const again = render(<ArenaScreen />);
    expect(again.getByTestId("arena-online-close-header").props.accessibilityState).toEqual({ expanded: true });
    expect(again.getByTestId("arena-mat-row-a-2")).toBeTruthy();
  });

  it("friends are badged and sorted first within a band", () => {
    mockFriendIds = new Set(["a-4"]);
    mockNearbyView = nearby([], [["a-2", "under_1km"], ["a-4", "under_1km"], ["a-5", "under_500m"]]);
    const r = render(<ArenaScreen />);
    fireEvent.press(r.getByTestId("arena-online-close-header"));
    const section = r.getByTestId("arena-online-close");
    const ids = within(section)
      .getAllByTestId(/^arena-mat-row-/)
      .map((n) => n.props.testID);
    expect(ids).toEqual(["arena-mat-row-a-5", "arena-mat-row-a-4", "arena-mat-row-a-2"]);
    expect(within(section).getByTestId("arena-friend-badge-a-4")).toBeTruthy();
  });

  it("hidden entirely when nobody is close", () => {
    mockNearbyView = nearby(["a-1"], []);
    const r = render(<ArenaScreen />);
    expect(r.queryByTestId("arena-online-close")).toBeNull();
    expect(r.queryByText(/Online & close/)).toBeNull();
  });

  it("Closest Match comes only from On the mat (a closer rating that is only close is skipped)", () => {
    // Echo (gap 5) and Bravo (gap 10) are closer in rating but not on my mat.
    mockNearbyView = nearby(["a-1", "a-3"], [["a-5", "under_500m"], ["a-2", "under_500m"]]);
    const r = render(<ArenaScreen />);
    expect(r.getByTestId("arena-closest-cta").props.accessibilityLabel).toBe("Challenge Charlie");
  });

  it("nobody on my mat: today's empty copy, no Closest Match CTA, the close header carries the count", () => {
    mockNearbyView = nearby([], [["a-2", "under_500m"]]);
    const r = render(<ArenaScreen />);
    expect(r.getByText("Nobody else on the mat")).toBeTruthy();
    expect(r.queryByTestId("arena-closest-cta")).toBeNull();
    expect(r.queryByTestId("arena-on-the-mat")).toBeNull();
    expect(r.getByText("Online & close · 1")).toBeTruthy();
    expect(r.getByTestId("arena-online-close-header").props.accessibilityLabel).toBe("Online and close, 1 athlete");
  });

  it("the friends-first label is kept in nearby mode", () => {
    mockFriendIds = new Set(["a-1"]);
    mockNearbyView = nearby(["a-1", "a-3"], []);
    const r = render(<ArenaScreen />);
    expect(r.getByText("On the mat · friends first")).toBeTruthy();
  });

  it("fallback (flag off, no location or RPC error): today's list, no Online & close", () => {
    mockNearbyView = { mode: "fallback" };
    const r = render(<ArenaScreen />);
    const mat = r.getByTestId("arena-on-the-mat");
    expect(within(mat).getByText("On the mat · closest first")).toBeTruthy();
    for (const id of ["a-1", "a-2", "a-3", "a-4", "a-5"]) {
      expect(within(mat).getByTestId(`arena-mat-row-${id}`)).toBeTruthy();
    }
    expect(r.queryByTestId("arena-online-close")).toBeNull();
    // Today's Closest Match: strictly closest by rating.
    expect(r.getByTestId("arena-closest-cta").props.accessibilityLabel).toBe("Challenge Echo");
  });

  it("the invite footer stays pinned in nearby mode", () => {
    mockInvitesOn = true;
    mockNearbyView = nearby(["a-1"], [["a-2", "under_500m"]]);
    const r = render(<ArenaScreen />);
    expect(r.getByTestId("arena-invite-actions")).toBeTruthy();
  });
});
