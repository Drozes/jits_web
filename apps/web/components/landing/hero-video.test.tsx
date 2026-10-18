import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroVideo } from "./hero-video";
import { mockReducedMotion } from "./landing.test-utils";

let paused = true;
let mutedAtPlay: boolean[] = [];
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let observe: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
const disconnect = vi.fn();

beforeEach(() => {
  paused = true;
  mutedAtPlay = [];
  play = vi.fn(function (this: HTMLMediaElement) {
    mutedAtPlay.push(this.muted);
    paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => { paused = true; });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as unknown as () => Promise<void>);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause as unknown as () => void);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(() => paused);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { observe = cb; }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as { connection?: unknown }).connection;
  delete (document as { visibilityState?: unknown }).visibilityState;
});

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

describe("HeroVideo", () => {
  it("plays once after mount, muted, when motion is allowed", () => {
    mockReducedMotion(false);
    render(<HeroVideo />);
    expect(play).toHaveBeenCalledTimes(1);
    expect(mutedAtPlay).toEqual([true]);
  });

  it("never plays under reduced motion", () => {
    mockReducedMotion(true);
    render(<HeroVideo />);
    expect(play).not.toHaveBeenCalled();
  });

  it("never plays when the visitor asks to save data, even when the tab comes back", () => {
    mockReducedMotion(false);
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    render(<HeroVideo />);
    setVisibility("hidden");
    setVisibility("visible");
    expect(play).not.toHaveBeenCalled();
  });

  it("does not start in a hidden tab, then starts when it becomes visible", () => {
    mockReducedMotion(false);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    render(<HeroVideo />);
    expect(play).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("pauses while the tab is hidden and resumes on return", () => {
    mockReducedMotion(false);
    render(<HeroVideo />);
    setVisibility("hidden");
    expect(pause).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("pauses when the hero leaves the viewport and resumes when it returns", () => {
    mockReducedMotion(false);
    const { unmount } = render(<HeroVideo />);
    act(() => observe([{ isIntersecting: false }]));
    expect(pause).toHaveBeenCalledTimes(1);
    act(() => observe([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalledTimes(2);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("pauses when reduced motion is switched on while playing, and stays paused", () => {
    const motion = mockReducedMotion(false);
    render(<HeroVideo />);
    act(() => motion.set(true));
    expect(pause).toHaveBeenCalled();
    setVisibility("visible");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps the poster when play() is refused", async () => {
    mockReducedMotion(false);
    play.mockImplementation(() => Promise.reject(new DOMException("NotAllowedError")));
    expect(() => render(<HeroVideo />)).not.toThrow();
    await act(async () => {});
    expect(screen.getByTestId("hero-video")).toHaveAttribute("poster", "/landing/videos/sparring-01-v1-poster.jpg");
  });
});
