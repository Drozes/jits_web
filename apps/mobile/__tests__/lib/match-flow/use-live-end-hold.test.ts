/**
 * `useLiveEndHold` (spec 4.2 End, PM1; board P-TK-B7 frame 5; slice M4): on
 * a phone that never ends the clock (a timekeeper-mode athlete), the DB's
 * move from live to the result waiting view keeps the live step (its ended
 * plate) on screen for OPPONENT_ENDED_INTERSTITIAL_MS; every other move,
 * mount and phone shows the wizard's step unchanged.
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";
import { useLiveEndHold } from "@/lib/match-flow/use-live-end-hold";
import { OPPONENT_ENDED_INTERSTITIAL_MS } from "@/lib/match-flow/live-view-state";
import type { MatchStep } from "@/lib/match-flow/step-router";

function mount(step: MatchStep | null, holdsEnd: boolean) {
  /** Every committed (painted) value; a render React discards is not one. */
  const seen: (MatchStep | null)[] = [];
  const hook = renderHook(
    ({ s, h }: { s: MatchStep | null; h: boolean }) => {
      const shown = useLiveEndHold(s, h);
      React.useLayoutEffect(() => {
        seen.push(shown);
      });
      return shown;
    },
    { initialProps: { s: step, h: holdsEnd } },
  );
  return { ...hook, seen, move: (s: MatchStep | null, h = holdsEnd) => hook.rerender({ s, h }) };
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("a phone that never ends the clock (a timekeeper-mode athlete)", () => {
  it("live -> result shows live for the interstitial, then the result", () => {
    const h = mount("live", true);
    h.move("result");
    expect(h.result.current).toBe("live");
    advance(OPPONENT_ENDED_INTERSTITIAL_MS - 1);
    expect(h.result.current).toBe("live");
    advance(1);
    expect(h.result.current).toBe("result");
  });

  it("never paints the result for a frame before the hold", () => {
    const h = mount("live", true);
    h.seen.length = 0;
    h.move("result");
    expect(h.seen).toEqual(["live"]);
    advance(OPPONENT_ENDED_INTERSTITIAL_MS);
    expect(h.seen).toEqual(["live", "result"]);
  });

  it("a further move during the hold shows at once (a result recorded meanwhile)", () => {
    const h = mount("live", true);
    h.move("result");
    expect(h.result.current).toBe("live");
    h.move("confirm");
    expect(h.result.current).toBe("confirm");
    advance(OPPONENT_ENDED_INTERSTITIAL_MS);
    expect(h.result.current).toBe("confirm");
  });

  it("mounting on the result (reopened after the end) holds nothing", () => {
    const h = mount(null, true);
    h.move("result");
    expect(h.result.current).toBe("result");
    const direct = mount("result", true);
    expect(direct.result.current).toBe("result");
  });

  it("live -> confirm (the result already recorded) holds nothing", () => {
    const h = mount("live", true);
    h.move("confirm");
    expect(h.result.current).toBe("confirm");
  });

  it("unmounting during the hold leaves no timer behind", () => {
    const h = mount("live", true);
    h.move("result");
    h.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("every other phone (a two-athlete match, the timekeeper)", () => {
  it.each<[MatchStep, MatchStep]>([
    ["live", "result"],
    ["live", "end"],
    ["live", "confirm"],
    ["end", "result"],
    ["ready", "live"],
  ])("%s -> %s shows the step at once", (from, to) => {
    const h = mount(from, false);
    h.move(to);
    expect(h.result.current).toBe(to);
    expect(jest.getTimerCount()).toBe(0);
  });
});
