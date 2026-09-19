import * as React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    textTertiary: "#7A8794",
  }),
}));

import { EloTabBar } from "@/components/layout/elo-tab-bar";

type Screen = { name: string; title: string; hidden?: boolean };

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * Builds the slice of BottomTabBarProps the bar actually reads. The real
 * navigator supplies far more; constructing it by hand keeps this a unit test
 * of the bar's own rendering rules.
 */
function buildProps(screens: Screen[], activeIndex = 0): BottomTabBarProps {
  const routes = screens.map((s, i) => ({
    key: `${s.name}-${i}`,
    name: s.name,
    params: undefined,
  }));
  const descriptors: Record<string, unknown> = {};
  routes.forEach((route, i) => {
    descriptors[route.key] = {
      options: {
        title: screens[i].title,
        tabBarIcon: () => null,
        // Expo Router compiles `href: null` down to exactly this.
        ...(screens[i].hidden ? { tabBarButton: () => null } : {}),
      },
    };
  });

  return {
    state: { index: activeIndex, routes },
    descriptors,
    navigation: { navigate: mockNavigate, emit: mockEmit },
  } as unknown as BottomTabBarProps;
}

// The shipped bar. Arena is added to this list in the Arena wave, taking the
// bar to its target 4-up; nothing else about the bar changes for it.
const CURRENT_TABS: Screen[] = [
  { name: "(home)", title: "Home" },
  { name: "leaderboard", title: "Rankings" },
  { name: "profile", title: "Profile" },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("EloTabBar", () => {
  it("renders exactly one column per registered tab, in order", () => {
    const { getAllByRole } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS)),
    );
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(CURRENT_TABS.length);
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      "Home",
      "Rankings",
      "Profile",
    ]);
  });

  it("renders no gym tabs", () => {
    const { queryByLabelText } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS)),
    );
    // Both gym surfaces live outside the `(tabs)` group now: /gyms is entered
    // from Home, /gym-manager from the manager affordance on /gyms/[id].
    expect(queryByLabelText("Gyms")).toBeNull();
    expect(queryByLabelText("Gym")).toBeNull();
  });

  it("marks only the active tab as selected", () => {
    const { getAllByRole } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS, 1)),
    );
    const selected = getAllByRole("button").map(
      (b) => b.props.accessibilityState?.selected === true,
    );
    expect(selected).toEqual([false, true, false]);
  });

  it("navigates to the pressed tab and not to the active one", () => {
    const { getByLabelText } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS)),
    );

    fireEvent.press(getByLabelText("Rankings"));
    expect(mockNavigate).toHaveBeenCalledWith("leaderboard", undefined);

    mockNavigate.mockClear();
    fireEvent.press(getByLabelText("Home"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("honors the Expo Router hidden-tab contract (href: null)", () => {
    const { getAllByRole, queryByLabelText } = render(
      React.createElement(
        EloTabBar,
        buildProps([...CURRENT_TABS, { name: "secret", title: "Secret", hidden: true }]),
      ),
    );
    expect(getAllByRole("button")).toHaveLength(CURRENT_TABS.length);
    expect(queryByLabelText("Secret")).toBeNull();
  });
});
