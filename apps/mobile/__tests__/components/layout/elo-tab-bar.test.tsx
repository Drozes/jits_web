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

// Observe the bounce's animation calls (the jest renderer does not run them).
const mockWithTiming = jest.fn();
const mockWithSpring = jest.fn();
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (...args: unknown[]) => {
      mockWithTiming(...args);
      return actual.withTiming(...args);
    },
    withSpring: (...args: unknown[]) => {
      mockWithSpring(...args);
      return actual.withSpring(...args);
    },
  };
});

jest.mock("@/lib/motion/haptics", () => ({
  haptics: new Proxy(
    {},
    {
      get: (target: Record<string, jest.Mock>, prop: string) => {
        if (!target[prop]) target[prop] = jest.fn(() => Promise.resolve());
        return target[prop];
      },
    },
  ),
}));

import {
  EloTabBar,
  resolveTabBadge,
  tabValueText,
  type TabBadges,
} from "@/components/layout/elo-tab-bar";
import { haptics } from "@/lib/motion/haptics";
import { __setReduceMotionForTests } from "@/lib/motion";
import { TRACKING, typeStep } from "@/lib/typography";
import { loadFontMetrics, measureLine, resolveFromNodeModules } from "../../support/ttf-advance";

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

// The shipped bar, 5-up since the Matches tab (spec specs/matches-tab/spec.md
// 4.1). The bar itself is count-agnostic: its columns are flex-1 and the list
// comes off the navigator, so adding Arena and then Matches changed nothing in
// the component.
const CURRENT_TABS: Screen[] = [
  { name: "(home)", title: "Home" },
  { name: "arena", title: "Arena" },
  { name: "matches", title: "Matches" },
  { name: "leaderboard", title: "Rankings" },
  { name: "profile", title: "Profile" },
];
const CURRENT_LABELS = CURRENT_TABS.map((t) => t.title);

beforeEach(() => {
  jest.clearAllMocks();
  __setReduceMotionForTests(false);
});

afterEach(() => {
  __setReduceMotionForTests(false);
});

describe("EloTabBar", () => {
  it("renders exactly one column per registered tab, in order", () => {
    const { getAllByRole } = render(
      React.createElement(EloTabBar, buildProps(CURRENT_TABS)),
    );
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(CURRENT_TABS.length);
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(["Home", "Arena", "Matches", "Rankings", "Profile"]);
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

describe("EloTabBar at five tabs (spec specs/matches-tab/spec.md 4.1, AC 1.3)", () => {
  // The label is DM Sans Bold (font-heading) at text-micro, uppercase, with
  // tracking-caps-l. Measured from the font file's own advance widths, so a
  // longer label, a bigger size token or a wider tracking fails here first.
  const font = loadFontMetrics(resolveFromNodeModules("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"));
  const labelWidth = (label: string) =>
    measureLine(font, label.toUpperCase(), typeStep("micro").fontSize, TRACKING["caps-l"]);

  it("draws every label with the measured style (font-heading, text-micro, caps, tracking-caps-l)", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    for (const title of CURRENT_LABELS) {
      const classes = String(u.getByText(title).props.className).split(/\s+/);
      for (const token of ["font-heading", "text-micro", "uppercase", "tracking-caps-l"]) {
        expect(classes).toContain(token);
      }
    }
  });

  it("caps every label at 1.15x Dynamic Type, and the widest still fits at that size", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    for (const title of CURRENT_LABELS) {
      expect(u.getByText(title).props.maxFontSizeMultiplier).toBe(1.15);
    }
    // Font size and tracking both scale with the multiplier.
    const column = 375 / CURRENT_TABS.length;
    const overflow = CURRENT_LABELS.filter((title) => labelWidth(title) * 1.15 > column);
    expect(overflow).toEqual([]);
  });

  it.each([375, 390])("fits every label on one line in a %i pt wide bar, with 4 pt to spare each side", (screenWidth) => {
    const column = screenWidth / CURRENT_TABS.length;
    // Keyed by label so a failure names the tab that overflows.
    const overflow = CURRENT_LABELS.filter((title) => labelWidth(title) > column - 8);
    expect(overflow).toEqual([]);
  });

  it("measures a sane width (the font parser is reading real advances)", () => {
    // Guards the measurement itself: an all-zero or garbage read would pass
    // the fit test above vacuously.
    expect(labelWidth("Rankings")).toBeGreaterThan(50);
    expect(labelWidth("MMMMMMMM")).toBeGreaterThan(75);
  });

  it("gives the Matches tab no badge mark", () => {
    const u = render(React.createElement(EloTabBar, { ...buildProps(CURRENT_TABS), badges: { arena: { kind: "count", count: 2 } } }));
    expect(u.queryByTestId(/^tab-badge-.*matches$/)).toBeNull();
    expect(u.getByLabelText("Matches").props.accessibilityValue?.text).toBeUndefined();
  });

  it("navigates to the Matches tab", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Matches"));
    expect(mockNavigate).toHaveBeenCalledWith("matches", undefined);
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
    expect(u.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(CURRENT_LABELS);
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

describe("tab select bounce and haptic (Adding Flare [10.2])", () => {
  it("fires the select haptic when a tab that is not active is pressed", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Arena"));
    expect(haptics.select).toHaveBeenCalledTimes(1);
  });

  it("does nothing for the active tab", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Home"));
    expect(haptics.select).not.toHaveBeenCalled();
  });

  it("does nothing when the tabPress was prevented", () => {
    mockEmit.mockReturnValueOnce({ defaultPrevented: true });
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Profile"));
    expect(haptics.select).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("squashes the pressed icon and springs it back (select spring)", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Arena"));
    expect(mockWithTiming).toHaveBeenCalledWith(0.86, expect.objectContaining({ duration: 100 }));
    expect(mockWithSpring).toHaveBeenCalledWith(1, { damping: 14, stiffness: 260 });
  });

  it("does not bounce the active tab", () => {
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Home"));
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  it("does not scale under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Arena"));
    expect(mockWithTiming).not.toHaveBeenCalledWith(0.86, expect.anything());
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  it("keeps the haptic under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const u = render(React.createElement(EloTabBar, buildProps(CURRENT_TABS)));
    fireEvent.press(u.getByLabelText("Rankings"));
    expect(haptics.select).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("leaderboard", undefined);
  });
});

describe("countable embers and live (Adding Flare [09.2])", () => {
  function renderWith(badges: TabBadges, live?: Record<string, boolean>) {
    return render(React.createElement(EloTabBar, { ...buildProps(CURRENT_TABS), badges, live }));
  }

  it("draws no pill for a count the icon draws, but VoiceOver still reads it", () => {
    const u = renderWith({ arena: { kind: "count", count: 2, label: "2 challenges", inIcon: true } });
    expect(u.queryByTestId("tab-badge-count-arena")).toBeNull();
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "2 challenges" });
  });

  it("adds live to the spoken value when a count overrides the live dot", () => {
    const u = renderWith(
      { arena: { kind: "count", count: 2, label: "2 challenges", inIcon: true } },
      { arena: true },
    );
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "2 challenges, live" });
  });

  it("does not repeat live when the dot already says it", () => {
    const u = renderWith({ arena: { kind: "dot", label: "Live" } }, { arena: true });
    expect(u.getByLabelText("Arena").props.accessibilityValue).toMatchObject({ text: "Live" });
    expect(u.getByTestId("tab-badge-dot-arena")).toBeTruthy();
  });

  it.each([
    [null, false, undefined],
    [null, true, "Live"],
    [{ kind: "count", count: 5, label: "5 challenges" }, true, "5 challenges, live"],
    [{ kind: "dot", label: "Live, result to confirm" }, true, "Live, result to confirm"],
    [{ kind: "ring", label: "Result to confirm" }, false, "Result to confirm"],
  ] as const)("tabValueText(%p, %p) -> %p", (badge, live, expected) => {
    expect(tabValueText(badge as never, live)).toBe(expected);
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
    // A count the icon draws keeps that mark through normalisation.
    [{ kind: "count", count: 2, label: "2 challenges", inIcon: true }, undefined, { kind: "count", count: 2, label: "2 challenges", inIcon: true }],
  ] as const)("explicit %p, tabBarBadge %p -> %p", (explicit, option, expected) => {
    expect(resolveTabBadge(explicit as never, option)).toEqual(expected);
  });
});
