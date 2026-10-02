/**
 * The Arena tab icon (Adding Flare, jits-pddd.2): ember rise while live,
 * countable embers for 1 to 3 pending challenges, the blade clash moment, and
 * the Reduce Motion still states. The clash plays on real transitions only,
 * and only the athlete's own go-live buzzes (`goLive`); a challenge arriving
 * is silent here because the challenge prompt sheet already buzzes for it.
 */
import * as React from "react";
import { configure, render } from "@testing-library/react-native";

// The icon is hidden from assistive tech on purpose; query it anyway.
configure({ defaultIncludeHiddenElements: true });

declare const __dirname: string;
const fs = require("fs") as {
  readFileSync: (p: string, enc: string) => string;
  existsSync: (p: string) => boolean;
};
const path = require("path") as { join: (...parts: string[]) => string };

jest.mock("@/lib/motion/haptics", () => {
  const events = [
    "press",
    "accept",
    "select",
    "goLive",
    "challengeArrived",
    "ratingGain",
    "matchStart",
    "matchEnd",
    "resultRecorded",
    "error",
    "countdownTick",
    "countdownGo",
    "tapTick",
    "timeWarning",
  ];
  const haptics: Record<string, jest.Mock> = {};
  for (const e of events) haptics[e] = jest.fn(() => Promise.resolve());
  return { haptics };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    brandOrange: "hsl(25, 95%, 53%)",
    accentCta: "#E63946",
    accentCtaText: "#EC6A74",
  }),
}));

let mockAthleteFlip = true;
jest.mock("@/lib/arena/arena-store", () => ({
  isAthleteGoLiveFlip: () => mockAthleteFlip,
}));

import {
  ArenaTabIcon,
  CLASH_SETTLE_MS,
  SWORDS_BLADE_A,
  SWORDS_BLADE_B,
  type ArenaTabIconProps,
} from "@/components/layout/arena-tab-icon";
import { haptics } from "@/lib/motion/haptics";
import { __resetAppActiveForTests, __setReduceMotionForTests } from "@/lib/motion";
import { AppState } from "react-native";

function setAppState(state: string) {
  Object.defineProperty(AppState, "currentState", { value: state, configurable: true, writable: true });
  __resetAppActiveForTests();
}

const mockHaptics = haptics as unknown as Record<string, jest.Mock>;

let now = 1_000_000;

beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  mockAthleteFlip = true;
  setAppState("active");
  __setReduceMotionForTests(false);
  for (const fn of Object.values(mockHaptics)) fn.mockClear();
});

afterEach(() => {
  __setReduceMotionForTests(false);
  jest.restoreAllMocks();
});

const BASE: ArenaTabIconProps = { color: "#E8EDF2", size: 18, live: false, incomingCount: 0 };

function renderIcon(props: Partial<ArenaTabIconProps> = {}) {
  const utils = render(<ArenaTabIcon {...BASE} {...props} />);
  const update = (next: Partial<ArenaTabIconProps>) =>
    utils.rerender(<ArenaTabIcon {...BASE} {...props} {...next} />);
  return { ...utils, update };
}

/** Haptic calls of any kind. */
function anyHaptic(): number {
  return Object.values(mockHaptics).reduce((n, fn) => n + fn.mock.calls.length, 0);
}

describe("the glyph", () => {
  it("is exactly lucide Swords (v1.16.0) split into two halves", () => {
    const candidates = [
      path.join(__dirname, "..", "..", "..", "node_modules", "lucide-react-native", "dist", "cjs", "icons", "swords.js"),
      path.join(__dirname, "..", "..", "..", "..", "..", "node_modules", "lucide-react-native", "dist", "cjs", "icons", "swords.js"),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    expect(file).toBeDefined();
    const src = fs.readFileSync(file!, "utf8");
    const match = src.match(/createLucideIcon\("Swords", (\[[\s\S]*?\])\);/);
    expect(match).not.toBeNull();
    // The node list is a plain JS literal in the published build.
    const lucide = new Function(`return ${match![1]}`)() as [string, Record<string, string>][];
    const stripped = lucide.map(([tag, { key: _key, ...attrs }]) => [tag, attrs]);
    expect([...SWORDS_BLADE_A, ...SWORDS_BLADE_B]).toEqual(stripped);
  });

  it("draws both halves at the tab size with lucide's stroke 2, at rest", () => {
    const u = renderIcon();
    for (const id of ["arena-blade-a", "arena-blade-b"]) {
      const svg = u.getByTestId(id);
      expect(svg.props).toMatchObject({
        width: 18,
        height: 18,
        fill: "none",
        stroke: "#E8EDF2",
        strokeWidth: 2,
      });
    }
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
  });

  it("is hidden from assistive tech (the tab button speaks for it)", () => {
    const u = renderIcon({ live: true });
    const root = u.getByTestId("arena-tab-icon");
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("ember rise [10.1]", () => {
  it("shows three rising embers while live with nothing pending", () => {
    const u = renderIcon({ live: true });
    expect(u.getByTestId("arena-embers-live")).toBeTruthy();
    expect(u.getAllByTestId(/^arena-ember-live-/)).toHaveLength(3);
  });

  it("shows no embers while offline", () => {
    const u = renderIcon({ live: false });
    expect(u.queryByTestId(/^arena-embers-/)).toBeNull();
  });

  it("Reduce Motion: one still ember above the crossing", () => {
    __setReduceMotionForTests(true);
    const u = renderIcon({ live: true });
    expect(u.queryByTestId("arena-embers-live")).toBeNull();
    expect(u.getByTestId("arena-embers-live-still")).toBeTruthy();
    expect(u.getAllByTestId(/^arena-ember-live-/)).toHaveLength(1);
  });

  it("is silent", () => {
    renderIcon({ live: true });
    expect(anyHaptic()).toBe(0);
  });
});

describe("countable embers [09.2]", () => {
  it.each([1, 2, 3])("shows one ember per pending challenge (%i), in place of the live embers", (n) => {
    const u = renderIcon({ live: true, incomingCount: n });
    expect(u.queryByTestId("arena-embers-live")).toBeNull();
    expect(u.getByTestId("arena-embers-count")).toBeTruthy();
    expect(u.getAllByTestId(/^arena-ember-count-/)).toHaveLength(n);
  });

  it("shows no embers above 3 (the count pill returns)", () => {
    const u = renderIcon({ live: true, incomingCount: 4 });
    expect(u.queryByTestId(/^arena-embers-/)).toBeNull();
  });

  it("holds the embers still while the Arena tab is focused", () => {
    const u = renderIcon({ incomingCount: 2, focused: true });
    expect(u.queryByTestId("arena-embers-count")).toBeNull();
    expect(u.getByTestId("arena-embers-count-still")).toBeTruthy();
    expect(u.getAllByTestId(/^arena-ember-count-/)).toHaveLength(2);
  });

  it("Reduce Motion: N still embers", () => {
    __setReduceMotionForTests(true);
    const u = renderIcon({ incomingCount: 3 });
    expect(u.getByTestId("arena-embers-count-still")).toBeTruthy();
    expect(u.getAllByTestId(/^arena-ember-count-/)).toHaveLength(3);
  });
});

describe("blade clash [04.1 + 11.1]", () => {
  it("plays once with the goLive haptic when the athlete goes live", () => {
    const u = renderIcon({ live: false });
    u.update({ live: true });
    expect(mockHaptics.goLive).toHaveBeenCalledTimes(1);
    expect(u.getByTestId("arena-tab-clash-1")).toBeTruthy();
    expect(anyHaptic()).toBe(1);
  });

  it("does not replay on a re-render with the same value", () => {
    const u = renderIcon({ live: false });
    u.update({ live: true });
    u.update({ live: true });
    u.update({ live: true, color: "#7A8794" });
    expect(u.queryByTestId("arena-tab-clash-2")).toBeNull();
    expect(mockHaptics.goLive).toHaveBeenCalledTimes(1);
  });

  it("does not play when mounted live (app start, remount)", () => {
    const u = renderIcon({ live: true });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(mockHaptics.goLive).not.toHaveBeenCalled();
  });

  it("does not play for a live state the app restored (foreground, after a match)", () => {
    mockAthleteFlip = false;
    const u = renderIcon({ live: false });
    u.update({ live: true });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(mockHaptics.goLive).not.toHaveBeenCalled();
  });

  it("does not play on going offline", () => {
    const u = renderIcon({ live: true });
    u.update({ live: false });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(anyHaptic()).toBe(0);
  });

  it("plays again on the next real go-live", () => {
    const u = renderIcon({ live: false });
    u.update({ live: true });
    u.update({ live: false });
    u.update({ live: true });
    expect(u.getByTestId("arena-tab-clash-2")).toBeTruthy();
    expect(mockHaptics.goLive).toHaveBeenCalledTimes(2);
  });

  it("Reduce Motion: no clash and no spark, the goLive haptic is kept", () => {
    __setReduceMotionForTests(true);
    const u = renderIcon({ live: false });
    u.update({ live: true });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(mockHaptics.goLive).toHaveBeenCalledTimes(1);
  });

  it("plays silently when the pending count increases (the prompt sheet already buzzes)", () => {
    const u = renderIcon({ live: true, incomingCount: 0 });
    now += CLASH_SETTLE_MS;
    u.update({ incomingCount: 1 });
    expect(u.getByTestId("arena-tab-clash-1")).toBeTruthy();
    u.update({ incomingCount: 2 });
    expect(u.getByTestId("arena-tab-clash-2")).toBeTruthy();
    expect(mockHaptics.challengeArrived).not.toHaveBeenCalled();
    expect(anyHaptic()).toBe(0);
  });

  it("does not play when the count drops or stays the same", () => {
    const u = renderIcon({ incomingCount: 2 });
    now += CLASH_SETTLE_MS;
    u.update({ incomingCount: 2 });
    u.update({ incomingCount: 1 });
    u.update({ incomingCount: 0 });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
  });

  it("does not play for the first read of the stores right after mount", () => {
    const u = renderIcon({ incomingCount: 0 });
    now += CLASH_SETTLE_MS - 1;
    u.update({ incomingCount: 2 });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
  });

  it("does not play while the app is in the background", () => {
    setAppState("background");
    const u = renderIcon({ live: false, incomingCount: 0 });
    now += CLASH_SETTLE_MS;
    u.update({ live: true, incomingCount: 1 });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(anyHaptic()).toBe(0);
  });

  it("Reduce Motion: a count increase shows no clash", () => {
    __setReduceMotionForTests(true);
    const u = renderIcon({ incomingCount: 0 });
    now += CLASH_SETTLE_MS;
    u.update({ incomingCount: 1 });
    expect(u.queryByTestId(/^arena-tab-clash-/)).toBeNull();
    expect(anyHaptic()).toBe(0);
  });
});
