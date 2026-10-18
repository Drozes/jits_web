import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroTicker } from "./hero-ticker";
import { HeroTickerLine } from "./hero-ticker-line";
import { mockReducedMotion, TICK_PATTERN } from "./landing.test-utils";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

const ticker = () => screen.getByTestId("hero-ticker");
const line = () => screen.queryByTestId("hero-ticker-line")?.textContent ?? "";
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

describe("HeroTicker", () => {
  it("is empty and aria-hidden at first, shows a SAMPLE tick at 4 s and a new one after 7.2 s", () => {
    mockReducedMotion(false);
    render(<HeroTicker />);
    expect(ticker()).toHaveAttribute("aria-hidden", "true");
    expect(ticker()).toBeEmptyDOMElement();
    advance(3999);
    expect(ticker()).toBeEmptyDOMElement();
    advance(1);
    expect(ticker()).toHaveTextContent("SAMPLE");
    const first = line();
    expect(first).toMatch(TICK_PATTERN);
    advance(7500 - 4000);
    expect(line()).toMatch(TICK_PATTERN);
    expect(line()).not.toBe(first);
  });

  it("colours the change by outcome, a draw in the neutral tone", () => {
    const cases = [
      [{ lbs: 175.5, outcome: "WIN", delta: 14 }, "var(--state-positive)", "175.5 LBS · WIN ▲14"],
      [{ lbs: 149, outcome: "LOSS", delta: -9 }, "var(--state-negative)", "149 LBS · LOSS ▼9"],
      [{ lbs: 188.5, outcome: "DRAW", delta: 2 }, "var(--state-neutral)", "188.5 LBS · DRAW ▲2"],
      [{ lbs: 202, outcome: "DRAW", delta: -1 }, "var(--state-neutral)", "202 LBS · DRAW ▼1"],
    ] as const;
    for (const [tick, tone, text] of cases) {
      const { unmount } = render(<HeroTickerLine tick={tick} leaving={false} />);
      expect(screen.getByTestId("hero-ticker-line")).toHaveTextContent(text);
      expect(screen.getByTestId("hero-ticker-delta").style.color).toBe(tone);
      unmount();
    }
  });

  it("does not schedule a tick in a background tab until it becomes visible", () => {
    mockReducedMotion(false);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    render(<HeroTicker />);
    expect(vi.getTimerCount()).toBe(0);
    advance(10_000);
    expect(ticker()).toBeEmptyDOMElement();
    setVisibility("visible");
    advance(4000);
    expect(line()).toMatch(TICK_PATTERN);
  });

  it("never shows or schedules anything under reduced motion", () => {
    mockReducedMotion(true);
    render(<HeroTicker />);
    advance(10_000);
    expect(ticker()).toBeEmptyDOMElement();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("empties and stops when reduced motion is switched on", () => {
    const motion = mockReducedMotion(false);
    render(<HeroTicker />);
    advance(4000);
    expect(ticker()).toHaveTextContent("SAMPLE");
    act(() => motion.set(true));
    expect(ticker()).toBeEmptyDOMElement();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops rotating while the tab is hidden and resumes on return", () => {
    mockReducedMotion(false);
    render(<HeroTicker />);
    advance(4000);
    const shown = line();
    setVisibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(line()).toBe(shown);
    setVisibility("visible");
    advance(2200 + 240);
    expect(line()).not.toBe(shown);
  });

  it("clears every timer on unmount", () => {
    mockReducedMotion(false);
    const { unmount } = render(<HeroTicker />);
    advance(5000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
