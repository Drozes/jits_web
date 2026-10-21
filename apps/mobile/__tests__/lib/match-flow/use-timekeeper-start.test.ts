/**
 * The timekeeper's Start (timekeeper mode spec 4.2 Start, R13; slice M3):
 *  - the gate follows the server's `start_blockers` in their order (the
 *    `_tk_start_blockers` list `start_match` refuses with the first of), and
 *    only then the client's camera gate (D12);
 *  - Start calls `start_match` once per tap, never from an effect and never
 *    again by itself (A29: no automatic retry in timekeeper mode); a success
 *    sends `timer_started` naming the timekeeper and re-reads the match;
 *  - Start and the timekeeper's Leave exclude each other (`StartClaim`,
 *    `useStartClaim`): no Start while a Leave is in flight, no Leave from the
 *    Start's claim on, and none after the Start went through (A5, R21).
 */
import * as React from "react";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  startMatchAsTimekeeper: (...a: unknown[]) => mockStart(...a),
}));

import type { TimekeeperStartBlocker } from "@jits/shared/api/timekeeper";
import { toast } from "@/components/ui/toast";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import {
  cameraGateOf,
  deriveStartGate,
  reasonForBlocker,
  useStartClaim,
  useTimekeeperStart,
  type StartClaim,
  type StartGate,
} from "@/lib/match-flow/use-timekeeper-start";

const OPEN: StartGate = { canStart: true, reason: null };

describe("deriveStartGate: the server's blocker order, then the camera", () => {
  const gate = (blockers: TimekeeperStartBlocker[] | null, owes = false, camera: "ready" | "waiting" | "denied" = "ready") =>
    deriveStartGate({ blockers, timekeeperOwesVerdict: owes, camera });

  it("waits for the first state read (TK-K7)", () => {
    expect(gate(null)).toEqual({ canStart: false, reason: "TK-K7" });
  });

  it("each blocker on its own reads its reason", () => {
    expect(gate(["timekeeper_required"])).toEqual({ canStart: false, reason: "TK-K7" });
    expect(gate(["athletes_not_ready"])).toEqual({ canStart: false, reason: "TK-K7" });
    expect(gate(["weight_flagged"])).toEqual({ canStart: false, reason: "hold" });
    expect(gate(["weight_recheck_pending"], true)).toEqual({ canStart: false, reason: "TK-K8" });
    expect(gate(["weight_check_pending"], true)).toEqual({ canStart: false, reason: "TK-K8" });
    // The athletes' own checks still owed (the timekeeper owes nothing).
    expect(gate(["weight_check_pending"], false)).toEqual({ canStart: false, reason: "TK-K7" });
    expect(gate(["weight_recheck_pending"], false)).toEqual({ canStart: false, reason: "TK-K7" });
    expect(gate(["timekeeper_not_recording"])).toEqual({ canStart: false, reason: "TK-K10" });
    expect(gate(["other"])).toEqual({ canStart: false, reason: "TK-K7" });
  });

  it("the FIRST server blocker decides, exactly as start_match refuses (jr_be 024 3.6 order)", () => {
    // _tk_start_blockers order: timekeeper_required, athletes_not_ready,
    // weight_flagged, weight_recheck_pending, weight_check_pending,
    // timekeeper_not_recording.
    const full: TimekeeperStartBlocker[] = [
      "timekeeper_required",
      "athletes_not_ready",
      "weight_flagged",
      "weight_recheck_pending",
      "weight_check_pending",
      "timekeeper_not_recording",
    ];
    const expected = ["TK-K7", "TK-K7", "hold", "TK-K8", "TK-K8", "TK-K10"];
    full.forEach((_, i) => {
      expect([full[i], gate(full.slice(i), true, "waiting").reason]).toEqual([full[i], expected[i]]);
    });
    // Both athletes not ready AND the timekeeper owing verdicts: the server's
    // order says WAITING FOR BOTH ATHLETES first.
    expect(gate(["athletes_not_ready", "weight_check_pending"], true).reason).toBe("TK-K7");
    // A flag holds the match even when a verdict is also owed.
    expect(gate(["weight_flagged", "weight_check_pending"], true).reason).toBe("hold");
  });

  it("no server blocker left: the camera gate decides (TK-K10), then Start is open", () => {
    expect(gate([], false, "waiting")).toEqual({ canStart: false, reason: "TK-K10" });
    expect(gate([], false, "denied")).toEqual({ canStart: false, reason: "TK-K10" });
    expect(gate([], false, "ready")).toEqual(OPEN);
    // A server blocker always outranks the camera.
    expect(gate(["athletes_not_ready"], false, "denied").reason).toBe("TK-K7");
  });

  it("reasonForBlocker covers every blocker the client knows", () => {
    for (const b of ["timekeeper_required", "athletes_not_ready", "weight_flagged", "weight_recheck_pending", "weight_check_pending", "timekeeper_not_recording", "other"] as const) {
      expect(["TK-K7", "TK-K8", "TK-K10", "hold"]).toContain(reasonForBlocker(b, true));
    }
  });
});

describe("cameraGateOf (D12)", () => {
  it("ready only with permission and consent", () => {
    expect(cameraGateOf({ granted: true, canAskAgain: true }, true)).toBe("ready");
    expect(cameraGateOf({ granted: true, canAskAgain: true }, false)).toBe("waiting");
    expect(cameraGateOf(null, true)).toBe("waiting");
    expect(cameraGateOf({ granted: false, canAskAgain: true }, true)).toBe("waiting");
  });

  it("denied once the OS will not ask again (TK-K11)", () => {
    expect(cameraGateOf({ granted: false, canAskAgain: false }, true)).toBe("denied");
    expect(cameraGateOf({ granted: false, canAskAgain: false }, false)).toBe("denied");
  });
});

describe("useTimekeeperStart", () => {
  const reconcileNow = jest.fn();
  const broadcast = jest.fn(() => Promise.resolve("ok"));
  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      MatchSyncProvider,
      {
        value: {
          onChannelStatus: () => {},
          reconcileNow,
          markExiting: () => {},
          subscribeSnapshot: () => () => {},
          timekeeperModeSelfId: "tk-1",
        },
      },
      children,
    );
  }
  const claimOk = jest.fn(() => true);
  const release = jest.fn();
  const claim: StartClaim = { claim: claimOk, release };
  const params = (gate: StartGate, c: StartClaim = claim) => ({
    matchId: "M1",
    timekeeperId: "tk-1",
    gate,
    claim: c,
    broadcastTimerStarted: broadcast,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls start_match only on a tap, never by itself", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { startedAt: "2026-10-21T12:00:00.000Z" } });
    renderHook(() => useTimekeeperStart(params(OPEN)), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("a closed gate does nothing", async () => {
    const { result } = renderHook(() => useTimekeeperStart(params({ canStart: false, reason: "TK-K7" })), { wrapper });
    await act(async () => {
      result.current.start();
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("success: timer_started names the timekeeper, then the match is re-read; Start stays busy", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { startedAt: "2026-10-21T12:00:00.000Z" } });
    const { result } = renderHook(() => useTimekeeperStart(params(OPEN)), { wrapper });
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(broadcast).toHaveBeenCalledWith("2026-10-21T12:00:00.000Z", "tk-1");
    expect(reconcileNow).toHaveBeenCalled();
    expect(result.current.starting).toBe(true);
    // The claim is kept: Leave stays gone once the Start went through.
    expect(claimOk).toHaveBeenCalledTimes(1);
    expect(release.mock.calls).toEqual([[true]]);
  });

  it("a Leave in flight refuses the claim: no start_match, no toast", async () => {
    const leaving: StartClaim = { claim: jest.fn(() => false), release };
    const { result } = renderHook(() => useTimekeeperStart(params(OPEN, leaving)), { wrapper });
    await act(async () => {
      result.current.start();
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(result.current.starting).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("a closed gate never claims (Leave stays offered)", async () => {
    const { result } = renderHook(() => useTimekeeperStart(params({ canStart: false, reason: "TK-K7" })), { wrapper });
    await act(async () => {
      result.current.start();
    });
    expect(claimOk).not.toHaveBeenCalled();
  });

  it("a double tap starts once", async () => {
    let resolve!: (v: unknown) => void;
    mockStart.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useTimekeeperStart(params(OPEN)), { wrapper });
    await act(async () => {
      result.current.start();
      result.current.start();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, data: { startedAt: "2026-10-21T12:00:00.000Z" } });
    });
  });

  it("a refusal says Couldn't start match once, re-reads and is never retried by itself (A29)", async () => {
    jest.useFakeTimers();
    try {
      mockStart.mockResolvedValue({ ok: false, error: { code: "ATHLETES_NOT_READY", message: "Both athletes need to be ready." } });
      const { result } = renderHook(() => useTimekeeperStart(params(OPEN)), { wrapper });
      await act(async () => {
        result.current.start();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.starting).toBe(false);
      // The claim is given back: Leave is offered again.
      expect(release.mock.calls).toEqual([[false]]);
      expect(toast.error).toHaveBeenCalledTimes(1);
      // The deck's title only: a timekeeper-mode surface never shows the server's text (M-R4).
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match" });
      expect(reconcileNow).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(broadcast).not.toHaveBeenCalled();
      // Another tap is another single attempt.
      await act(async () => {
        result.current.start();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockStart).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("useStartClaim: the face-off's Start and Leave guard", () => {
  const refs = (started = false, cancelled = false) => ({
    startedRef: { current: started },
    cancelledRef: { current: cancelled },
  });

  it("a claim hides Leave; giving it back offers Leave again", () => {
    const r = refs();
    const { result } = renderHook(() => useStartClaim(r.startedRef, r.cancelledRef));
    expect(result.current.claimed).toBe(false);
    let ok = false;
    act(() => {
      ok = result.current.claim.claim();
    });
    expect(ok).toBe(true);
    expect(result.current.claimed).toBe(true);
    act(() => result.current.claim.release(false));
    expect(result.current.claimed).toBe(false);
    expect(r.startedRef.current).toBe(false);
  });

  it("a Start that went through keeps Leave gone and marks the face-off started", () => {
    const r = refs();
    const { result } = renderHook(() => useStartClaim(r.startedRef, r.cancelledRef));
    act(() => {
      result.current.claim.claim();
    });
    act(() => result.current.claim.release(true));
    expect(result.current.claimed).toBe(true);
    expect(r.startedRef.current).toBe(true);
    // Nothing more to claim.
    let again = true;
    act(() => {
      again = result.current.claim.claim();
    });
    expect(again).toBe(false);
  });

  it("a Leave in flight (cancelledRef) refuses the claim", () => {
    const r = refs(false, true);
    const { result } = renderHook(() => useStartClaim(r.startedRef, r.cancelledRef));
    let ok = true;
    act(() => {
      ok = result.current.claim.claim();
    });
    expect(ok).toBe(false);
    expect(result.current.claimed).toBe(false);
  });
});
