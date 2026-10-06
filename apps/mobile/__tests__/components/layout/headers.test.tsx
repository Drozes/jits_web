/**
 * Header chrome (spec 4.1, AC-H1; decision Q1): the four tab roots carry the
 * interactive status chip then the bell, and nothing else on the right;
 * pushed screens keep only a small NON-interactive live dot.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";

type HostNode = ReturnType<typeof render>["UNSAFE_root"];

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule" ? true : stub,
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#9CA3AF" }),
}));

jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "notification-bell" });
  },
}));

jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useOnMatCount: () => 4,
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useMatchToConfirm: () => null,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

import { AppHeader } from "@/components/layout/app-header";
import { BRAND_WORDMARK_MAX_FONT_SCALE, BrandHeader } from "@/components/layout/brand-header";
import { TabHeader } from "@/components/layout/tab-header";
import { HeaderLiveDot } from "@/components/layout/header-live-dot";
import { LiveDot } from "@/components/ui/elo-system/live-pill";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";

function setLive(isLive: boolean) {
  act(() => {
    publishArenaState({ ...IDLE_ARENA_STATE, isLive });
  });
}

function testIds(root: HostNode): string[] {
  return root
    .findAll((n: HostNode) => typeof n.type === "string" && typeof n.props.testID === "string")
    .map((n: HostNode) => n.props.testID as string);
}

/** Interactive elements (buttons) under the tree, by accessibility label. */
function buttons(root: HostNode): string[] {
  return root
    .findAll(
      (n: HostNode) => typeof n.type === "string" && n.props.accessibilityRole === "button",
    )
    .map((n: HostNode) => String(n.props.accessibilityLabel ?? n.props.testID));
}

beforeEach(() => {
  __resetArenaStoreForTests();
});

describe("BrandHeader (Home, Rankings)", () => {
  it.each([false, true])(
    "shows the chip then the bell on the right, live=%s (AC-H1)",
    (isLive) => {
      setLive(isLive);
      const { UNSAFE_root, getByTestId } = render(<BrandHeader />);
      const ids = testIds(UNSAFE_root);
      expect(getByTestId("header-status-chip")).toBeTruthy();
      expect(ids.indexOf("header-status-chip")).toBeLessThan(ids.indexOf("notification-bell"));
      // The chip is the only header button (the bell is stubbed here).
      expect(buttons(UNSAFE_root)).toHaveLength(1);
      expect(ids).not.toContain("header-live-dot");
    },
  );

  it("offline still offers going live from the header", () => {
    const { getByLabelText } = render(<BrandHeader />);
    expect(getByLabelText("Live status: 4 on the mat. Go live")).toBeTruthy();
  });

  it("the wordmark does not grow with Dynamic Type, so it cannot squeeze the chip (AC-H12)", () => {
    const { getByText } = render(<BrandHeader />);
    expect(BRAND_WORDMARK_MAX_FONT_SCALE).toBe(1);
    expect(getByText("ELO RATED").props.maxFontSizeMultiplier).toBe(
      BRAND_WORDMARK_MAX_FONT_SCALE,
    );
  });
});

describe("TabHeader (Arena, Profile)", () => {
  it.each(["Arena", "Profile"])(
    "puts the %s title at the left, then the chip and the bell (AC-H1)",
    (title) => {
      const { UNSAFE_root, getByRole } = render(<TabHeader title={title} />);
      const header = getByRole("header");
      expect(header.props.children).toBe(title);
      expect(header.props.className).toContain("uppercase");
      expect(header.props.className).toContain("font-heading");

      const order = UNSAFE_root.findAll(
        (n: HostNode) =>
          typeof n.type === "string" &&
          (n.props.accessibilityRole === "header" || typeof n.props.testID === "string"),
      ).map((n: HostNode) => (n.props.accessibilityRole === "header" ? "title" : n.props.testID));
      expect(order.indexOf("title")).toBeLessThan(order.indexOf("header-status-chip"));
      expect(order.indexOf("header-status-chip")).toBeLessThan(order.indexOf("notification-bell"));
      expect(buttons(UNSAFE_root)).toHaveLength(1);
    },
  );

  it("tags the title for the match-loop harness's tab proof (tab-header-title-<tab>)", () => {
    const { getByTestId } = render(<TabHeader title="Matches" />);
    expect(getByTestId("tab-header-title-matches").props.accessibilityRole).toBe("header");
  });
});

describe("AppHeader (pushed screens, decision Q1)", () => {
  it("shows a non-interactive live dot while live, never the chip", () => {
    setLive(true);
    const { getByTestId, queryByTestId, getByLabelText, UNSAFE_root } = render(
      <AppHeader title="Match" />,
    );
    expect(getByTestId("header-live-dot")).toBeTruthy();
    expect(getByLabelText("You are live in the Arena")).toBeTruthy();
    expect(queryByTestId("header-status-chip")).toBeNull();
    // Nothing to tap: the dot is not a button and has no press handler.
    expect(buttons(UNSAFE_root)).toHaveLength(0);
    expect(getByTestId("header-live-dot").props.onPress).toBeUndefined();
  });

  it("shows nothing while offline", () => {
    const { queryByTestId } = render(<AppHeader title="Settings" back />);
    expect(queryByTestId("header-live-dot")).toBeNull();
  });

  it("keeps the dot before a right action, and hides it when going offline", () => {
    setLive(true);
    const { UNSAFE_root, queryByTestId } = render(
      <AppHeader title="Athlete" back rightAction={<Text testID="share">Share</Text>} />,
    );
    const ids = testIds(UNSAFE_root);
    expect(ids.indexOf("header-live-dot")).toBeLessThan(ids.indexOf("share"));
    setLive(false);
    expect(queryByTestId("header-live-dot")).toBeNull();
  });
});

describe("HeaderLiveDot", () => {
  it("renders only while live", () => {
    const { queryByTestId } = render(<HeaderLiveDot />);
    expect(queryByTestId("header-live-dot")).toBeNull();
    setLive(true);
    expect(queryByTestId("header-live-dot")).toBeTruthy();
  });

  it("is its own small mark, not the chip's LiveDot, on the one shared pulse clock (Motion Rule)", () => {
    // Adding Flare: every live dot breathes on the ONE Arena tempo clock
    // (lib/arena/arena-tempo.ts), so this dot pulsing keeps one rhythm. Its
    // phase and Reduce Motion behaviour are covered in arena-tempo.test.tsx.
    setLive(true);
    const { UNSAFE_root, getByTestId } = render(<HeaderLiveDot />);
    expect(UNSAFE_root.findAllByType(LiveDot)).toHaveLength(0);
    expect(getByTestId("header-live-dot-mark")).toBeTruthy();
  });
});
