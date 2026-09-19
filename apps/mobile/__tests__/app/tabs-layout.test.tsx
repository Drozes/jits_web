import * as React from "react";
import { render } from "@testing-library/react-native";

/**
 * Guards the shape of the bottom tab navigator itself.
 *
 * EloTabBar renders whatever `(tabs)/_layout.tsx` registers, so the registration
 * is where a stray tab would reappear: dropping a route directory into the
 * `(tabs)` group silently adds a tab. These assertions fail loudly if that
 * happens, and are the reason the gym routes were moved OUT of the group rather
 * than merely unregistered.
 */

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

describe("(tabs)/_layout", () => {
  it("registers exactly the shipped tabs, in bar order", () => {
    render(React.createElement(TabsLayout));
    // Arena is added to this list, second, when its route lands. Until then a
    // Tabs.Screen for it would crash: React Navigation throws on a screen whose
    // route file does not exist.
    expect(capturedScreens.map((s) => s.name)).toEqual([
      "(home)",
      "leaderboard",
      "profile",
    ]);
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
