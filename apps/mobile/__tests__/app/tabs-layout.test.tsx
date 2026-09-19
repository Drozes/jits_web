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

jest.mock("expo-router", () => {
  const R = require("react");
  const RN = require("react-native");

  const Screen = (props: { name: string; options?: Record<string, unknown> }) => {
    capturedScreens.push({ name: props.name, options: props.options ?? {} });
    return null;
  };

  const Tabs = (props: { children: React.ReactNode }) =>
    R.createElement(RN.View, {}, props.children);
  Tabs.Screen = Screen;

  return { Tabs };
});

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, {});
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

jest.mock("@/components/layout/elo-tab-bar", () => ({
  EloTabBar: () => null,
}));

// If the layout ever reaches for managed gyms again, this mock records it. The
// tab it used to gate is gone, and the query cost every app launch.
const mockUseManagedGyms = jest.fn(() => ({ gyms: [], isReady: true }));
jest.mock("@/lib/gym-manager/use-managed-gyms", () => ({
  useManagedGyms: () => mockUseManagedGyms(),
}));

import TabsLayout from "@/app/(app)/(tabs)/_layout";

beforeEach(() => {
  capturedScreens.length = 0;
  mockUseManagedGyms.mockClear();
});

// The shipped 4-up, in bar order. Registration and route file stay in lockstep:
// expo-router silently drops a Screen whose route file is missing, so a name
// here with no directory under (tabs) renders no column rather than crashing.
// The on-disk assertion below is what catches that direction.
const EXPECTED_TABS = ["(home)", "arena", "leaderboard", "profile"];

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

  it("keeps the gym routes outside the group", () => {
    // They must stay siblings of (tabs) under (app): inside the group they
    // would be tabs again regardless of what _layout.tsx declares.
    const onDisk = fs.readdirSync(TABS_DIR);
    expect(onDisk).not.toContain("gyms");
    expect(onDisk).not.toContain("gym-manager");

    const appDir = path.join(TABS_DIR, "..");
    expect(fs.readdirSync(appDir)).toEqual(
      expect.arrayContaining(["gyms", "gym-manager"]),
    );
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
});
