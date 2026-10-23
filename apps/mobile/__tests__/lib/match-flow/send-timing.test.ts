/**
 * `useSendCeiling` (lib/match-flow/send-timing.ts; PM29): `within(call)`
 * resolves with the call's reply, or with `NO_REPLY` once it threw or
 * `SEND_CEILING_MS` passed; a later reply is dropped (PM29 (1): the screen's
 * reads show a late landing), a reply in time clears the ceiling's timer, and
 * after unmount it never resolves and leaves no timer.
 */
import { act, renderHook } from "@testing-library/react-native";
import { NO_REPLY, SEND_CEILING_MS, useSendCeiling } from "@/lib/match-flow/send-timing";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The id the ceiling's own `setTimeout` (the one set for `SEND_CEILING_MS`) returned. */
function ceilingTimerId(setSpy: jest.SpyInstance): unknown {
  const i = setSpy.mock.calls.findIndex((c) => c[1] === SEND_CEILING_MS);
  expect(i).toBeGreaterThanOrEqual(0);
  return setSpy.mock.results[i].value;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("useSendCeiling", () => {
  it("a reply in time is delivered, and it clears the ceiling's timer", async () => {
    const { result } = renderHook(() => useSendCeiling());
    const setSpy = jest.spyOn(global, "setTimeout");
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const call = deferred<string>();
    let got: unknown;
    void result.current.within(call.promise).then((r) => (got = r));
    const id = ceilingTimerId(setSpy);
    expect(clearSpy).not.toHaveBeenCalledWith(id);
    await act(async () => {
      call.resolve("ok");
    });
    expect(got).toBe("ok");
    expect(clearSpy).toHaveBeenCalledWith(id);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    expect(got).toBe("ok");
  });

  it("no reply by the ceiling: still out just before it, NO_REPLY at SEND_CEILING_MS, and the late reply is dropped", async () => {
    const { result } = renderHook(() => useSendCeiling());
    const call = deferred<string>();
    const settled = jest.fn();
    void result.current.within(call.promise).then(settled);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS - 1);
    });
    expect(settled).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(settled.mock.calls).toEqual([[NO_REPLY]]);
    await act(async () => {
      call.resolve("late");
    });
    expect(settled.mock.calls).toEqual([[NO_REPLY]]);
  });

  it("a throw is NO_REPLY, and it clears the ceiling's timer", async () => {
    const { result } = renderHook(() => useSendCeiling());
    const setSpy = jest.spyOn(global, "setTimeout");
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const call = deferred<string>();
    let got: unknown;
    void result.current.within(call.promise).then((r) => (got = r));
    const id = ceilingTimerId(setSpy);
    await act(async () => {
      call.reject(new Error("boom"));
    });
    expect(got).toBe(NO_REPLY);
    expect(clearSpy).toHaveBeenCalledWith(id);
  });

  it("after unmount it never resolves, its timer is cleared, and a reply then is dropped", async () => {
    const { result, unmount } = renderHook(() => useSendCeiling());
    const call = deferred<string>();
    const settled = jest.fn();
    void result.current.within(call.promise).then(settled);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(SEND_CEILING_MS * 2);
    });
    await act(async () => {
      call.resolve("after unmount");
    });
    expect(settled).not.toHaveBeenCalled();
  });
});
