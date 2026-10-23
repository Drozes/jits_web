/**
 * The face-off's Leave policy and alerts (`use-faceoff-leave.ts`; slice M4,
 * spec 4.3, ARCHITECTURE 2.3 "Leave"):
 *  - default `cancel_for_all`: the shipped alert and cancel, unchanged;
 *  - an athlete once a timekeeper is seated: TK-E4 names the opponent;
 *    while nobody is seated (picking) the shipped body stays (review n2);
 *  - `timekeeper_seat`: TK-K14 names both athletes, `leave_match_as_timekeeper`,
 *    then the exit with TK-K17 through `exitMatchTo`; a refusal or a failure
 *    re-arms and re-reads;
 *  - `none`: no Leave.
 * A failed cancel in a timekeeper-mode match (the sync context's
 * `timekeeperModeSelfId`; the crew step and the athlete face-off) shows the
 * shipped title alone and re-reads, never the server's text (M-R4); a
 * two-athlete match keeps the shipped toast byte for byte.
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }));
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ cancelSessionMatch: (...a: unknown[]) => mockCancel(...a) }));
const mockLeaveSeat = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  leaveMatchAsTimekeeper: (...a: unknown[]) => mockLeaveSeat(...a),
  endMatchClock: jest.fn(),
}));

import { useFaceoffLeave, type FaceoffLeaveParams } from "@/lib/match-flow/use-faceoff-leave";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { toast as mockToast } from "@/components/ui/toast";
import type { MatchAthleteView, MatchRoles } from "@/lib/match-flow/match-roles";

function athlete(id: string, short: string, isChallenger: boolean): MatchAthleteView {
  return {
    athleteId: id,
    displayName: short,
    shortName: short,
    currentElo: null,
    weightLbs: null,
    photoUrl: null,
    outcome: null,
    eloBefore: null,
    eloAfter: null,
    eloDelta: null,
    weightDivisionGap: null,
    isChallenger,
  };
}
const REYES = athlete("a-1", "M. Reyes", true);
const OKAFOR = athlete("a-2", "D. Okafor", false);
const SEATED = { id: "tk-1", name: "Jordan Cruz", shortName: "J. Cruz" };
type LeaveRoles = Pick<MatchRoles, "opponent" | "athletes" | "timekeeper">;
const athleteRoles = (timekeeper: LeaveRoles["timekeeper"]): LeaveRoles => ({
  opponent: OKAFOR,
  athletes: [REYES, OKAFOR],
  timekeeper,
});
const timekeeperRoles: LeaveRoles = { opponent: null, athletes: [REYES, OKAFOR], timekeeper: SEATED };

const markExiting = jest.fn();
const reconcileNow = jest.fn();
const broadcast = jest.fn(() => Promise.resolve("ok"));

type Policy = Omit<FaceoffLeaveParams, "matchId" | "exitHref" | "startedRef" | "cancelledRef" | "broadcastMatchCancelled">;

function setup(policy: Policy = {}, started = false, timekeeperModeSelfId?: string) {
  const startedRef = { current: started };
  const cancelledRef = { current: false };
  const value = {
    onChannelStatus: jest.fn(),
    reconcileNow,
    markExiting,
    subscribeSnapshot: () => () => undefined,
    ...(timekeeperModeSelfId ? { timekeeperModeSelfId } : {}),
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => <MatchSyncProvider value={value}>{children}</MatchSyncProvider>;
  const { result } = renderHook(
    () =>
      useFaceoffLeave({
        matchId: "M1",
        exitHref: "/arena",
        startedRef,
        cancelledRef,
        broadcastMatchCancelled: broadcast,
        ...policy,
      } as FaceoffLeaveParams),
    { wrapper },
  );
  return { result, cancelledRef };
}

/** Taps Leave and answers the alert: index 1 is the destructive action, 0 the safe one. */
async function leaveAndAnswer(result: { current: { leave: () => void } }, confirm = true) {
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    if (confirm) buttons?.[1]?.onPress?.();
  });
  await act(async () => {
    result.current.leave();
  });
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  return alert;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockCancel.mockResolvedValue({ ok: true, data: {} });
  mockLeaveSeat.mockResolvedValue({ ok: true, data: { status: "pending" } });
});

const SHIPPED_BUTTONS = [
  expect.objectContaining({ text: "Keep Waiting", style: "cancel" }),
  expect.objectContaining({ text: "Cancel Match", style: "destructive" }),
];

describe("an athlete's Leave (cancel_for_all, the default)", () => {
  it("is the shipped alert and cancel, then the exit (a two-athlete match passes no policy)", async () => {
    const { result } = setup();
    const alert = await leaveAndAnswer(result);
    expect(alert).toHaveBeenCalledWith("Cancel match?", "Your opponent will be returned to the lobby.", SHIPPED_BUTTONS);
    expect(mockCancel).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(markExiting).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith("/arena");
    expect(mockLeaveSeat).not.toHaveBeenCalled();
  });

  it("keeps the shipped body while nobody is seated (picking, review round 6 n2)", async () => {
    const { result } = setup({ leave: "cancel_for_all", roles: athleteRoles(null) });
    const alert = await leaveAndAnswer(result, false);
    expect(alert).toHaveBeenCalledWith("Cancel match?", "Your opponent will be returned to the lobby.", SHIPPED_BUTTONS);
  });

  it("names the opponent and the timekeeper once one is seated (TK-E4)", async () => {
    const { result } = setup({ leave: "cancel_for_all", roles: athleteRoles(SEATED) });
    const alert = await leaveAndAnswer(result);
    expect(alert).toHaveBeenCalledWith("Cancel match?", "D. Okafor and your timekeeper go back to the Arena.", SHIPPED_BUTTONS);
    // The same cancel for all three (R20).
    expect(mockCancel).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(mockDismissTo).toHaveBeenCalledWith("/arena");
  });

  it("a failed cancel re-arms Leave with the shipped toast", async () => {
    mockCancel.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { result, cancelledRef } = setup();
    await leaveAndAnswer(result);
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Could not cancel", description: "boom" });
    expect(cancelledRef.current).toBe(false);
    expect(result.current.cancelling).toBe(false);
    expect(mockDismissTo).not.toHaveBeenCalled();
    // A two-athlete match: nothing else, exactly as shipped.
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(reconcileNow).not.toHaveBeenCalled();
  });

  it.each([
    ["the crew step (nobody seated, no policy passed)", {}],
    ["the athlete face-off once a timekeeper is seated", { leave: "cancel_for_all", roles: athleteRoles(SEATED) }],
  ] as [string, Policy][])(
    "timekeeper mode, %s: a cancel refused because the match moved on (it started) shows the shipped title alone, which is true, and re-reads (M-R4, PM29)",
    async (_name, policy) => {
      mockCancel.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "This match has already been started." } });
      const { result, cancelledRef } = setup(policy, false, "a-1");
      await leaveAndAnswer(result);
      expect(mockToast.error).toHaveBeenCalledTimes(1);
      expect(mockToast.error).toHaveBeenCalledWith({ text1: "Could not cancel" });
      expect(reconcileNow).toHaveBeenCalledTimes(1);
      expect(cancelledRef.current).toBe(false);
      expect(result.current.cancelling).toBe(false);
      expect(mockDismissTo).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["the crew step (nobody seated, no policy passed)", {}],
    ["the athlete face-off once a timekeeper is seated", { leave: "cancel_for_all", roles: athleteRoles(SEATED) }],
  ] as [string, Policy][])(
    "timekeeper mode, %s: a cancel that failed for another reason adds the guidance (PM29), never the server's text",
    async (_name, policy) => {
      mockCancel.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
      const { result, cancelledRef } = setup(policy, false, "a-1");
      await leaveAndAnswer(result);
      expect(mockToast.error).toHaveBeenCalledTimes(1);
      expect(mockToast.error).toHaveBeenCalledWith({ text1: "Could not cancel", description: "Check your connection and try again." });
      expect(reconcileNow).toHaveBeenCalledTimes(1);
      expect(cancelledRef.current).toBe(false);
      expect(result.current.cancelling).toBe(false);
    },
  );

  it("timekeeper mode, a successful cancel exits exactly as before", async () => {
    const { result } = setup({ leave: "cancel_for_all", roles: athleteRoles(SEATED) }, false, "a-1");
    await leaveAndAnswer(result);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(markExiting).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith("/arena");
  });

  it("is gone once the match started", async () => {
    const { result } = setup({}, true);
    const alert = await leaveAndAnswer(result);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("the timekeeper's Leave before the start (timekeeper_seat, A5)", () => {
  it("asks with TK-K14, naming both athletes challenger first", async () => {
    const { result } = setup({ leave: "timekeeper_seat", roles: timekeeperRoles });
    const alert = await leaveAndAnswer(result, false);
    expect(alert).toHaveBeenCalledWith("Stop timekeeping?", "M. Reyes and D. Okafor will pick a new timekeeper.", [
      expect.objectContaining({ text: "Keep timekeeping", style: "cancel" }),
      expect.objectContaining({ text: "Leave", style: "destructive" }),
    ]);
    expect(mockLeaveSeat).not.toHaveBeenCalled();
  });

  it("leaves the seat and exits through exitMatchTo with TK-K17; never cancels the match", async () => {
    const { result } = setup({ leave: "timekeeper_seat", roles: timekeeperRoles });
    await leaveAndAnswer(result);
    expect(mockLeaveSeat).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(mockCancel).not.toHaveBeenCalled();
    expect(markExiting).toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith({ text1: "You're no longer timekeeping this match." });
    expect(mockDismissTo).toHaveBeenCalledWith("/arena");
    // No cancel to announce: the athletes' reconcilers see the seat go.
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("refused because the match moved on (it started, or the seat is gone): re-arms and re-reads", async () => {
    mockLeaveSeat.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "x" } });
    const { result, cancelledRef } = setup({ leave: "timekeeper_seat", roles: timekeeperRoles });
    await leaveAndAnswer(result);
    expect(reconcileNow).toHaveBeenCalled();
    expect(cancelledRef.current).toBe(false);
    expect(result.current.cancelling).toBe(false);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("a network failure re-arms and re-reads, with no raw message shown (M-R4)", async () => {
    mockLeaveSeat.mockRejectedValue(new Error("offline"));
    const { result } = setup({ leave: "timekeeper_seat", roles: timekeeperRoles });
    await leaveAndAnswer(result);
    expect(reconcileNow).toHaveBeenCalled();
    expect(result.current.cancelling).toBe(false);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("the clock was running after all (a no contest): the wizard's exit shows it (TK-NC3)", async () => {
    mockLeaveSeat.mockResolvedValue({ ok: true, data: { status: "cancelled" } });
    const { result, cancelledRef } = setup({ leave: "timekeeper_seat", roles: timekeeperRoles });
    await leaveAndAnswer(result);
    expect(reconcileNow).toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(cancelledRef.current).toBe(true);
    expect(result.current.cancelling).toBe(true);
  });
});

describe("no Leave (none)", () => {
  it("offers nothing", async () => {
    const { result } = setup({ leave: "none", roles: athleteRoles(SEATED) });
    const alert = await leaveAndAnswer(result);
    expect(alert).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockLeaveSeat).not.toHaveBeenCalled();
  });
});
