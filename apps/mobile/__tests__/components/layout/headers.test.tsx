/**
 * Header chrome (spec 4.1, AC-H1; decision Q1; jits-1ez5.1): every tab root
 * carries one BrandHeader: the wordmark, a rule and the athlete's rating on
 * the left, the interactive status chip then the bell on the right, and no
 * drawn tab title; pushed screens keep only a small NON-interactive live dot.
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
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

const mockAthlete = { id: "a1", current_elo: 1512, highest_elo: 1540, primary_gym_id: null };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: mockAthlete }),
}));

// The sheet itself is covered in your-numbers-sheet.test.tsx.
jest.mock("@/components/layout/your-numbers-sheet", () => ({
  YourNumbersSheet: ({ open }: { open: boolean }) => {
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: open ? "your-numbers-open" : "your-numbers-closed" });
  },
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
import { HEADER_ELO_TARGET_HEIGHT } from "@/components/layout/header-elo";
import { HEADER_ELO_MAX_FONT_SCALE } from "@/lib/rating/header-elo";
import { CHIP_MAX_FONT_SCALE } from "@/lib/arena/header-chip-model";
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

const TAB_ROOTS: [string, string][] = [
  ["Home", "app/(app)/(tabs)/(home)/index.tsx"],
  ["Arena", "app/(app)/(tabs)/arena/index.tsx"],
  ["Film", "app/(app)/(tabs)/matches/index.tsx"],
  ["Rankings", "app/(app)/(tabs)/leaderboard/index.tsx"],
  ["Profile", "app/(app)/(tabs)/profile/index.tsx"],
];

describe("BrandHeader (every tab root)", () => {
  it.each([false, true])(
    "shows the chip then the bell on the right, live=%s (AC-H1)",
    (isLive) => {
      setLive(isLive);
      const { UNSAFE_root, getByTestId } = render(<BrandHeader title="Home" />);
      const ids = testIds(UNSAFE_root);
      expect(getByTestId("header-status-chip")).toBeTruthy();
      expect(ids.indexOf("header-status-chip")).toBeLessThan(ids.indexOf("notification-bell"));
      // The rating and the chip are the header's buttons (the bell is stubbed here).
      const all = buttons(UNSAFE_root);
      expect(all).toHaveLength(2);
      expect(all[0]).toBe("Your rating 1512");
      expect(ids).not.toContain("header-live-dot");
    },
  );

  it("offline still offers going live from the header", () => {
    const { getByLabelText } = render(<BrandHeader title="Home" />);
    expect(getByLabelText("Live status: 4 on the mat. Go live")).toBeTruthy();
  });

  it("draws the wordmark, the rule, then the rating, all before the chip (jits-1ez5.1)", () => {
    const { UNSAFE_root, getByTestId } = render(<BrandHeader title="Arena" onArena />);
    const ids = testIds(UNSAFE_root);
    expect(ids.indexOf("header-elo-rule")).toBeLessThan(ids.indexOf("header-elo"));
    expect(ids.indexOf("header-elo")).toBeLessThan(ids.indexOf("header-status-chip"));
    expect(getByTestId("header-elo-value").props.children).toBe(1512);
    const wordmark = UNSAFE_root.find(
      (n: HostNode) => typeof n.type === "string" && n.props.children === "ELO RATED",
    );
    // The logo is decorative: VoiceOver skips it, the rating is the stop.
    expect(wordmark.props.accessibilityElementsHidden).toBe(true);
  });

  it("keeps the 16pt gutter on both sides (the side safe area when wider), as TabHeader had", () => {
    const { UNSAFE_root } = render(<BrandHeader title="Arena" onArena />);
    const bar = UNSAFE_root.find(
      (n: HostNode) => typeof n.type === "string" && typeof n.props.className === "string" && n.props.className.includes("bg-surface-2"),
    );
    expect(bar.props.style).toMatchObject({ paddingLeft: 16, paddingRight: 16, height: 56 });
    expect(bar.props.className).not.toContain("px-4");
  });

  it("the rating is one button: label, hint and a 44pt tall target that opens Your numbers", () => {
    const { getByTestId, queryByTestId } = render(<BrandHeader title="Home" />);
    const rating = getByTestId("header-elo");
    expect(rating.props.accessibilityRole).toBe("button");
    expect(rating.props.accessibilityLabel).toBe("Your rating 1512");
    expect(rating.props.accessibilityHint).toBe("Opens your numbers");
    expect(HEADER_ELO_TARGET_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(queryByTestId("your-numbers-open")).toBeNull();
    fireEvent.press(rating);
    expect(getByTestId("your-numbers-open")).toBeTruthy();
  });

  it("the wordmark does not grow with Dynamic Type; the rating stops at the chip's 1.3x (AC-H12)", () => {
    const { UNSAFE_root, getByTestId } = render(<BrandHeader title="Home" />);
    expect(BRAND_WORDMARK_MAX_FONT_SCALE).toBe(1);
    const wordmark = UNSAFE_root.find(
      (n: HostNode) => typeof n.type === "string" && n.props.children === "ELO RATED",
    );
    expect(wordmark.props.maxFontSizeMultiplier).toBe(BRAND_WORDMARK_MAX_FONT_SCALE);
    expect(HEADER_ELO_MAX_FONT_SCALE).toBe(CHIP_MAX_FONT_SCALE);
    // The rating sizes itself from the text scale (capped there), OS scaling off;
    // header-elo.test.tsx covers 1x, 1.2x and AX sizes.
    expect(getByTestId("header-elo-value").props.allowFontScaling).toBe(false);
    expect(getByTestId("header-elo-value").props.numberOfLines).toBe(1);
  });

  it.each(TAB_ROOTS.map(([t]) => t))(
    "draws no %s title, but keeps an accessibility-only heading for it (tab-header-title-<tab>)",
    (title) => {
      const { getByTestId, queryByText } = render(<BrandHeader title={title} />);
      const heading = getByTestId(`tab-header-title-${title.toLowerCase()}`);
      expect(heading.props.accessibilityRole).toBe("header");
      expect(heading.props.children).toBe(title);
      // Out of the row and never visible.
      expect(heading.props.style).toMatchObject({ position: "absolute", color: "transparent" });
      expect(heading.props.className).toBeUndefined();
      expect(queryByText(title.toUpperCase())).toBeNull();
    },
  );

  it.each(TAB_ROOTS)("the %s tab root uses BrandHeader with its title, never TabHeader", (title, file) => {
    const src = fs.readFileSync(path.join(__dirname, "../../..", file), "utf8");
    expect(src).toContain(`<BrandHeader title="${title}"`);
    expect(src).not.toMatch(/TabHeader\b/);
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
