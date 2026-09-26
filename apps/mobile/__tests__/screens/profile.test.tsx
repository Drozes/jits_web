/**
 * Profile tab header: like every tab header, its right side is exactly the
 * LIVE signal (while live) then the notification bell. Share moved into the
 * body as a secondary button that opens the same share sheet.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

type HostNode = ReturnType<typeof render>["UNSAFE_root"];

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : stub) },
  );
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ accentCta: "#E63946", textSecondary: "#9CA3AF" }),
}));
const mockPush = jest.fn();
// useFocusEffect runs its callback on mount (the first focus) and records it
// so a test can simulate the tab regaining focus.
const mockFocusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocusCallbacks.push(cb);
      cb();
    }, [cb]);
  },
}));
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: {
      id: "me-1",
      display_name: "Me",
      current_elo: 1200,
      current_weight: 180,
      primary_gym_id: null,
    },
  }),
}));
const mockProfileRefetch = jest.fn();
const mockHistory: Record<string, unknown>[] = [];
jest.mock("@/lib/profile/use-profile-data", () => ({
  useProfileData: () => ({
    stats: { wins: 3, losses: 1, totalMatches: 4, winStreak: 1, bestWinStreak: 2, winRate: 75 },
    gymName: null,
    eloThisMonth: 0,
    history: mockHistory,
    isLoading: false,
    refreshing: false,
    onRefresh: mockProfileRefetch,
  }),
}));
const mockVideosRefetch = jest.fn();
jest.mock("@/lib/profile/use-my-match-videos", () => ({
  useMyMatchVideos: () => ({
    items: [],
    isLoading: false,
    isValidating: false,
    error: null,
    refetch: mockVideosRefetch,
  }),
}));
function mockStub(testID: string) {
  const R = require("react");
  const RN = require("react-native");
  return () => R.createElement(RN.View, { testID });
}
jest.mock("@/components/profile/profile-header", () => ({ ProfileHeader: mockStub("profile-header") }));
jest.mock("@/components/profile/profile-quick-stats", () => ({ ProfileQuickStats: mockStub("quick-stats") }));
jest.mock("@/components/profile/account-section", () => ({ AccountSection: mockStub("account") }));
jest.mock("@/components/profile/past-match-videos", () => ({ PastMatchVideos: mockStub("videos") }));
jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: mockStub("notification-bell"),
}));
const mockShareAthlete = jest.fn();
jest.mock("@/components/share-profile-sheet", () => ({
  ShareProfileSheet: ({ athlete, children }: { athlete: unknown; children: React.ReactNode }) => {
    mockShareAthlete(athlete);
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "share-sheet" }, children);
  },
}));

import ProfileScreen from "@/app/(app)/(tabs)/profile/index";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";

beforeEach(() => {
  jest.clearAllMocks();
  __resetArenaStoreForTests();
  mockFocusCallbacks.length = 0;
  mockHistory.length = 0;
  jest.spyOn(Date, "now").mockImplementation(() => mockNow);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Focus refetches are throttled to one per 30s; tests move this clock.
let mockNow = 1_000_000;

describe("Profile recent matches and refresh", () => {
  it("opens the match detail screen from a recent match row", () => {
    mockHistory.push({
      match_id: "m-7",
      opponent_display_name: "Demo Red",
      completed_at: "2026-09-24T12:00:00.000Z",
      match_type: "ranked",
      elo_delta: -8,
    });
    const { getByLabelText } = render(<ProfileScreen />);

    fireEvent.press(getByLabelText("Open match vs Demo Red"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-7");
  });

  it("refetches profile and videos when the tab regains focus, not on the first focus", () => {
    render(<ProfileScreen />);
    expect(mockProfileRefetch).not.toHaveBeenCalled();
    expect(mockVideosRefetch).not.toHaveBeenCalled();

    mockNow += 31_000;
    act(() => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    expect(mockProfileRefetch).toHaveBeenCalledTimes(1);
    expect(mockVideosRefetch).toHaveBeenCalledTimes(1);
  });

  it("pull-to-refresh reloads the videos list too", () => {
    const { UNSAFE_root } = render(<ProfileScreen />);
    const scroll = UNSAFE_root.find(
      (n: HostNode) => typeof n.props.refreshControl === "object" && n.props.refreshControl != null,
    );
    act(() => {
      scroll.props.refreshControl.props.onRefresh();
    });
    expect(mockProfileRefetch).toHaveBeenCalledTimes(1);
    expect(mockVideosRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("Profile tab", () => {
  it("header right side is LIVE then the bell, with no Share action", () => {
    act(() => publishArenaState({ ...IDLE_ARENA_STATE, isLive: true }));
    const { getByTestId, queryByLabelText, UNSAFE_root } = render(<ProfileScreen />);

    expect(getByTestId("notification-bell")).toBeTruthy();
    expect(getByTestId("live-header-signal")).toBeTruthy();
    expect(queryByLabelText("Share")).toBeNull();
    const ids = UNSAFE_root.findAll(
      (n: HostNode) => typeof n.type === "string" && typeof n.props.testID === "string",
    ).map((n: HostNode) => n.props.testID as string);
    expect(ids.indexOf("live-header-signal")).toBeGreaterThan(-1);
    expect(ids.indexOf("live-header-signal")).toBeLessThan(ids.indexOf("notification-bell"));
  });

  it("offers Share profile in the body, wired to the same share sheet", () => {
    const { getByLabelText, getByTestId } = render(<ProfileScreen />);

    const button = getByLabelText("Share profile");
    expect(button).toBeTruthy();
    expect(getByTestId("share-sheet")).toBeTruthy();
    expect(mockShareAthlete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "me-1", displayName: "Me", elo: 1200, wins: 3, losses: 1 }),
    );
  });
});
