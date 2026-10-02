/**
 * Skeleton shimmer (Adding Flare, jits-pddd.5): one module-level clock shared
 * by every provider; a band in every bar while shimmering; plain static bars
 * under Reduce Motion or `pulse={false}`; the clock is released on unmount
 * and while the app is in the background.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import {
  SkeletonBlock,
  SkeletonProvider,
  SkeletonRankRow,
} from "@/components/ui/skeleton";
import { __shimmerHoldersForTests } from "@/components/ui/skeleton/skeleton";
import { __resetAppActiveForTests, __setReduceMotionForTests } from "@/lib/motion";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// Skeleton bars are hidden from accessibility on purpose; query them anyway.
const HIDDEN = { includeHiddenElements: true } as const;

let appListeners: Array<(s: string) => void> = [];

beforeEach(() => {
  appListeners = [];
  __resetAppActiveForTests();
  // The react-native jest mock has no real current state; start in the foreground.
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, l: (s: string) => void) => {
    appListeners.push(l);
    return { remove: () => (appListeners = appListeners.filter((x) => x !== l)) };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
  jest.restoreAllMocks();
});

it("draws a shimmer band in every bar and holds the shared clock once per provider", () => {
  const view = render(
    <>
      <SkeletonProvider>
        <SkeletonRankRow />
      </SkeletonProvider>
      <SkeletonProvider>
        <SkeletonBlock width={40} height={10} />
      </SkeletonProvider>
    </>,
  );
  // SkeletonRankRow has 5 bars, plus the lone block.
  expect(view.getAllByTestId("skeleton-shimmer", HIDDEN)).toHaveLength(6);
  expect(__shimmerHoldersForTests()).toBe(2);
  view.unmount();
  expect(__shimmerHoldersForTests()).toBe(0);
});

it("is static without a provider and with pulse={false}", () => {
  const view = render(
    <>
      <SkeletonBlock width={40} height={10} />
      <SkeletonProvider pulse={false}>
        <SkeletonBlock width={40} height={10} />
      </SkeletonProvider>
    </>,
  );
  expect(view.queryByTestId("skeleton-shimmer", HIDDEN)).toBeNull();
  expect(__shimmerHoldersForTests()).toBe(0);
});

it("shows plain static bars under Reduce Motion", () => {
  act(() => __setReduceMotionForTests(true));
  const view = render(
    <SkeletonProvider>
      <SkeletonRankRow />
    </SkeletonProvider>,
  );
  expect(view.queryByTestId("skeleton-shimmer", HIDDEN)).toBeNull();
  expect(__shimmerHoldersForTests()).toBe(0);
});

it("releases the clock while the app is in the background and takes it back on foreground", () => {
  const view = render(
    <SkeletonProvider>
      <SkeletonBlock width={40} height={10} />
    </SkeletonProvider>,
  );
  expect(__shimmerHoldersForTests()).toBe(1);
  act(() => appListeners.forEach((l) => l("background")));
  expect(__shimmerHoldersForTests()).toBe(0);
  act(() => appListeners.forEach((l) => l("active")));
  expect(__shimmerHoldersForTests()).toBe(1);
  view.unmount();
});
