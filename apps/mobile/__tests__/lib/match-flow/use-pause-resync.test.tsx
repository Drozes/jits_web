/**
 * The live step's pause re-sync (lib/match-flow/use-pause-resync.ts).
 *
 * The race it closes: a reconciler read of the `matches` row can be in
 * flight across a pause or resume this device applies (its own tap or the
 * opponent's broadcast). The read lands after the change, carries the OLD
 * pause state, and used to be applied as if newer: a resumed timer was
 * re-paused (or a paused one restarted) until the next poll.
 *
 * And the stuck case it must never cause: an equal-total disagreement is
 * held back only within PAUSE_STALE_WINDOW_MS, and every snapshot (even an
 * identical one) is re-evaluated, so a genuine state lands on the next poll.
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  isSamePauseState,
  isStalePauseRead,
  PAUSE_STALE_WINDOW_MS,
  usePauseResync,
  type KnownPauseState,
} from "@/lib/match-flow/use-pause-resync";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import type { MatchDetails } from "@jits/shared/api/queries";

const P1 = "2026-09-25T12:01:00.000Z";
// The same instant as the row formats it (the RPC and the row may differ).
const P1_ROW = "2026-09-25T12:01:00+00:00";
const P2 = "2026-09-25T12:03:00.000Z";
const NOW = 1_000_000;
const IN = NOW - 1_000; // a change 1 s ago: inside the window
const OUT = NOW - PAUSE_STALE_WINDOW_MS - 1; // just outside it

function known(
  pausedAt: string | null,
  total: number,
  lastChangeAt: number | null,
  resumed: string[] = [],
): KnownPauseState {
  return {
    pausedAt,
    totalPausedDuration: total,
    resumed: resumed.map((s) => Date.parse(s)),
    lastChangeAt,
  };
}
const db = (pausedAt: string | null, total: number) => ({ pausedAt, totalPausedDuration: total });

describe("isStalePauseRead", () => {
  it("a smaller total always predates a resume already applied", () => {
    expect(isStalePauseRead(known(null, 12, OUT, [P1]), db(P1_ROW, 0), NOW)).toBe(true);
    expect(isStalePauseRead(known(P2, 12, OUT, [P1]), db(null, 0), NOW)).toBe(true);
  });

  it("a larger total is a resume this device missed", () => {
    expect(isStalePauseRead(known(P1, 0, IN), db(null, 12), NOW)).toBe(false);
    expect(isStalePauseRead(known(P1, 0, IN), db(P2, 12), NOW)).toBe(false);
  });

  it("same total, running read while paused here: stale only inside the window", () => {
    expect(isStalePauseRead(known(P1, 0, IN), db(null, 0), NOW)).toBe(true);
    // After the window it may be a real 0 s resume whose broadcast was lost.
    expect(isStalePauseRead(known(P1, 0, OUT), db(null, 0), NOW)).toBe(false);
    // Paused since mount (no change applied here): trusted.
    expect(isStalePauseRead(known(P1, 0, null), db(null, 0), NOW)).toBe(false);
  });

  it("same total, paused read of a pause already seen resumed: stale only inside the window", () => {
    expect(isStalePauseRead(known(null, 0, IN, [P1]), db(P1_ROW, 0), NOW)).toBe(true);
    expect(isStalePauseRead(known(null, 0, OUT, [P1]), db(P1_ROW, 0), NOW)).toBe(false);
  });

  it("same total, a new pause this device missed is applied at once", () => {
    expect(isStalePauseRead(known(null, 0, IN, [P1]), db(P2, 0), NOW)).toBe(false);
  });

  it("an unparseable paused_at never matches a recorded resume", () => {
    expect(isStalePauseRead(known(null, 0, IN, [P1]), db("not-a-date", 0), NOW)).toBe(false);
  });
});

describe("isSamePauseState", () => {
  it("compares paused_at as instants, not strings", () => {
    expect(isSamePauseState(known(P1, 0, null), db(P1_ROW, 0))).toBe(true);
    expect(isSamePauseState(known(P1, 0, null), db(P2, 0))).toBe(false);
    expect(isSamePauseState(known(null, 3, null), db(null, 3))).toBe(true);
    expect(isSamePauseState(known(null, 3, null), db(null, 4))).toBe(false);
  });
  it("falls back to string equality when a timestamp does not parse", () => {
    expect(isSamePauseState(known("x", 0, null), db("x", 0))).toBe(true);
    expect(isSamePauseState(known("x", 0, null), db("y", 0))).toBe(false);
  });
});

describe("usePauseResync", () => {
  let now = NOW;
  beforeEach(() => {
    now = NOW;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  function setup(initial: { pausedAt: string | null; total: number }) {
    const inner = jest.fn();
    let listener: ((m: MatchDetails) => void) | null = null;
    const ctx = {
      onChannelStatus: jest.fn(),
      reconcileNow: jest.fn(),
      markExiting: jest.fn(),
      subscribeSnapshot: (l: (m: MatchDetails) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatchSyncProvider value={ctx}>{children}</MatchSyncProvider>
    );
    const baseTimer = {
      elapsed: 0,
      remaining: 300,
      running: true,
      paused: false,
      formatted: "05:00",
      percentComplete: 0,
      syncFromBroadcast: inner,
    };
    const hook = renderHook(() => usePauseResync(baseTimer, initial.pausedAt, initial.total), {
      wrapper,
    });
    const snapshot = (pausedAt: string | null, total: number, status = "in_progress") =>
      act(() =>
        listener?.({
          status,
          paused_at: pausedAt,
          total_paused_duration: total,
        } as MatchDetails),
      );
    return { inner, hook, snapshot };
  }

  it("ignores a snapshot equal to the state in hand", () => {
    const { inner, snapshot } = setup({ pausedAt: null, total: 0 });
    snapshot(null, 0);
    expect(inner).not.toHaveBeenCalled();
  });

  it("the race: a read taken while paused, landing just after this device resumed, is ignored", () => {
    const { inner, hook, snapshot } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    now += 5_000;
    act(() => hook.result.current.syncFromBroadcast({ type: "resumed", totalPausedDuration: 0 }));
    inner.mockClear();

    now += 300; // the straddling read lands inside the window
    snapshot(P1_ROW, 0);
    expect(inner).not.toHaveBeenCalled();
  });

  it("the race the other way: a running read landing just after a pause is ignored", () => {
    const { inner, hook, snapshot } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    inner.mockClear();
    now += 300;
    snapshot(null, 0);
    expect(inner).not.toHaveBeenCalled();
  });

  it("the stuck case recovers: a sub-second pause whose resume broadcast was lost", () => {
    const { inner, hook, snapshot } = setup({ pausedAt: null, total: 0 });
    // Opponent's pause arrives by broadcast; their resume 0.3 s later is
    // lost, and resume_match added 0 s, so the row reads {null, 0}.
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    inner.mockClear();

    now += 1_000; // a poll inside the window: held back
    snapshot(null, 0);
    expect(inner).not.toHaveBeenCalled();

    now += 10_000; // the next poll, an identical read, after the window
    snapshot(null, 0);
    expect(inner).toHaveBeenCalledWith({ type: "resumed", totalPausedDuration: 0 });
  });

  it("a later genuine state is applied even when the stale one was never seen as a change", () => {
    const { inner, hook, snapshot } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    act(() => hook.result.current.syncFromBroadcast({ type: "resumed", totalPausedDuration: 0 }));
    inner.mockClear();
    now += 300;
    snapshot(P1_ROW, 0); // straddling read, ignored
    now += 10_000;
    snapshot(null, 0); // matches the state in hand: nothing to do
    expect(inner).not.toHaveBeenCalled();
  });

  it("applies a pause or a resume this device missed entirely", () => {
    const { inner, snapshot } = setup({ pausedAt: null, total: 0 });
    snapshot(P1_ROW, 0);
    expect(inner).toHaveBeenLastCalledWith({ type: "paused", pausedAt: P1_ROW });
    now += 500;
    snapshot(null, 9);
    expect(inner).toHaveBeenLastCalledWith({ type: "resumed", totalPausedDuration: 9 });
  });

  it("ignores snapshots once the match is no longer in progress", () => {
    const { inner, snapshot } = setup({ pausedAt: null, total: 0 });
    snapshot(P1_ROW, 0, "completed");
    expect(inner).not.toHaveBeenCalled();
  });

  it("does not record an unparseable paused_at as resumed", () => {
    const { inner, hook, snapshot } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: "garbage" }));
    act(() => hook.result.current.syncFromBroadcast({ type: "resumed", totalPausedDuration: 0 }));
    inner.mockClear();
    now += 300;
    // A real new pause inside the window is still applied (no NaN entry
    // in the resumed list could ever match, and none is stored).
    snapshot(P2, 0);
    expect(inner).toHaveBeenCalledWith({ type: "paused", pausedAt: P2 });
  });

  it("forwards every event to the underlying timer", () => {
    const { inner, hook } = setup({ pausedAt: null, total: 0 });
    act(() => hook.result.current.syncFromBroadcast({ type: "paused", pausedAt: P1 }));
    expect(inner).toHaveBeenCalledWith({ type: "paused", pausedAt: P1 });
  });
});
