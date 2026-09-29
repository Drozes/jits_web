/**
 * The header chip and the Mat Board strip sit side by side on the Arena tab
 * (the intentional double-up). Both must read the same m:ss for the same
 * challenge and turn over on the same second, so they share one formatter
 * (rounding up) and one boundary-aligned tick (lib/arena/fresh-countdown).
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useOnMatCount: () => 12,
}));
jest.mock("@/components/ui/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useMatchToConfirm: () => null,
}));

import { HeaderStatusChip } from "@/components/layout/header-status-chip";
import { WaitingStrip } from "@/components/arena/mat-board";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaState,
} from "@/lib/arena/arena-store";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");

function textOf(node: { findAll: Function }): string {
  return (node.findAll((n: { type: unknown }) => n.type === "Text") as Array<{
    props: { children: unknown };
  }>)
    .map((n) => String(n.props.children))
    .join("");
}

function countdownIn(text: string): string {
  const m = /(\d+:\d\d)/.exec(text);
  return m ? m[1] : "";
}

describe("chip and Mat Board countdown parity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetArenaStoreForTests();
    __resetServerClockForTests();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("the chip and the waiting strip show the same m:ss and turn over together", () => {
    // Sent 1:48.5 ago: 8:11.5 left, which rounds up to 8:12 everywhere.
    const outgoing = {
      challengeId: "o1",
      opponentId: "a3",
      opponentName: "Alex",
      createdAt: new Date(NOW - 108_500).toISOString(),
      expiresAt: null,
    };
    act(() => {
      publishArenaState({ ...IDLE_ARENA_STATE, isLive: true, outgoing });
    });
    const { getByTestId } = render(
      <>
        <HeaderStatusChip />
        <WaitingStrip name="Alex" source={outgoing} active onCancel={() => undefined} disabled={false} />
      </>,
    );
    const chip = () => countdownIn(textOf(getByTestId("header-status-chip")));
    const strip = () => String(getByTestId("arena-strip-countdown").props.children);

    expect(chip()).toBe("8:12");
    expect(strip()).toBe(" · 8:12");

    // Half a second later both turn over on the same boundary.
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(chip()).toBe("8:12");
    expect(strip()).toBe(" · 8:12");
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(chip()).toBe("8:11");
    expect(strip()).toBe(" · 8:11");

    // Across many ticks they never drift apart.
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(strip()).toBe(` · ${chip()}`);
    }
  });

  it("the strip never shows 0:00 while the challenge is still live", () => {
    const outgoing = {
      challengeId: "o1",
      opponentId: "a3",
      opponentName: "Alex",
      createdAt: new Date(NOW - (10 * 60_000 - 400)).toISOString(),
      expiresAt: null,
    };
    const { getByTestId } = render(
      <WaitingStrip name="Alex" source={outgoing} active onCancel={() => undefined} disabled={false} />,
    );
    expect(String(getByTestId("arena-strip-countdown").props.children)).toBe(" · 0:01");
    expect(getByTestId("arena-strip-countdown").props.accessibilityLabel).toBe("1 second left");
  });
});
