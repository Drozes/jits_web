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
const mockMe = {
  id: "me-1",
  display_name: "Me",
  current_elo: 1200,
  current_weight: 180,
  primary_gym_id: null,
};
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ athlete: mockMe }),
  // The header rating (BrandHeader) reads the same auth context.
  useAuth: () => ({ athlete: mockMe }),
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
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
// Profile no longer reads the match library or the highlights (spec
// specs/matches-tab/spec.md section 9): these record any call that comes back.
const mockUseMatchLibraryFirstPage = jest.fn();
const mockUseMatchLibrary = jest.fn();
jest.mock("@/lib/film-room/use-match-library", () => ({
  useMatchLibraryFirstPage: (...a: unknown[]) => mockUseMatchLibraryFirstPage(...a),
  useMatchLibrary: (...a: unknown[]) => mockUseMatchLibrary(...a),
}));
// useMyHighlights was deleted (jits-a4fw.8); the reel lane is the only highlights reader now.
const mockUseReelLane = jest.fn();
jest.mock("@/lib/highlight/use-reel-lane", () => ({
  useReelLane: (...a: unknown[]) => mockUseReelLane(...a),
}));
function mockStub(testID: string) {
  const R = require("react");
  const RN = require("react-native");
  return () => R.createElement(RN.View, { testID });
}
jest.mock("@/components/profile/profile-header", () => ({ ProfileHeader: mockStub("profile-header") }));
jest.mock("@/components/profile/profile-quick-stats", () => ({ ProfileQuickStats: mockStub("quick-stats") }));
jest.mock("@/components/profile/account-section", () => ({ AccountSection: mockStub("account") }));
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

describe("Profile refresh", () => {
  it("re-reads the profile only when the tab regains focus, not on the first focus", () => {
    render(<ProfileScreen />);
    expect(mockProfileRefetch).not.toHaveBeenCalled();

    mockNow += 31_000;
    act(() => {
      mockFocusCallbacks.forEach((cb) => cb());
    });
    expect(mockProfileRefetch).toHaveBeenCalledTimes(1);
    expect(mockUseMatchLibraryFirstPage).not.toHaveBeenCalled();
    expect(mockUseMatchLibrary).not.toHaveBeenCalled();
    expect(mockUseReelLane).not.toHaveBeenCalled();
  });

  it("pull-to-refresh re-reads the profile only", () => {
    const { UNSAFE_root } = render(<ProfileScreen />);
    const scroll = UNSAFE_root.find(
      (n: HostNode) => typeof n.props.refreshControl === "object" && n.props.refreshControl != null,
    );
    act(() => {
      scroll.props.refreshControl.props.onRefresh();
    });
    expect(mockProfileRefetch).toHaveBeenCalledTimes(1);
    expect(mockUseMatchLibraryFirstPage).not.toHaveBeenCalled();
    expect(mockUseReelLane).not.toHaveBeenCalled();
  });
});

describe("Profile cleanup (spec specs/matches-tab/spec.md section 9, AC 5.1 to 5.3)", () => {
  function testIds(root: HostNode): string[] {
    return root
      .findAll((n: HostNode) => typeof n.type === "string" && typeof n.props.testID === "string")
      .map((n: HostNode) => n.props.testID as string);
  }

  it("shows no Recent Matches list, no highlights row and no Film Room preview, even with history", () => {
    mockHistory.push({
      match_id: "m-7",
      opponent_display_name: "Demo Red",
      completed_at: "2026-09-24T12:00:00.000Z",
      match_type: "ranked",
      elo_delta: -8,
    });
    const utils = render(<ProfileScreen />);
    expect(utils.queryByText(/Recent Matches/i)).toBeNull();
    expect(utils.queryByText(/No Matches Yet/i)).toBeNull();
    expect(utils.queryByLabelText("Open match vs Demo Red")).toBeNull();
    expect(utils.queryByText(/Film Room/i)).toBeNull();
    expect(utils.queryByText(/Highlights/i)).toBeNull();
    const ids = testIds(utils.UNSAFE_root);
    expect(ids).not.toContain("film-room-preview");
    expect(ids).not.toContain("highlights-row");
    expect(ids.some((id) => id.startsWith("highlight-tile"))).toBe(false);
  });

  it("has no link to the match history (no View all matches, PM1)", () => {
    const utils = render(<ProfileScreen />);
    expect(utils.queryByText(/matches/i)).toBeNull();
    expect(utils.queryByLabelText(/matches|film room/i)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps header, Share profile, quick stats, View Detailed Stats, account and the version footer, in order", () => {
    const utils = render(<ProfileScreen />);
    const ids = testIds(utils.UNSAFE_root);
    expect(ids.indexOf("profile-header")).toBeGreaterThan(-1);
    expect(ids.indexOf("profile-header")).toBeLessThan(ids.indexOf("share-sheet"));
    expect(ids.indexOf("share-sheet")).toBeLessThan(ids.indexOf("quick-stats"));
    expect(ids.indexOf("quick-stats")).toBeLessThan(ids.indexOf("account"));
    expect(utils.getByText("View Detailed Stats")).toBeTruthy();
    expect(utils.getByText("ELO RATED Beta")).toBeTruthy();
    fireEvent.press(utils.getByText("View Detailed Stats"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/profile/stats");
  });

  it("no longer imports the retired Profile history pieces", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(path.join(__dirname, "../../app/(app)/(tabs)/profile/index.tsx"), "utf8");
    for (const gone of ["film-room-preview", "highlights-row", "use-my-highlights", "use-match-library", "useRefetchOnUploadSettled", "Recent Matches"]) {
      expect(src).not.toContain(gone);
    }
  });
});

describe("Profile tab", () => {
  it("header is the PROFILE title at the left, then the status chip and the bell, with no Share action", () => {
    act(() => publishArenaState({ ...IDLE_ARENA_STATE, isLive: true }));
    const { getByTestId, getByRole, queryByLabelText, UNSAFE_root } = render(<ProfileScreen />);

    expect(getByRole("header").props.children).toBe("Profile");
    expect(getByTestId("notification-bell")).toBeTruthy();
    expect(getByTestId("header-status-chip")).toBeTruthy();
    expect(queryByLabelText("Share")).toBeNull();
    const ids = UNSAFE_root.findAll(
      (n: HostNode) => typeof n.type === "string" && typeof n.props.testID === "string",
    ).map((n: HostNode) => n.props.testID as string);
    expect(ids.indexOf("header-status-chip")).toBeGreaterThan(-1);
    expect(ids.indexOf("header-status-chip")).toBeLessThan(ids.indexOf("notification-bell"));
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
