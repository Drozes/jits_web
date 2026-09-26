/**
 * The live step's pause re-sync (lib/match-flow/use-pause-resync.ts).
 *
 * The race it closes: a reconciler read of the `matches` row can be in
 * flight across a pause or resume this device applies (its own tap or the
 * opponent's broadcast). The read lands after the change, carries the OLD
 * pause state, and used to be applied as if newer: a resumed timer was
 * re-paused (or a paused one restarted) until the next poll, up to 10 s.
 */
import { act, renderHook } from "@testing-library/react-native";
import {
  isStalePauseRead,
  usePauseResync,
  type KnownPauseState,
} from "@/lib/match-flow/use-pause-resync";

const P1 = "2026-09-25T12:01:00.000Z";
// The same instant as the row formats it (the RPC and the row may differ).
const P1_ROW = "2026-09-25T12:01:00+00:00";
const P2 = "2026-09-25T12:03:00.000Z";

function known(pausedAt: string | null, total: number, resumed: string[] = []): KnownPauseState {
  return { pausedAt, totalPausedDuration: total, resumed: resumed.map((s) => Date.parse(s)) };
}

describe("isStalePauseRead", () => {
  it("a smaller total predates a resume already applied", () => {
    expect(isStalePauseRead(known(null, 12, [P1]), { pausedAt: P1_ROW, totalPausedDuration: 0 })).toBe(true);
    expect(isStalePauseRead(known(P2, 12, [P1]), { pausedAt: null, totalPausedDuration: 0 })).toBe(true);
  });

  it("a larger total is a resume this device missed", () => {
    expect(isStalePauseRead(known(P1, 0), { pausedAt: null, totalPausedDuration: 12 })).toBe(false);
    expect(isStalePauseRead(known(P1, 0), { pausedAt: P2, totalPausedDuration: 12 })).toBe(false);
  });

  it("same total, running read while paused here: read before the pause", () => {
    expect(isStalePauseRead(known(P1, 0), { pausedAt: null, totalPausedDuration: 0 })).toBe(true);
  });

  it("same total, paused read while running here: a pause this device missed", () => {
    expect(isStalePauseRead(known(null, 0), { pausedAt: P1_ROW, totalPausedDuration: 0 })).toBe(false);
  });

  it("same total, paused read of a pause already resumed (sub-second pause adds 0)", () => {
    expect(isStalePauseRead(known(null, 0, [P1]), { pausedAt: P1_ROW, totalPausedDuration: 0 })).toBe(true);
  });

  it("the state already in hand is not stale (applying it is a no-op)", () => {
    expect(isStalePauseRead(known(P1, 0), { pausedAt: P1_ROW, totalPausedDuration: 0 })).toBe(false);
    expect(isStalePauseRead(known(null, 12), { pausedAt: null, totalPausedDuration: 12 })).toBe(false);
  });
});

describe("usePauseResync", () => {
  function setup(initial: { pausedAt: string | null; total: number }) {
    const inner = jest.fn();
    const baseTimer = {
      elapsed: 0,
      remaining: 300,
      running: true,
      paused: false,
      formatted: "05:00",
      percentComplete: 0,
      syncFromBroadcast: inner,
    };
    const hook = renderHook(
      ({ pausedAt, total }: { pausedAt: string | null; total: number }) =>
        usePauseResync(baseTimer, pausedAt, total),
      { initialProps: initial },
    );
    return { inner, hook };
  }

  it("does not apply the mount-time props (the timer already has them)", () => {
    const { inner } = setup({ pausedAt: null, total: 0 });
    expect(inner).not.toHaveBeenCalled();
  });

  it("the race: a read taken while paused, landing after this device resumed, is ignored", () => {
    const { inner, hook } = setup({ pausedAt: null, total: 0 });
    // Local tap: pause, then resume (each via the returned timer, as the
    // live controls do), before any poll saw the pause.
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    act(() => hook.result.current.syncFromBroadcast({ type: "resumed", totalPausedDuration: 12 }));
    inner.mockClear();

    // The straddling read lands: still paused at P1, old total.
    hook.rerender({ pausedAt: P1_ROW, total: 0 });
    expect(inner).not.toHaveBeenCalled();

    // The next, fresh read is applied (a no-op resume with the same total).
    hook.rerender({ pausedAt: null, total: 12 });
    expect(inner).toHaveBeenCalledWith({ type: "resumed", totalPausedDuration: 12 });
  });

  it("the race the other way: a running read landing after a pause is ignored", () => {
    const { inner, hook } = setup({ pausedAt: P1_ROW, total: 0 });
    // The opponent resumes (broadcast), then pauses again.
    act(() => hook.result.current.syncFromBroadcast({ type: "resumed", totalPausedDuration: 12 }));
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P2 }));
    inner.mockClear();

    // A read taken between the two lands now: running, total 12.
    hook.rerender({ pausedAt: null, total: 12 });
    expect(inner).not.toHaveBeenCalled();
  });

  it("still applies a pause this device missed entirely", () => {
    const { inner, hook } = setup({ pausedAt: null, total: 0 });
    hook.rerender({ pausedAt: P1_ROW, total: 0 });
    expect(inner).toHaveBeenCalledWith({ type: "paused", pausedAt: P1_ROW });
  });

  it("still applies a resume this device missed entirely", () => {
    const { inner, hook } = setup({ pausedAt: P1_ROW, total: 0 });
    hook.rerender({ pausedAt: null, total: 9 });
    expect(inner).toHaveBeenCalledWith({ type: "resumed", totalPausedDuration: 9 });
  });

  it("forwards every event to the underlying timer", () => {
    const { inner, hook } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    expect(inner).toHaveBeenCalledWith({ type: "paused", pausedAt: P1 });
  });
});
