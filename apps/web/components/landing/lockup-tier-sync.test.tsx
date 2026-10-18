import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReducedMotion } from "./landing.test-utils";
import { INTRO_DONE_FALLBACK_MS, LockupTierSync } from "./lockup-tier-sync";

function Hero() {
  return (
    <section data-hero-root="" data-intro="playing" data-testid="hero">
      <div data-lockup-set="oneline" data-tier="detail" data-frac="0.3477" data-tiers='[[175,"detail"],[112,"fine"],[0,"small"]]'>
        <p data-lk="soon">Coming Soon</p>
        <span data-lk="we" />
      </div>
      <LockupTierSync />
    </section>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LockupTierSync", () => {
  it("marks the intro done when the hero line's animation ends", () => {
    mockReducedMotion(false);
    const { getByTestId, getByText, container } = render(<Hero />);
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "playing");
    fireEvent.animationEnd(container.querySelector('[data-lk="we"]')!);
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "playing");
    fireEvent.animationEnd(getByText("Coming Soon"));
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to done after 2,700 ms", () => {
    mockReducedMotion(false);
    const { getByTestId } = render(<Hero />);
    act(() => { vi.advanceTimersByTime(INTRO_DONE_FALLBACK_MS - 1); });
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "playing");
    act(() => { vi.advanceTimersByTime(1); });
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "done");
  });

  it("is done at once under reduced motion", () => {
    mockReducedMotion(true);
    const { getByTestId } = render(<Hero />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(getByTestId("hero")).toHaveAttribute("data-intro", "done");
  });

  it("sets --dpr and removes its listeners and timers on unmount", () => {
    mockReducedMotion(false);
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const { getByTestId, unmount } = render(<Hero />);
    const hero = getByTestId("hero");
    expect(hero.style.getPropertyValue("--dpr")).toBe(String(window.devicePixelRatio || 1));
    const removeHero = vi.spyOn(hero, "removeEventListener");
    unmount();
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeHero).toHaveBeenCalledWith("animationend", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
