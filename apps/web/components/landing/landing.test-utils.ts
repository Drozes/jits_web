import { vi } from "vitest";

/** Every formatted ticker line (addendum 7.2, owner resolution of Q4). */
export const TICK_PATTERN =
  /^(122\.5|136|149|162|175\.5|188\.5|202|215) LBS · (WIN ▲([3-9]|1\d|20)|LOSS ▼([3-9]|1[0-8])|DRAW [▲▼][1-3])$/;

/**
 * A controllable matchMedia for the reduced-motion tests: `set(true)` flips
 * "(prefers-reduced-motion: reduce)" and fires its change listeners.
 */
export function mockReducedMotion(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() { return matches; },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}
