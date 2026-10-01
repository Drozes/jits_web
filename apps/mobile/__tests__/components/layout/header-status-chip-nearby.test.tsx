/**
 * The header chip's `· N` in the Arena's nearby mode (M2, rule D2): the
 * number is the On the mat rows the Arena renders, which in nearby mode are
 * only the athletes on my mat. Rendered against the REAL `useOnMatCount`
 * and arena store (no lobby mock), so the chip reads exactly what the Arena
 * publishes.
 *
 * Source: apps/mobile/components/layout/header-status-chip.tsx,
 * apps/mobile/lib/arena/use-lobby-presence.ts (useOnMatCount),
 * apps/mobile/lib/arena/arena-store.ts (publishNearbyOnMatCount)
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
// The lobby module imports the client; nothing here opens a channel.
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/match-flow/active-match-store", () => ({ useMatchToConfirm: () => null }));
jest.mock("@/components/ui/toast", () => ({ toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() } }));

import { CHIP_RING_TEST_ID, HeaderStatusChip } from "@/components/layout/header-status-chip";
import {
  IDLE_ARENA_STATE,
  __resetArenaStoreForTests,
  publishArenaSelfId,
  publishArenaState,
  publishNearbyOnMatCount,
  registerArenaController,
} from "@/lib/arena/arena-store";

function chipText(getByTestId: (id: string) => { findAll: Function }): string {
  const root = getByTestId("header-status-chip");
  const ring =
    (root.findAll((n: { props: { testID?: unknown } }) => n.props.testID === CHIP_RING_TEST_ID) as unknown[]).length > 0;
  const text = (root.findAll((n: { type: unknown }) => n.type === "Text") as Array<{ props: { children: unknown } }>)
    .map((n) => String(n.props.children))
    .join("");
  return ring ? `○${text}` : text;
}

beforeEach(() => {
  __resetArenaStoreForTests();
  publishNearbyOnMatCount(null);
  publishArenaSelfId("me");
  registerArenaController({
    toggle: jest.fn(async () => {}),
    goOffline: jest.fn(async () => true),
    goLive: jest.fn(async () => true),
    sendChallenge: jest.fn(async () => {}),
    cancelOutgoing: jest.fn(async () => {}),
    clearCap: jest.fn(),
    tuckIncoming: jest.fn(),
    reopenIncoming: jest.fn(),
  });
});

it("counts the Arena's nearby On the mat rows, not the whole lobby", () => {
  const { getByTestId } = render(<HeaderStatusChip />);
  // No lobby known here: the whole-lobby count is unknown, so no number.
  expect(chipText(getByTestId)).toBe("○GO LIVE");
  act(() => publishNearbyOnMatCount({ count: 2 }));
  expect(chipText(getByTestId)).toBe("○GO LIVE · 2");
});

it("live with nobody on my mat reads JUST YOU, even with others live nearby", () => {
  act(() => publishArenaState({ ...IDLE_ARENA_STATE, isLive: true }));
  const { getByTestId } = render(<HeaderStatusChip />);
  act(() => publishNearbyOnMatCount({ count: 0 }));
  expect(chipText(getByTestId)).toBe("LIVE · JUST YOU");
});

it("nearby rows not known yet: no number, never a guess", () => {
  const { getByTestId } = render(<HeaderStatusChip />);
  act(() => publishNearbyOnMatCount({ count: 3 }));
  act(() => publishNearbyOnMatCount({ count: null }));
  expect(chipText(getByTestId)).toBe("○GO LIVE");
});

it("a fallback mode hands the number back to the lobby count", () => {
  const { getByTestId } = render(<HeaderStatusChip />);
  act(() => publishNearbyOnMatCount({ count: 2 }));
  act(() => publishNearbyOnMatCount(null));
  expect(chipText(getByTestId)).toBe("○GO LIVE");
});
