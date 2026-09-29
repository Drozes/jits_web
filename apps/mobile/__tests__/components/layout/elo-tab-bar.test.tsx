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

import { EloTabBar, resolveTabBadge, type TabBadges } from "@/components/layout/elo-tab-bar";

type Screen = { name: string; title: string; hidden?: boolean };

const mockNavigate = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));

/**
 * Builds the slice of BottomTabBarProps the bar actually reads. The real
 * navigator supplies far more; constructing it by hand keeps this a unit test
 * of the bar's own rendering rules.
 */
function buildProps(
  screens: (Screen & { tabBarBadge?: string | number })[],
  activeIndex = 0,
): BottomTabBarProps {
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
        ...(screens[i].tabBarBadge !== undefined ? { tabBarBadge: screens[i].tabBarBadge } : {}),
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

// The shipped bar, at its target 4-up. The bar itself is count-agnostic: its
// columns are flex-1 and the list comes off the navigator, so adding Arena
// changed nothing in the component.
const CURRENT_TABS: Screen[] = [
  { name: "(home)", title: "Home" },
  { name: "arena", title: "Arena" },
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
      "Arena",
      "Rankings",
      "Profile",
    ]);
  });

  it("renders no gym tabs", () => {
    const { queryByLabelText } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS)),
    );
    // Mobile has no gym surfaces at all: the gym list, gym detail and the
    // gym-manager portal were removed (jits-gewv).
    expect(queryByLabelText("Gyms")).toBeNull();
    expect(queryByLabelText("Gym")).toBeNull();
  });

  it("marks only the active tab as selected", () => {
    const ACTIVE = 1; // Arena
    const { getAllByRole } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS, ACTIVE)),
    );
    const selected = getAllByRole("button").map(
      (b) => b.props.accessibilityState?.selected === true,
    );
    // Derived from the tab list rather than hardcoded, so adding a tab cannot
    // leave this asserting a shorter bar than the one being rendered.
    expect(selected).toEqual(CURRENT_TABS.map((_, i) => i === ACTIVE));
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

describe("EloTabBar badges (jits-dq85.9)", () => {
  function renderWith(badges: TabBadges, screens = CURRENT_TABS) {
    return render(React.createElement(EloTabBar, { ...buildProps(screens), badges }));
  }

  it("shows a red count on the Arena tab (AC-T1)", () => {
    const u = renderWith({ arena: { kind: "count", count: 2, label: "2 challenges" } });
    expect(u.getByTestId("tab-badge-count-arena")).toHaveTextContent("2");
    expect(u.getByTestId("tab-badge-count-arena").props.className).toMatch(/\bbg-cta\b/);
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "2 challenges" });
  });

  it("caps the count at 99+ and defaults its spoken text to N new", () => {
    const u = renderWith({ arena: { kind: "count", count: 120 } });
    expect(u.getByTestId("tab-badge-count-arena")).toHaveTextContent("99+");
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "120 new" });
  });

  it("a labelled positive count reads its number, like the pill shows it", () => {
    const a = renderWith({ arena: { kind: "count", count: 3, label: "NEW" } });
    expect(a.getByTestId("tab-badge-count-arena")).toHaveTextContent("3");
    expect(a.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "3 NEW" });
    a.unmount();
    // A label that already states the number is not doubled, and a digit
    // inside a larger number does not count as stating it.
    const b = renderWith({ arena: { kind: "count", count: 2, label: "2 challenges waiting" } });
    expect(b.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "2 challenges waiting" });
    b.unmount();
    const c = renderWith({ arena: { kind: "count", count: 2, label: "of 12 open" } });
    expect(c.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "2 of 12 open" });
  });

  it("shows nothing for a zero count", () => {
    const u = renderWith({ arena: { kind: "count", count: 0 } });
    expect(u.queryByTestId("tab-badge-count-arena")).toBeNull();
    expect(u.getByLabelText("Arena").props.accessibilityValue?.text).toBeUndefined();
  });

  it("never draws a red text badge: a labelled zero count and a non-numeric tabBarBadge show nothing", () => {
    const a = renderWith({ arena: { kind: "count", count: 0, label: "NEW" } });
    expect(a.queryByTestId("tab-badge-count-arena")).toBeNull();
    expect(a.getByLabelText("Arena").props.accessibilityValue?.text).toBeUndefined();
    a.unmount();
    const b = render(
      React.createElement(EloTabBar, buildProps([{ name: "arena", title: "Arena", tabBarBadge: "NEW" }])),
    );
    expect(b.queryByTestId("tab-badge-count-arena")).toBeNull();
    expect(b.queryByText("NEW")).toBeNull();
  });

  it("the count pill grows with Dynamic Type instead of clipping, capped at 1.3x", () => {
    const u = renderWith({ arena: { kind: "count", count: 99 } });
    const pill = u.getByTestId("tab-badge-count-arena");
    expect(pill.props.className).toMatch(/\bmin-h-4\b/);
    // Brand radius (2px), not a full pill.
    expect(pill.props.className).toMatch(/\brounded-xs\b/);
    expect(pill.props.className).not.toMatch(/rounded-full/);
    expect(pill.props.className).not.toMatch(/(^|\s)h-4\b/);
    expect(u.getByText("99").props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("shows a static green dot (AC-T2)", () => {
    const u = renderWith({ arena: { kind: "dot", label: "Live" } });
    const dot = u.getByTestId("tab-badge-dot-arena");
    expect(dot.props.className).toMatch(/\bbg-positive\b/);
    expect(dot.props.className).not.toMatch(/animate/);
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "Live" });
  });

  it("shows a hollow ring (AC-T3)", () => {
    const u = renderWith({ arena: { kind: "ring", label: "Result to confirm" } });
    const ring = u.getByTestId("tab-badge-ring-arena");
    expect(ring.props.className).toMatch(/\bborder-ink-3\b/);
    expect(ring.props.className).not.toMatch(/\bbg-/);
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "Result to confirm" });
  });

  it("shows nothing without a badge (AC-T4)", () => {
    const u = renderWith({ arena: null });
    expect(u.queryByTestId(/^tab-badge-/)).toBeNull();
  });

  it("keeps every tab's accessibility LABEL exactly its title (the harness finds tabs by it)", () => {
    const u = renderWith({
      arena: { kind: "count", count: 3 },
      profile: { kind: "ring", label: "Something" },
    });
    expect(u.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual([
      "Home",
      "Arena",
      "Rankings",
      "Profile",
    ]);
    // Only the badged tabs carry a badge.
    expect(u.queryByTestId("tab-badge-count-(home)")).toBeNull();
    expect(u.getByTestId("tab-badge-ring-profile")).toBeTruthy();
  });

  it("honours React Navigation's tabBarBadge option as a count", () => {
    const u = render(
      React.createElement(
        EloTabBar,
        buildProps([{ name: "arena", title: "Arena", tabBarBadge: 4 }]),
      ),
    );
    expect(u.getByTestId("tab-badge-count-arena")).toHaveTextContent("4");
  });

  it("an explicit badge wins over tabBarBadge", () => {
    const u = render(
      React.createElement(EloTabBar, {
        ...buildProps([{ name: "arena", title: "Arena", tabBarBadge: 4 }]),
        badges: { arena: { kind: "dot", label: "Live" } },
      }),
    );
    expect(u.queryByTestId("tab-badge-count-arena")).toBeNull();
    expect(u.getByTestId("tab-badge-dot-arena")).toBeTruthy();
  });
});

describe("resolveTabBadge", () => {
  it.each([
    [undefined, undefined, null],
    [null, undefined, null],
    [undefined, 0, null],
    [undefined, "", null],
    [undefined, "0", null],
    [undefined, 3, { kind: "count", count: 3 }],
    [undefined, "7", { kind: "count", count: 7 }],
    // Red means a count only: a non-numeric string is no badge.
    [undefined, "NEW", null],
    [{ kind: "count", count: -1 }, 5, null],
    [{ kind: "count", count: Number.NaN }, undefined, null],
    [{ kind: "ring", label: "r" }, 5, { kind: "ring", label: "r" }],
    // One rule for both sources: a non-positive count is no badge, label or not.
    [{ kind: "count", count: 0, label: "NEW" }, undefined, null],
    [{ kind: "count", count: -2, label: "NEW" }, undefined, null],
    [{ kind: "count", count: Number.POSITIVE_INFINITY, label: "NEW" }, undefined, null],
    [{ kind: "count", count: 0 }, undefined, null],
    // Counts are floored to whole numbers.
    [{ kind: "count", count: 2.5 }, undefined, { kind: "count", count: 2 }],
    [{ kind: "count", count: 4.9, label: "4 challenges" }, undefined, { kind: "count", count: 4, label: "4 challenges" }],
    [{ kind: "count", count: 0.5 }, undefined, null],
    [undefined, 2.5, { kind: "count", count: 2 }],
    [undefined, "0.5", null],
  ] as const)("explicit %p, tabBarBadge %p -> %p", (explicit, option, expected) => {
    expect(resolveTabBadge(explicit as never, option)).toEqual(expected);
  });
});
