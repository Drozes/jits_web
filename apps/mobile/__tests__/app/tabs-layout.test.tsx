import * as React from "react";
import { render } from "@testing-library/react-native";

// The mobile tsconfig deliberately ships only the expo-router and jest type
// packages, so the Node built-ins come in through require with a narrow local
// type rather than widening the whole app's type surface for one test.
declare const __dirname: string;
const fs = require("fs") as { readdirSync: (dir: string) => string[] };
const path = require("path") as { join: (...parts: string[]) => string };

/**
 * Guards the shape of the bottom tab navigator, from two directions, because
 * either one alone has a blind spot.
 *
 * 1. What `_layout.tsx` declares. Read by mocking `Tabs` and capturing the
 *    Tabs.Screen props. This catches a re-added tab, a role-gated slot, or the
 *    managed-gyms query coming back, but it CANNOT see filesystem routing: the
 *    mock replaces it, so a new directory would not show up here.
 * 2. What the filesystem holds. expo-router auto-registers every route
 *    directory inside `(tabs)` whether or not `_layout.tsx` declares it, so a
 *    directory dropped into the group is a new tab nobody wrote. That is the
 *    single most likely way this whole change gets silently undone, and it is
 *    why the gym routes were moved OUT of the group rather than unregistered.
 *    Only the readdir assertion below can catch it.
 */

const TABS_DIR = path.join(__dirname, "..", "..", "app", "(app)", "(tabs)");

const capturedScreens: { name: string; options: Record<string, unknown> }[] = [];
const capturedTabBar: { current: ((p: unknown) => React.ReactNode) | null } = { current: null };

jest.mock("expo-router", () => {
  const R = require("react");
  const RN = require("react-native");

  const Screen = (props: { name: string; options?: Record<string, unknown> }) => {
    capturedScreens.push({ name: props.name, options: props.options ?? {} });
    return null;
  };

  const Tabs = (props: { children: React.ReactNode; tabBar?: (p: unknown) => React.ReactNode }) => {
    capturedTabBar.current = props.tabBar ?? null;
    return R.createElement(RN.View, {}, props.children);
  };
  Tabs.Screen = Screen;

  return { Tabs };
});

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  // Each icon renders a View tagged with its lucide name, so a test can tell
  // which icon a tab draws.
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return (p: Record<string, unknown>) => R.createElement(RN.View, { testID: `lucide-${prop}`, ...p });
      },
    },
  );
});

const mockEloTabBar = jest.fn((_p: Record<string, unknown>) => null);
jest.mock("@/components/layout/elo-tab-bar", () => ({
  EloTabBar: (p: Record<string, unknown>) => mockEloTabBar(p),
}));

let mockArenaState = { incomingCount: 0, isLive: false, hasConfirm: false, incomingKnown: true };
jest.mock("@/lib/arena/use-arena-tab-badge", () => ({
  useArenaTabState: () => mockArenaState,
}));

// The Arena icon itself is covered by arena-tab-icon.test.tsx; here it only
// has to read the signals the bar provides.
const mockArenaIcon = jest.fn((_p: Record<string, unknown>) => null);
jest.mock("@/components/layout/arena-tab-icon", () => {
  const R = require("react");
  const Ctx = R.createContext({ live: false, incomingCount: 0, incomingKnown: false });
  return {
    ArenaTabSignalsProvider: Ctx.Provider,
    ArenaTabBarIcon: (p: Record<string, unknown>) => mockArenaIcon({ ...p, ...R.useContext(Ctx) }),
  };
});

// If the layout ever reaches for managed gyms again, this mock records it. The
// tab it used to gate is gone, and the query cost every app launch.
const mockUseManagedGyms = jest.fn(() => ({ gyms: [], isReady: true }));
jest.mock("@/lib/admin/use-managed-gyms", () => ({
  useManagedGyms: () => mockUseManagedGyms(),
}));

import TabsLayout from "@/app/(app)/(tabs)/_layout";

beforeEach(() => {
  capturedScreens.length = 0;
  mockUseManagedGyms.mockClear();
});

// The shipped 5-up, in bar order (Matches added 2026-10-06, spec
// specs/matches-tab/spec.md 4.1). Registration and route file stay in lockstep:
// expo-router silently drops a Screen whose route file is missing, so a name
// here with no directory under (tabs) renders no column rather than crashing.
// The on-disk assertion below is what catches that direction.
const EXPECTED_TABS = ["(home)", "arena", "matches", "leaderboard", "profile"];

describe("(tabs)/_layout", () => {
  it("registers exactly the shipped tabs, in bar order", () => {
    render(React.createElement(TabsLayout));
    expect(capturedScreens.map((s) => s.name)).toEqual(EXPECTED_TABS);
  });

  it("holds exactly the shipped tabs on disk, so nothing auto-registers", () => {
    // The assertion the mocked-router tests above structurally cannot make:
    // expo-router turns any directory here into a tab on its own, so a
    // directory dropped in without touching _layout.tsx would still put a
    // column in the bar, and only this check would notice.
    const onDisk = fs
      .readdirSync(TABS_DIR)
      .filter((name) => name !== "_layout.tsx" && !name.startsWith("."))
      // A tab can be a directory or a single file route; both count.
      .map((name) => name.replace(/\.tsx?$/, ""))
      .sort();

    expect(onDisk).toEqual([...EXPECTED_TABS].sort());
  });

  it("has no gym, gym-manager or session routes anywhere under (app)", () => {
    // Mobile dropped gym pages, sessions and the gym-manager portal
    // (jits-gewv): the Arena is the only way to get a match. A route directory
    // restored under (app) would come back live and reachable by link, and one
    // restored under (tabs) would also be a tab.
    const onDisk = fs.readdirSync(TABS_DIR);
    const appDir = path.join(TABS_DIR, "..");
    for (const dir of [onDisk, fs.readdirSync(appDir)]) {
      expect(dir).not.toContain("gyms");
      expect(dir).not.toContain("gym-manager");
      expect(dir).not.toContain("session");
    }
  });

  it("registers no gym tabs", () => {
    render(React.createElement(TabsLayout));
    const names = capturedScreens.map((s) => s.name);
    expect(names).not.toContain("gyms");
    expect(names).not.toContain("gym-manager");
  });

  it("gates no tab behind a role", () => {
    render(React.createElement(TabsLayout));
    // Every user sees the same bar. `tabBarButton` was how the manager-only tab
    // hid itself; nothing may reintroduce a conditional slot.
    for (const screen of capturedScreens) {
      expect(screen.options.tabBarButton).toBeUndefined();
    }
  });

  it("does not query managed gyms on mount", () => {
    render(React.createElement(TabsLayout));
    expect(mockUseManagedGyms).not.toHaveBeenCalled();
  });

  it("gives every tab a title and an icon", () => {
    render(React.createElement(TabsLayout));
    for (const screen of capturedScreens) {
      expect(typeof screen.options.title).toBe("string");
      expect(typeof screen.options.tabBarIcon).toBe("function");
    }
  });

  it("hands the Arena tab its badge and live state from the app-wide stores (jits-dq85.16)", () => {
    render(React.createElement(TabsLayout));
    expect(capturedTabBar.current).toBeTruthy();
    mockArenaState = { incomingCount: 5, isLive: true, hasConfirm: false, incomingKnown: true };
    const barProps = { state: { routes: [], index: 0 }, descriptors: {}, navigation: {} };
    render(capturedTabBar.current!(barProps) as React.ReactElement);
    expect(mockEloTabBar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...barProps,
        badges: { arena: { kind: "count", count: 5, label: "5 challenges" } },
        live: { arena: true },
      }),
    );

    // 1 to 3 pending: the icon draws them as embers.
    mockArenaState = { incomingCount: 2, isLive: false, hasConfirm: false, incomingKnown: true };
    render(capturedTabBar.current!(barProps) as React.ReactElement);
    expect(mockEloTabBar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        badges: { arena: { kind: "count", count: 2, label: "2 challenges", inIcon: true } },
        live: { arena: false },
      }),
    );

    mockArenaState = { incomingCount: 0, isLive: false, hasConfirm: false, incomingKnown: true };
    render(capturedTabBar.current!(barProps) as React.ReactElement);
    expect(mockEloTabBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ badges: { arena: null } }),
    );
  });

  it("labels the five tabs Home, Arena, Matches, Rankings, Profile (AC 1.1)", () => {
    render(React.createElement(TabsLayout));
    expect(capturedScreens.map((s) => s.options.title)).toEqual(["Home", "Arena", "Matches", "Rankings", "Profile"]);
  });

  it("draws the Matches tab with the lucide Film icon, in the tab's color and size", () => {
    render(React.createElement(TabsLayout));
    const matches = capturedScreens.find((s) => s.name === "matches")!;
    const icon = (matches.options.tabBarIcon as (p: unknown) => React.ReactElement)({ focused: false, color: "#7A8794", size: 18 });
    const { getByTestId } = render(icon);
    expect(getByTestId("lucide-Film").props).toMatchObject({ color: "#7A8794", size: 18 });
  });

  it("gives the Matches tab no badge: the Arena's is the only tab badge (PM9)", () => {
    render(React.createElement(TabsLayout));
    const matches = capturedScreens.find((s) => s.name === "matches")!;
    expect(matches.options.tabBarBadge).toBeUndefined();
    mockArenaState = { incomingCount: 3, isLive: true, hasConfirm: true, incomingKnown: true };
    const barProps = { state: { routes: [], index: 0 }, descriptors: {}, navigation: {} };
    render(capturedTabBar.current!(barProps) as React.ReactElement);
    const props = mockEloTabBar.mock.calls[mockEloTabBar.mock.calls.length - 1][0] as { badges: Record<string, unknown>; live: Record<string, unknown> };
    expect(Object.keys(props.badges)).toEqual(["arena"]);
    expect(Object.keys(props.live)).toEqual(["arena"]);
  });

  it("has a matches route directory with an index screen and a layout", () => {
    const dir = fs.readdirSync(path.join(TABS_DIR, "matches")).sort();
    expect(dir).toEqual(["_layout.tsx", "index.tsx"]);
  });

  it("draws the Arena tab with the Arena icon fed by the bar's signals", () => {
    render(React.createElement(TabsLayout));
    const arena = capturedScreens.find((s) => s.name === "arena")!;
    const icon = (arena.options.tabBarIcon as (p: unknown) => React.ReactElement)({
      focused: true,
      color: "#fff",
      size: 18,
    });
    // Rendered inside the bar's provider, the icon sees live and the count.
    mockArenaState = { incomingCount: 2, isLive: true, hasConfirm: false, incomingKnown: true };
    mockEloTabBar.mockImplementationOnce(() => icon as never);
    const barProps = { state: { routes: [], index: 0 }, descriptors: {}, navigation: {} };
    render(capturedTabBar.current!(barProps) as React.ReactElement);
    expect(mockArenaIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({ focused: true, color: "#fff", size: 18, live: true, incomingCount: 2, incomingKnown: true }),
    );
  });
});
