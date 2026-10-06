/**
 * Pull to refresh on the Matches tab (spec 6.4 C-E2): the toast follows the
 * athlete's own pull only, including a pull that starts while a background
 * revalidate is already in flight (review follow-up on jits-a4fw.3).
 *
 * Source: apps/mobile/lib/matches/use-matches-refresh.ts
 */
import { act, renderHook } from "@testing-library/react-native";

const mockToastError = jest.fn();
jest.mock("@/components/ui/toast", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn() } }));

import { REFRESH_FAILED_TOAST, useMatchesRefresh } from "@/lib/matches/use-matches-refresh";

type Props = { busy: boolean; error: Error | null };
const refresh = jest.fn();

function setup(initial: Props = { busy: false, error: null }) {
  return renderHook((p: Props) => useMatchesRefresh(refresh, p.busy, p.error), { initialProps: initial });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it("a failed pull toasts once when its read settles", () => {
  const h = setup();
  act(() => h.result.current.onRefresh());
  expect(refresh).toHaveBeenCalledTimes(1);
  h.rerender({ busy: true, error: null });
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).toHaveBeenCalledTimes(1);
  expect(mockToastError).toHaveBeenCalledWith(REFRESH_FAILED_TOAST);
  // A later background failure stays quiet: the pull is done.
  h.rerender({ busy: true, error: null });
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).toHaveBeenCalledTimes(1);
});

it("a background revalidate never toasts", () => {
  const h = setup();
  h.rerender({ busy: true, error: null });
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).not.toHaveBeenCalled();
});

it("a pull that starts while a background revalidate is in flight still toasts on failure", () => {
  const h = setup({ busy: true, error: null });
  act(() => h.result.current.onRefresh());
  // No rising edge: busy was already true. The read settles and fails.
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).toHaveBeenCalledWith(REFRESH_FAILED_TOAST);
  // And it is not left pending: a later background failure stays quiet.
  mockToastError.mockClear();
  h.rerender({ busy: true, error: null });
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).not.toHaveBeenCalled();
});

it("a pull joined to an in-flight read that succeeds does not toast", () => {
  const h = setup({ busy: true, error: null });
  act(() => h.result.current.onRefresh());
  h.rerender({ busy: false, error: null });
  expect(mockToastError).not.toHaveBeenCalled();
});

it("a pull that never sees a read is dropped when the spinner gives up, so a later background failure stays quiet", () => {
  const h = setup();
  act(() => h.result.current.onRefresh());
  expect(h.result.current.refreshing).toBe(true);
  act(() => {
    jest.runOnlyPendingTimers();
  });
  expect(h.result.current.refreshing).toBe(false);
  h.rerender({ busy: true, error: null });
  h.rerender({ busy: false, error: new Error("offline") });
  expect(mockToastError).not.toHaveBeenCalled();
});
