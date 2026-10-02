/**
 * OfflineBanner (WP4, R3 SC-1 / MO-6): a neutral panel bar with a
 * hairline-strong edge and mono caps ink copy (never Signal Red), sliding on
 * Reanimated over `duration.fast`, and appearing in place under Reduce
 * Motion (Motion Rule registry row "Offline banner").
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { getAnimatedStyle } from "react-native-reanimated";

let mockConnected = true;
jest.mock("@/lib/network/use-network-status", () => ({
  useNetworkStatus: () => ({ isConnected: mockConnected, isInternetReachable: null, type: "unknown" }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2" }),
}));

import { OFFLINE_BANNER_HIDDEN_Y, OfflineBanner } from "@/components/offline-banner";
import { __setReduceMotionForTests, duration } from "@/lib/motion";

const COPY = "You're offline. Some features may not work.";

function translateYOf(node: Parameters<typeof getAnimatedStyle>[0]): number {
  const style = getAnimatedStyle(node) as { transform?: { translateY?: number }[] };
  const t = (style.transform ?? []).find((x) => x.translateY !== undefined);
  return t?.translateY ?? 0;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockConnected = true;
  act(() => __setReduceMotionForTests(false));
});

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
  jest.useRealTimers();
});

describe("OfflineBanner", () => {
  it("renders nothing readable and rests above the screen while online", () => {
    const s = render(<OfflineBanner />);
    expect(s.queryByText(COPY)).toBeNull();
    expect(s.queryByTestId("offline-banner-surface")).toBeNull();
    expect(translateYOf(s.getByTestId("offline-banner"))).toBe(OFFLINE_BANNER_HIDDEN_Y);
    expect(s.getByTestId("offline-banner").props.pointerEvents).toBe("none");
  });

  it("is a neutral panel bar with mono caps ink copy, never Signal Red (SC-1)", () => {
    mockConnected = false;
    const s = render(<OfflineBanner />);
    expect(s.getByText(COPY)).toBeTruthy();
    const surface = String(s.getByTestId("offline-banner-surface").props.className);
    expect(surface).toContain("bg-surface-2");
    expect(surface).toContain("border-b");
    expect(surface).toContain("border-hairline-strong");
    expect(surface).not.toMatch(/bg-(destructive|cta|negative|primary)/);
    const text = String(s.getByText(COPY).props.className);
    expect(text).toMatch(/font-mono.*uppercase.*tracking-caps-l.*text-ink/);
    expect(text).not.toMatch(/font-medium|text-xs|destructive/);
  });

  it("slides in over duration.fast on the UI thread when the device goes offline", () => {
    const s = render(<OfflineBanner />);
    mockConnected = false;
    s.rerender(<OfflineBanner />);
    const bar = () => s.getByTestId("offline-banner");
    act(() => jest.advanceTimersByTime(duration.fast / 4));
    const mid = translateYOf(bar());
    expect(mid).toBeLessThan(0);
    expect(mid).toBeGreaterThan(OFFLINE_BANNER_HIDDEN_Y);
    act(() => jest.advanceTimersByTime(duration.fast));
    expect(translateYOf(bar())).toBe(0);
  });

  it("under Reduce Motion appears in place with no slide", () => {
    act(() => __setReduceMotionForTests(true));
    const s = render(<OfflineBanner />);
    mockConnected = false;
    s.rerender(<OfflineBanner />);
    act(() => jest.advanceTimersByTime(16));
    expect(translateYOf(s.getByTestId("offline-banner"))).toBe(0);
    expect(s.getByText(COPY)).toBeTruthy();
  });

  it("drops its content at once when the device is back online", () => {
    mockConnected = false;
    const s = render(<OfflineBanner />);
    mockConnected = true;
    s.rerender(<OfflineBanner />);
    expect(s.queryByText(COPY)).toBeNull();
  });
});
