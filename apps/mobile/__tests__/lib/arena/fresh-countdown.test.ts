import { act, renderHook } from "@testing-library/react-native";
import { formatCountdown, spokenCountdown, useFreshCountdown } from "@/lib/arena/fresh-countdown";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";

describe("formatCountdown", () => {
  it("formats m:ss, rounding up to the whole second", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(599_001)).toBe("10:00");
    expect(formatCountdown(599_000)).toBe("9:59");
    expect(formatCountdown(521_000)).toBe("8:41");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(1)).toBe("0:01");
  });

  it("floors at 0:00", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});

describe("spokenCountdown", () => {
  it("reads minutes and seconds with plurals", () => {
    expect(spokenCountdown(521_000)).toBe("8 minutes 41 seconds");
    // Rounded up like the m:ss it is read beside.
    expect(spokenCountdown(491_001)).toBe("8 minutes 12 seconds");
    expect(spokenCountdown(1)).toBe("1 second");
    expect(spokenCountdown(61_000)).toBe("1 minute 1 second");
    expect(spokenCountdown(120_000)).toBe("2 minutes");
    expect(spokenCountdown(9_000)).toBe("9 seconds");
    expect(spokenCountdown(0)).toBe("0 seconds");
  });
});

describe("useFreshCountdown", () => {
  const NOW = Date.parse("2026-09-28T12:00:00.000Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  type Input = { createdAt?: string | null; expiresAt?: string | null } | null;

  beforeEach(() => {
    __resetServerClockForTests();
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null and schedules nothing without a challenge", () => {
    const { result } = renderHook(() => useFreshCountdown(null));
    expect(result.current).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("returns null when neither timestamp is known", () => {
    const { result } = renderHook(() => useFreshCountdown({ createdAt: null, expiresAt: null }));
    expect(result.current).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("ticks on whole-second boundaries of the remaining time", () => {
    // Created 1.5s ago plus a bit: 598_500ms left, which reads 9:59.
    const challenge = { createdAt: iso(NOW - 1_500), expiresAt: null };
    const { result } = renderHook(() => useFreshCountdown(challenge));
    expect(result.current).toBe(598_500);
    expect(formatCountdown(result.current!)).toBe("9:59");

    // The next tick lands on the boundary, 500ms away, not a full second.
    act(() => jest.advanceTimersByTime(499));
    expect(result.current).toBe(598_500);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(598_000);
    expect(formatCountdown(result.current!)).toBe("9:58");

    // Then once a second.
    act(() => jest.advanceTimersByTime(1_000));
    expect(result.current).toBe(597_000);
  });

  it("inactive (an unfocused tab) runs no timer and re-reads the moment it resumes", () => {
    const challenge = { createdAt: iso(NOW - 1_500), expiresAt: null };
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFreshCountdown(challenge, active),
      { initialProps: { active: false } },
    );
    expect(result.current).toBe(598_500);
    expect(jest.getTimerCount()).toBe(0);

    // Four minutes on another tab: no ticks, the value stays frozen.
    act(() => jest.advanceTimersByTime(240_000));
    expect(result.current).toBe(598_500);

    // Refocus: the very first render already reads the real time.
    rerender({ active: true });
    expect(result.current).toBe(358_500);
    expect(jest.getTimerCount()).toBe(1);
  });

  it("does not re-render when a tick lands on the same displayed second", () => {
    // The clock moves 10ms between the first render and the mount tick: the
    // same m:ss, so no second render.
    const challenge = { createdAt: iso(NOW - 1_500), expiresAt: null };
    let renders = 0;
    const realNow = Date.now;
    let calls = 0;
    const spy = jest.spyOn(Date, "now").mockImplementation(() => realNow() + (calls++ > 0 ? 10 : 0));
    try {
      renderHook(() => {
        renders += 1;
        return useFreshCountdown(challenge);
      });
    } finally {
      spy.mockRestore();
    }
    expect(renders).toBe(1);
  });

  it("stops scheduling at 0: no timer outlives the window", () => {
    const challenge = { createdAt: null, expiresAt: iso(NOW + 2_000) };
    const { result } = renderHook(() => useFreshCountdown(challenge));
    expect(result.current).toBe(2_000);
    act(() => jest.advanceTimersByTime(2_000));
    expect(result.current).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("derives the new value in the same render when the inputs change", () => {
    const a = { createdAt: iso(NOW - 60_000), expiresAt: null };
    const b = { createdAt: iso(NOW), expiresAt: null };
    const seen: Array<number | null> = [];
    const { result, rerender } = renderHook(
      ({ c }: { c: Input }) => {
        const v = useFreshCountdown(c);
        seen.push(v);
        return v;
      },
      { initialProps: { c: a as Input } },
    );
    expect(result.current).toBe(540_000);
    seen.length = 0;
    rerender({ c: b });
    expect(result.current).toBe(600_000);
    // No render for B ever returned A's remaining time.
    expect(seen).not.toContain(540_000);
    expect(seen.length).toBeGreaterThan(0);

    // And going back to no challenge returns null at once and clears timers.
    rerender({ c: null });
    expect(result.current).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});
