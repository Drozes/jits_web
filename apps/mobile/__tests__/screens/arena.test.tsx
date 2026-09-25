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
import { fireEvent, render } from "@testing-library/react-native";

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
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
let mockRoster = {
  competitors: [] as unknown[],
  challengedIds: new Set<string>(),
  isLoading: false,
  isRefreshing: false,
  hasError: false,
  refresh: mockRefresh,
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
let mockChallenge = {
  incoming: null as unknown,
  outgoing: null as unknown,
  isBusy: false,
  capReached: false,
};
jest.mock("@/lib/arena/arena-store", () => ({
  useArenaState: () => ({ isLive: mockIsLive, isSaving: false, ...mockChallenge }),
  useIsArenaLive: () => mockIsLive,
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
  mockLobbyIds = new Set();
  mockIsLive = false;
  mockRoster = {
    competitors: [],
    challengedIds: new Set(),
    isLoading: false,
    isRefreshing: false,
    hasError: false,
    refresh: mockRefresh,
  };
  mockChallenge = {
    incoming: null,
    outgoing: null,
    isBusy: false,
    capReached: false,
  };
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
    expect(getByText(/Nobody has the app open right now/)).toBeTruthy();
    expect(getByText("Open to challenges")).toBeTruthy();
    expect(getByText("Alpha")).toBeTruthy();
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

    expect(mockSetUnavailable).toHaveBeenCalledWith(mockRefresh);
    unmount();
    expect(mockSetUnavailable).toHaveBeenLastCalledWith(null);
  });
});
