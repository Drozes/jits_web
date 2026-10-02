/**
 * Challenge afterglow (Adding Flare [01.4]): a new incoming challenge
 * strip's bottom edge starts hot and cools, ONCE per challenge id.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

import * as Haptics from "expo-haptics";
import {
  AFTERGLOW_MS,
  AfterglowEdge,
  __resetAfterglowForTests,
  afterglowHeat,
} from "@/components/arena/afterglow-edge";
import { IncomingStrip, OfferStrip } from "@/components/arena/mat-board";
import { __setReduceMotionForTests } from "@/lib/motion";

const hidden = { includeHiddenElements: true };
let now = 1_000_000;

beforeEach(() => {
  __resetAfterglowForTests();
  __setReduceMotionForTests(false);
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function opacity(r: ReturnType<typeof render>, layer: "red" | "orange"): number {
  const node = r.getByTestId(`arena-afterglow-${layer}`, hidden);
  const style = ([] as unknown[]).concat(node.props.style).filter(Boolean) as Record<string, unknown>[];
  return Object.assign({}, ...style).opacity as number;
}

describe("AfterglowEdge", () => {
  it("a new challenge id starts hot", () => {
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    expect(opacity(r, "red")).toBe(1);
    expect(opacity(r, "orange")).toBe(1);
  });

  it("no id draws the cooled hairline", () => {
    const r = render(<AfterglowEdge challengeId={null} />);
    expect(opacity(r, "red")).toBe(0);
    expect(opacity(r, "orange")).toBe(0);
    expect(r.getByTestId("arena-afterglow", hidden).props.className).toMatch(/bg-surface-4/);
  });

  it("a remount of the same challenge after the cool-down shows it cooled", () => {
    render(<AfterglowEdge challengeId="ch-1" />).unmount();
    now += AFTERGLOW_MS + 500;
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    expect(opacity(r, "red")).toBe(0);
    expect(opacity(r, "orange")).toBe(0);
  });

  it("a remount during the cool-down carries on, never reheats", () => {
    render(<AfterglowEdge challengeId="ch-1" />).unmount();
    now += AFTERGLOW_MS / 2;
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    expect(opacity(r, "red")).toBeCloseTo(0.25);
    expect(opacity(r, "orange")).toBe(0);
  });

  it("a re-render with the same id does not replay", () => {
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    now += AFTERGLOW_MS;
    r.rerender(<AfterglowEdge challengeId="ch-1" />);
    expect(opacity(r, "red")).toBe(0);
    expect(afterglowHeat("ch-1", now)).toBe(0);
  });

  it("a different challenge id glows again", () => {
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    now += AFTERGLOW_MS * 3;
    r.rerender(<AfterglowEdge challengeId="ch-2" />);
    expect(opacity(r, "red")).toBe(1);
  });

  it("Reduce Motion: cooled at once", () => {
    __setReduceMotionForTests(true);
    const r = render(<AfterglowEdge challengeId="ch-1" />);
    expect(opacity(r, "red")).toBe(0);
    expect(opacity(r, "orange")).toBe(0);
  });

  it("is silent: no haptic for the afterglow", () => {
    render(<AfterglowEdge challengeId="ch-1" />);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe("incoming challenge strips carry the afterglow", () => {
  const source = { createdAt: null, expiresAt: null };

  it("IncomingStrip", () => {
    const r = render(
      <IncomingStrip challengeId="ch-7" name="Rival" count={1} source={source} active={false} onOpen={() => undefined} />,
    );
    expect(r.getByTestId("arena-strip-incoming")).toBeTruthy();
    expect(opacity(r, "red")).toBe(1);
  });

  it("OfferStrip, and the incoming strip for the same challenge is already cooled", () => {
    const offer = render(
      <OfferStrip challengeId="ch-8" name="Rival" source={source} active={false} onGoLive={() => undefined} disabled={false} />,
    );
    expect(opacity(offer, "red")).toBe(1);
    offer.unmount();
    now += AFTERGLOW_MS + 1;
    const incoming = render(
      <IncomingStrip challengeId="ch-8" name="Rival" count={1} source={source} active={false} onOpen={() => undefined} />,
    );
    expect(opacity(incoming, "red")).toBe(0);
  });
});

describe("AfterglowEdge: heat starts at the earlier of created_at and first draw", () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  it("a challenge older than the cool-down shows cooled on its first draw (cold start, OTA reload)", () => {
    const r = render(<AfterglowEdge challengeId="ch-old" createdAt={iso(now - AFTERGLOW_MS - 1000)} />);
    expect(opacity(r, "red")).toBe(0);
    expect(opacity(r, "orange")).toBe(0);
  });

  it("one that arrived moments ago (on another tab) still glows what is left", () => {
    const r = render(<AfterglowEdge challengeId="ch-recent" createdAt={iso(now - AFTERGLOW_MS / 2)} />);
    expect(opacity(r, "red")).toBeCloseTo(0.25);
  });

  it("a created_at ahead of the device clock never delays the start past the first draw", () => {
    const r = render(<AfterglowEdge challengeId="ch-skew" createdAt={iso(now + 60_000)} />);
    expect(opacity(r, "red")).toBe(1);
    now += AFTERGLOW_MS + 1;
    r.rerender(<AfterglowEdge challengeId="ch-skew" createdAt={iso(now + 60_000)} />);
    expect(opacity(r, "red")).toBe(0);
  });

  it("an unparseable created_at falls back to the first draw", () => {
    const r = render(<AfterglowEdge challengeId="ch-bad" createdAt="not a date" />);
    expect(opacity(r, "red")).toBe(1);
  });

  it("an id seen under Reduce Motion never reheats once Reduce Motion is off", () => {
    __setReduceMotionForTests(true);
    render(<AfterglowEdge challengeId="ch-rm" />).unmount();
    __setReduceMotionForTests(false);
    now += AFTERGLOW_MS + 1;
    const r = render(<AfterglowEdge challengeId="ch-rm" />);
    expect(opacity(r, "red")).toBe(0);
  });

  it("the strips pass the challenge's created_at", () => {
    const r = render(
      <IncomingStrip
        challengeId="ch-strip-old"
        name="Rival"
        count={1}
        source={{ createdAt: iso(now - AFTERGLOW_MS * 5), expiresAt: null }}
        active={false}
        onOpen={() => undefined}
      />,
    );
    expect(opacity(r, "red")).toBe(0);
  });
});
