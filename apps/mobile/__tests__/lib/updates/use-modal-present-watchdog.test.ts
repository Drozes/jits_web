import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import {
  MODAL_FIRST_RETRY_MS,
  MODAL_RETRY_INTERVAL_MS,
  useModalPresentWatchdog,
} from "@/lib/updates/use-modal-present-watchdog";

let appStateCb: ((s: string) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  remove.mockClear();
  appStateCb = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, cb) => {
    appStateCb = cb as (s: string) => void;
    return { remove } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

it("waits 1.5s before the first remount (slow onShow after splash must not blink)", () => {
  expect(MODAL_FIRST_RETRY_MS).toBe(1_500);
  const { result } = renderHook(() => useModalPresentWatchdog(true));
  advance(1_000);
  expect(result.current.modalKey).toBe(0);
});

it("remounts when onShow never fires, then keeps retrying on the interval", () => {
  const { result } = renderHook(() => useModalPresentWatchdog(true));
  expect(result.current.modalKey).toBe(0);
  advance(MODAL_FIRST_RETRY_MS - 1);
  expect(result.current.modalKey).toBe(0);
  advance(1);
  expect(result.current.modalKey).toBe(1);
  advance(MODAL_RETRY_INTERVAL_MS);
  expect(result.current.modalKey).toBe(2);
  advance(MODAL_RETRY_INTERVAL_MS * 3);
  expect(result.current.modalKey).toBe(5);
});

it("remounts on foreground while not yet shown", () => {
  const { result } = renderHook(() => useModalPresentWatchdog(true));
  act(() => appStateCb?.("active"));
  expect(result.current.modalKey).toBe(1);
  act(() => appStateCb?.("background"));
  expect(result.current.modalKey).toBe(1);
});

it("stops retrying once onShow fires", () => {
  const { result } = renderHook(() => useModalPresentWatchdog(true));
  advance(MODAL_FIRST_RETRY_MS);
  expect(result.current.modalKey).toBe(1);
  act(() => result.current.onShow());
  expect(remove).toHaveBeenCalled();
  advance(MODAL_RETRY_INTERVAL_MS * 10);
  expect(result.current.modalKey).toBe(1);
});

it("does nothing when onShow fires before the first retry", () => {
  const { result } = renderHook(() => useModalPresentWatchdog(true));
  act(() => result.current.onShow());
  advance(MODAL_RETRY_INTERVAL_MS * 10);
  expect(result.current.modalKey).toBe(0);
});

it("does nothing while not visible", () => {
  const add = AppState.addEventListener as jest.Mock;
  add.mockClear();
  const { result } = renderHook(() => useModalPresentWatchdog(false));
  advance(MODAL_RETRY_INTERVAL_MS * 10);
  expect(result.current.modalKey).toBe(0);
  expect(add).not.toHaveBeenCalled();
});
