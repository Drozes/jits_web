/**
 * The timekeeper's face-off (timekeeper mode spec 4.2 Weigh-in, Ready and
 * Start, R11, R13; COPY-DECK B6; slice M3, acceptance 14.8 M3):
 *  - the header: TK-K0 and the face-off timeout TK-D9;
 *  - one row per athlete, challenger first, on the RATED weights (PM26), with
 *    ready (TK-K3, TK-K4) and the weigh-in (TK-K1, TK-K2, TK-K5);
 *  - the verdicts (Confirm, Doesn't look right, Withdraw flag) only when the
 *    match has the timekeeper weight check (the sub-flag snapshot, A19, off
 *    and on), quoting the rated weight;
 *  - Start (TK-K6) gated in the server's blocker order, then the camera
 *    (TK-K10 to TK-K12); the locked record row (TK-K9); Start only on a tap;
 *  - Leave in the header (also Android back): the seat's drop-out before the
 *    start (A5, R21; TK-K14, `leave_match_as_timekeeper`), gone while Start
 *    is in flight and after it went through, and no Start while it is in
 *    flight.
 * Mounted as the wizard mounts it: inside the face-off provider, inactive.
 */
import * as React from "react";
import { Alert, BackHandler, Linking } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), back: jest.fn() }) }));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ cancelSessionMatch: (...a: unknown[]) => mockCancel(...a), startMatch: jest.fn() }));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: jest.fn(async () => ({ ok: true, data: null })),
}));
jest.mock("@/lib/invites/location", () => ({
  ...jest.requireActual("@/lib/invites/location"),
  readLocationOnce: jest.fn(async () => ({ status: "denied", canAskAgain: true })),
}));
jest.mock("@/lib/arena/location-telemetry", () => ({ logMatchStartLocation: jest.fn() }));
const mockRecorder: { permission: { granted: boolean; canAskAgain: boolean } | null } = {
  permission: { granted: true, canAskAgain: true },
};
jest.mock("@/components/match-flow/match-recorder-context", () => ({ useMatchRecorder: () => mockRecorder }));
const mockStart = jest.fn();
const mockCheck = jest.fn();
const mockLeave = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  startMatchAsTimekeeper: (...a: unknown[]) => mockStart(...a),
  checkAthleteWeightAsTimekeeper: (...a: unknown[]) => mockCheck(...a),
  leaveMatchAsTimekeeper: (...a: unknown[]) => mockLeave(...a),
}));
const mockSend = {
  broadcastTimerStarted: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
  broadcastRecordingOptIn: jest.fn(() => Promise.resolve("ok")),
  broadcastWeighedIn: jest.fn(() => Promise.resolve("ok")),
  broadcastReady: jest.fn(() => Promise.resolve("ok")),
};
const mockRecordConsent = jest.fn();
jest.mock("@jits/shared/api/moderation", () => ({
  ...jest.requireActual("@jits/shared/api/moderation"),
  recordAiProcessingConsent: (...a: unknown[]) => mockRecordConsent(...a),
}));
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({ useSessionMatchSync: () => mockSend }));

import type { TimekeeperMatchState, TimekeeperStartBlocker } from "@jits/shared/api/timekeeper";
import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTimekeeper, FaceoffTimekeeperTop } from "@/components/match-flow/faceoff/faceoff-timekeeper";
import { toast } from "@/components/ui/toast";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { stepSeams } from "@/lib/match-flow/step-seams";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { CHECK_ECHO_HOLD_MS } from "@/lib/match-flow/use-timekeeper-checks";
import { SEND_CEILING_MS } from "@/lib/match-flow/send-timing";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";
import { AI_PROCESSING_CONSENT_VERSION, TIMEKEEPER_CONSENT_VERSION } from "@jits/shared/api/moderation";
import { CH, OP, TK, timekeeperFaceoffProps, tkFlow, tkState } from "../../support/timekeeper-faceoff";

const mockReconcile = jest.fn();

function Screen({ state = tkState(), subFlag = true }: { state?: TimekeeperMatchState | null; subFlag?: boolean }) {
  const flow = tkFlow(TK, { subFlag, state });
  // The step renderer's input, exactly as it builds it (PM26).
  const ratedWeights = stepSeams(flow.roles, flow.tkState).ratedWeights ?? [];
  return (
    <MatchFlowProvider match={flow.match} roles={flow.roles} tkState={flow.tkState}>
      <MatchSyncProvider
        value={{
          onChannelStatus: () => {},
          reconcileNow: mockReconcile,
          markExiting: () => {},
          subscribeSnapshot: () => () => {},
          timekeeperModeSelfId: TK,
        }}
      >
        <FaceoffProvider {...timekeeperFaceoffProps(flow)}>
          <FaceoffTimekeeperTop />
          <FaceoffTimekeeper matchId="M1" durationSeconds={300} exitHref="/arena" ratedWeights={ratedWeights} />
        </FaceoffProvider>
      </MatchSyncProvider>
    </MatchFlowProvider>
  );
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const textOf = (s: ReturnType<typeof render>, id: string) => s.getByTestId(id).props.children;

beforeEach(() => {
  jest.clearAllMocks();
  mockRecorder.permission = { granted: true, canAskAgain: true };
  __resetAiConsentForTests({ athleteId: TK, consentAt: "2026-10-14T12:00:00Z", known: true });
  mockStart.mockResolvedValue({ ok: true, data: { startedAt: "2026-10-21T12:06:00.000Z" } });
});

describe("header (TK-K0, TK-D9)", () => {
  it("names the screen and counts down to the face-off timeout; the athletes' header is not theirs", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T12:00:01.000Z"));
    try {
      const s = render(<Screen />);
      await flush();
      expect(textOf(s, "faceoff-timekeeper-top-label")).toBe(C["TK-K0"]);
      expect(textOf(s, "timeout-chip-text")).toBe("NO CONTEST IN 9:59");
      expect(s.queryByTestId("faceoff-top-label")).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(textOf(s, "timeout-chip-text")).toBe("NO CONTEST IN 9:54");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("athlete rows (TK-K1 to TK-K5)", () => {
  it("challenger first, on the rated weights (never the profile weights), with ready from the server", async () => {
    const s = render(<Screen state={tkState({ ready: [OP] })} />);
    await flush();
    const rows = s.getAllByTestId(/^faceoff-athlete-row-/).map((r) => r.props.testID);
    expect(rows).toEqual([`faceoff-athlete-row-${CH}`, `faceoff-athlete-row-${OP}`]);
    expect(textOf(s, `faceoff-athlete-weight-${CH}`)).toBe("168 LBS");
    expect(textOf(s, `faceoff-athlete-weight-${OP}`)).toBe("170.2 LBS");
    expect(textOf(s, `faceoff-athlete-ready-${CH}`)).toBe(C["TK-K3"]);
    expect(textOf(s, `faceoff-athlete-ready-${OP}`)).toBe(C["TK-K4"]);
    expect(textOf(s, `faceoff-athlete-weigh-in-${CH}`)).toBe(C["TK-K2"]);
    s.getByText("M. Reyes");
    s.getByText("D. Okafor");
  });

  it("no rated weight yet: WEIGHING IN and no verdict to give", async () => {
    const s = render(<Screen state={tkState({ weights: { [CH]: null, [OP]: 170.2 } })} />);
    await flush();
    expect(textOf(s, `faceoff-athlete-weight-${CH}`)).toBe("-- LBS");
    expect(textOf(s, `faceoff-athlete-weigh-in-${CH}`)).toBe(C["TK-K1"]);
    expect(s.queryByTestId(`faceoff-athlete-confirm-${CH}`)).toBeNull();
    s.getByTestId(`faceoff-athlete-confirm-${OP}`);
  });

  it("before the first state read the rows wait: no weights, no verdicts, Start waiting (TK-K7)", async () => {
    const s = render(<Screen state={null} />);
    await flush();
    expect(textOf(s, `faceoff-athlete-weight-${CH}`)).toBe("-- LBS");
    expect(s.queryByTestId(`faceoff-athlete-confirm-${CH}`)).toBeNull();
    expect(textOf(s, "faceoff-start-reason")).toBe(C["TK-K7"]);
  });
});

describe("the timekeeper's weight verdicts (R11; sub-flag on and off, A19)", () => {
  it("sub-flag off: no verdicts at all", async () => {
    const s = render(<Screen subFlag={false} />);
    await flush();
    expect(s.queryByTestId(`faceoff-athlete-confirm-${CH}`)).toBeNull();
    expect(s.queryByTestId(`faceoff-athlete-flag-${OP}`)).toBeNull();
    expect(s.queryByText("Confirm")).toBeNull();
  });

  it("Confirm quotes the rated weight; the row is busy until the state shows CONFIRMED (TK-K5)", async () => {
    mockCheck.mockResolvedValue({ ok: true, data: tkState() });
    const view = (state: TimekeeperMatchState) => <Screen state={state} />;
    const s = render(view(tkState()));
    await flush();
    fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
    fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
    await flush();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockCheck).toHaveBeenCalledWith({ tag: "client" }, { matchId: "M1", subjectId: CH, verdict: "confirm", weightSeen: 168 });
    expect(s.getByTestId(`faceoff-athlete-confirm-${CH}`).props.accessibilityState).toMatchObject({ busy: true });
    s.rerender(view(tkState({ timekeeperChecks: [[CH, "confirmed"]] })));
    await flush();
    expect(textOf(s, `faceoff-athlete-weigh-in-${CH}`)).toBe(C["TK-K5"]);
    expect(s.queryByTestId(`faceoff-athlete-confirm-${CH}`)).toBeNull();
  });

  it("Doesn't look right flags; the flagged row says YOU FLAGGED and offers Withdraw flag (no weight quoted)", async () => {
    mockCheck.mockResolvedValue({ ok: true, data: tkState() });
    const view = (state: TimekeeperMatchState) => <Screen state={state} />;
    const s = render(view(tkState()));
    await flush();
    fireEvent.press(s.getByTestId(`faceoff-athlete-flag-${OP}`));
    await flush();
    expect(mockCheck).toHaveBeenCalledWith({ tag: "client" }, { matchId: "M1", subjectId: OP, verdict: "flag", weightSeen: 170.2 });
    s.rerender(view(tkState({ timekeeperChecks: [[OP, "flagged"]], startBlockers: ["athletes_not_ready", "weight_flagged"] })));
    await flush();
    expect(textOf(s, `faceoff-athlete-weigh-in-${OP}`)).toBe("YOU FLAGGED");
    fireEvent.press(s.getByTestId(`faceoff-athlete-withdraw-${OP}`));
    await flush();
    expect(mockCheck).toHaveBeenLastCalledWith({ tag: "client" }, { matchId: "M1", subjectId: OP, verdict: "withdraw", weightSeen: undefined });
  });

  it("a state that never shows the verdict frees the row after the hold", async () => {
    jest.useFakeTimers();
    try {
      mockCheck.mockResolvedValue({ ok: true, data: tkState() });
      const s = render(<Screen />);
      await flush();
      fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
      await flush();
      expect(s.getByTestId(`faceoff-athlete-confirm-${CH}`).props.accessibilityState).toMatchObject({ busy: true });
      await act(async () => {
        jest.advanceTimersByTime(CHECK_ECHO_HOLD_MS);
      });
      expect(s.getByTestId(`faceoff-athlete-confirm-${CH}`).props.accessibilityState).toMatchObject({ busy: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("a refusal says the shipped words only (a moved-on refusal the title alone, a failure with the guidance, PM29), never the server's, and re-reads", async () => {
    mockCheck.mockResolvedValueOnce({ ok: false, error: { code: "WEIGHT_CHANGED", message: "server words" } });
    const s = render(<Screen />);
    await flush();
    fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
    await flush();
    expect(toast.info).toHaveBeenCalledWith({ text1: "Weight changed" });
    // Moved on: the match started or was cancelled. The re-read explains it.
    mockCheck.mockResolvedValueOnce({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
    fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
    await flush();
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't save your check" });
    expect(mockReconcile).toHaveBeenCalledTimes(2);
    expect(s.getByTestId(`faceoff-athlete-confirm-${CH}`).props.accessibilityState).toMatchObject({ busy: false });
    // A failure the screen cannot explain.
    mockCheck.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    fireEvent.press(s.getByTestId(`faceoff-athlete-confirm-${CH}`));
    await flush();
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't save your check", description: "Check your connection and try again." });
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(mockReconcile).toHaveBeenCalledTimes(3);
    expect(JSON.stringify([(toast.error as jest.Mock).mock.calls, (toast.info as jest.Mock).mock.calls])).not.toContain("server words");
  });
});

describe("Start (TK-K6): the server's blocker order, then the camera", () => {
  const reasonFor = async (blockers: TimekeeperStartBlocker[], state: Partial<Parameters<typeof tkState>[0]> = {}) => {
    const s = render(<Screen state={tkState({ ...state, startBlockers: blockers })} />);
    await flush();
    const reason = s.queryByTestId("faceoff-start-reason")?.props.children ?? null;
    const disabled = s.getByTestId("faceoff-start").props.accessibilityState.disabled;
    s.unmount();
    return { reason, disabled };
  };

  it("each server blocker, first one wins, in _tk_start_blockers order", async () => {
    expect(await reasonFor(["athletes_not_ready", "weight_check_pending"])).toEqual({ reason: C["TK-K7"], disabled: true });
    expect(await reasonFor(["weight_flagged", "weight_check_pending"])).toEqual({ reason: "MATCH ON HOLD · WEIGHT CHECK", disabled: true });
    // The timekeeper owes verdicts (no checks yet): CONFIRM BOTH WEIGHTS.
    expect(await reasonFor(["weight_check_pending"])).toEqual({ reason: C["TK-K8"], disabled: true });
    expect(await reasonFor(["weight_recheck_pending"], { timekeeperChecks: [[CH, "recheck"], [OP, "confirmed"]] })).toEqual({
      reason: C["TK-K8"],
      disabled: true,
    });
    // Both of the timekeeper's checks confirmed: the athletes' own checks are what is owed.
    expect(await reasonFor(["weight_check_pending"], { timekeeperChecks: [[CH, "confirmed"], [OP, "confirmed"]] })).toEqual({
      reason: C["TK-K7"],
      disabled: true,
    });
    expect(await reasonFor(["timekeeper_not_recording"])).toEqual({ reason: C["TK-K10"], disabled: true });
    expect(await reasonFor([])).toEqual({ reason: null, disabled: false });
  });

  it("sub-flag off: Start is gated on the athletes' readiness and the camera only", async () => {
    const s = render(<Screen subFlag={false} state={tkState({ ready: [CH, OP], startBlockers: [] })} />);
    await flush();
    expect(s.queryByTestId("faceoff-start-reason")).toBeNull();
    expect(s.getByTestId("faceoff-start").props.accessibilityState.disabled).toBe(false);
  });

  it("the camera: permission not granted yet or no consent reads TK-K10", async () => {
    mockRecorder.permission = { granted: false, canAskAgain: true };
    const a = render(<Screen state={tkState({ startBlockers: [] })} />);
    await flush();
    expect(textOf(a, "faceoff-start-reason")).toBe(C["TK-K10"]);
    expect(a.queryByTestId("faceoff-camera-denied")).toBeNull();
    a.unmount();
    mockRecorder.permission = { granted: true, canAskAgain: true };
    __resetAiConsentForTests({ athleteId: TK, consentAt: null, known: true });
    const b = render(<Screen state={tkState({ startBlockers: [] })} />);
    await flush();
    expect(textOf(b, "faceoff-start-reason")).toBe(C["TK-K10"]);
  });

  it("athlete consent alone is not timekeeper consent: the timekeeper sheet opens by itself, Not now leaves TK-T8 and a way back, Allow opens the camera (jits-o47s.46)", async () => {
    __resetAiConsentForTests({ athleteId: TK, consentAt: "2026-10-14T12:00:00Z", timekeeperConsentAt: null, version: AI_PROCESSING_CONSENT_VERSION, known: true });
    mockRecordConsent.mockResolvedValue({ ok: true, data: "2026-10-23T12:00:00Z" });
    const s = render(<Screen state={tkState({ startBlockers: [] })} />);
    await flush();
    expect(textOf(s, "faceoff-start-reason")).toBe(C["TK-K10"]);
    expect(s.getByTestId("ai-consent-body")).toHaveTextContent(AI_CONSENT_COPY.timekeeperBody);
    fireEvent.press(s.getByTestId("ai-consent-not-now"));
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    expect(s.getByTestId("faceoff-consent-refused")).toHaveTextContent(C["TK-T8"]);
    fireEvent.press(s.getByTestId("faceoff-consent-open"));
    s.getByTestId("ai-consent-sheet");
    fireEvent.press(s.getByTestId("ai-consent-allow"));
    await flush();
    expect(mockRecordConsent).toHaveBeenCalledWith(expect.anything(), `${AI_PROCESSING_CONSENT_VERSION}+${TIMEKEEPER_CONSENT_VERSION}`);
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    expect(s.queryByTestId("faceoff-consent-open")).toBeNull();
    expect(s.getByTestId("faceoff-start").props.accessibilityState.disabled).toBe(false);
  });

  it("with timekeeper consent on record, no consent prompt", async () => {
    const s = render(<Screen state={tkState({ startBlockers: [] })} />);
    await flush();
    expect(s.queryByTestId("ai-consent-sheet")).toBeNull();
    expect(s.queryByTestId("faceoff-consent-open")).toBeNull();
  });

  it("camera permission denied for good: TK-K11 and Open Settings (TK-K12)", async () => {
    mockRecorder.permission = { granted: false, canAskAgain: false };
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const s = render(<Screen state={tkState({ startBlockers: [] })} />);
    await flush();
    s.getByText(C["TK-K11"]);
    fireEvent.press(s.getByTestId("faceoff-open-settings"));
    expect(open).toHaveBeenCalled();
    expect(s.getByTestId("faceoff-start").props.accessibilityState.disabled).toBe(true);
    open.mockRestore();
  });

  it("the record row is locked on (TK-K9), with no switch", async () => {
    const s = render(<Screen />);
    await flush();
    expect(s.getByTestId("faceoff-record-locked").props.accessibilityLabel).toBe(`Record from my phone. ${C["TK-K9"]}`);
    expect(s.queryByTestId("faceoff-record-toggle")).toBeNull();
  });

  it("no auto-start: an open gate waits for the tap; the tap starts, sends timer_started as the timekeeper and re-reads", async () => {
    jest.useFakeTimers();
    try {
      const s = render(<Screen state={tkState({ ready: [CH, OP], timekeeperChecks: [[CH, "confirmed"], [OP, "confirmed"]], startBlockers: [] })} />);
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(mockStart).not.toHaveBeenCalled();
      fireEvent.press(s.getByTestId("faceoff-start"));
      await flush();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockSend.broadcastTimerStarted).toHaveBeenCalledWith("2026-10-21T12:06:00.000Z", TK);
      expect(mockReconcile).toHaveBeenCalled();
      s.getByText("STARTING MATCH...");
    } finally {
      jest.useRealTimers();
    }
  });

  it("a refused Start says Couldn't start match once and is never retried by itself", async () => {
    jest.useFakeTimers();
    try {
      mockStart.mockResolvedValue({ ok: false, error: { code: "ATHLETES_NOT_READY", message: "server words" } });
      const s = render(<Screen state={tkState({ startBlockers: [] })} />);
      await flush();
      fireEvent.press(s.getByTestId("faceoff-start"));
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match" });
      expect(s.getByTestId("faceoff-start").props.accessibilityState.disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  describe("PM29: an honest Start", () => {
    const OPEN = { ready: [CH, OP], timekeeperChecks: [[CH, "confirmed"], [OP, "confirmed"]] as [string, "confirmed"][], startBlockers: [] };

    it.each([
      ["a blocker refusal (the reason line says why)", "WEIGHT_FLAGGED", { text1: "Couldn't start match" }],
      ["any other failure", "UNKNOWN", { text1: "Couldn't start match", description: "Check your connection and try again." }],
    ])("%s: the toast, Start back, a re-read", async (_name, code, toastArgs) => {
      mockStart.mockResolvedValue({ ok: false, error: { code, message: "server words" } });
      const s = render(<Screen state={tkState(OPEN)} />);
      await flush();
      fireEvent.press(s.getByTestId("faceoff-start"));
      await flush();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(toastArgs);
      expect(mockReconcile).toHaveBeenCalled();
      s.getByTestId("faceoff-start");
    });

    it("moved on (MATCH_NOT_PENDING: the match already started): no toast, a re-read, and Leave stays hidden until the read moves the screen", async () => {
      mockStart.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
      const s = render(<Screen state={tkState(OPEN)} />);
      await flush();
      s.getByTestId("faceoff-leave");
      fireEvent.press(s.getByTestId("faceoff-start"));
      await flush();
      expect(toast.error).not.toHaveBeenCalled();
      expect(mockReconcile).toHaveBeenCalled();
      // A Leave now would make a started match a timekeeper_left no contest.
      expect(s.queryByTestId("faceoff-leave")).toBeNull();
      expect(mockLeave).not.toHaveBeenCalled();
    });

    it("a retry refused as already started while the first call is still out, then the first call's late failure: Leave never comes back", async () => {
      jest.useFakeTimers();
      try {
        let first!: (v: unknown) => void;
        let second!: (v: unknown) => void;
        mockStart.mockReturnValueOnce(new Promise((r) => (first = r))).mockReturnValueOnce(new Promise((r) => (second = r)));
        const s = render(<Screen state={tkState(OPEN)} />);
        await flush();
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        await act(async () => {
          jest.advanceTimersByTime(SEND_CEILING_MS);
        });
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(2);
        // The retry meets a match that is no longer pending: no toast, a re-read, no Leave.
        await act(async () => {
          second({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
        });
        await flush();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(s.queryByTestId("faceoff-leave")).toBeNull();
        // The first call's reply was lost: it fails late. Still no Leave, and nothing more is said.
        await act(async () => {
          first({ ok: false, error: { code: "UNKNOWN", message: "network" } });
        });
        await flush();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(s.queryByTestId("faceoff-leave")).toBeNull();
        expect(mockLeave).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("no reply: Starting just before the ceiling; at it Couldn't start match with the guidance and Start back, while Leave stays hidden until that call answers", async () => {
      jest.useFakeTimers();
      try {
        let answer!: (v: unknown) => void;
        mockStart.mockReturnValueOnce(new Promise((r) => (answer = r)));
        const s = render(<Screen state={tkState(OPEN)} />);
        await flush();
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        await act(async () => {
          jest.advanceTimersByTime(SEND_CEILING_MS - 1);
        });
        s.getByText("STARTING MATCH...");
        expect(toast.error).not.toHaveBeenCalled();
        const reads = mockReconcile.mock.calls.length;
        await act(async () => {
          jest.advanceTimersByTime(1);
        });
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match", description: "Check your connection and try again." });
        expect(mockReconcile.mock.calls.length).toBeGreaterThan(reads);
        expect(s.getByTestId("faceoff-start").props.accessibilityState.disabled).toBe(false);
        // That Start might still land: no Leave yet.
        expect(s.queryByTestId("faceoff-leave")).toBeNull();
        // It answers (refused): nothing more is said, and Leave is back.
        await act(async () => {
          answer({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
        });
        await flush();
        expect(toast.error).toHaveBeenCalledTimes(1);
        s.getByTestId("faceoff-leave");
      } finally {
        jest.useRealTimers();
      }
    });

    it("a retry after the ceiling while the first call is still out: Leave waits for both; a late landing keeps it gone and the retry's refusal is silent", async () => {
      jest.useFakeTimers();
      try {
        let first!: (v: unknown) => void;
        let second!: (v: unknown) => void;
        mockStart.mockReturnValueOnce(new Promise((r) => (first = r))).mockReturnValueOnce(new Promise((r) => (second = r)));
        const s = render(<Screen state={tkState(OPEN)} />);
        await flush();
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        await act(async () => {
          jest.advanceTimersByTime(SEND_CEILING_MS);
        });
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(2);
        s.getByText("STARTING MATCH...");
        // The first Start lands late: the match started.
        await act(async () => {
          first({ ok: true, data: { startedAt: "2026-10-21T12:06:00.000Z" } });
        });
        await flush();
        expect(mockSend.broadcastTimerStarted).toHaveBeenCalledWith("2026-10-21T12:06:00.000Z", TK);
        expect(s.queryByTestId("faceoff-leave")).toBeNull();
        // The retry meets the started match: no toast; Leave stays gone.
        await act(async () => {
          second({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
        });
        await flush();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(s.queryByTestId("faceoff-leave")).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it("unmounted with a Start out: the ceiling timer is cleared and nothing shows", async () => {
      jest.useFakeTimers();
      try {
        mockStart.mockReturnValueOnce(new Promise(() => undefined));
        const s = render(<Screen state={tkState(OPEN)} />);
        await flush();
        fireEvent.press(s.getByTestId("faceoff-start"));
        await flush();
        s.unmount();
        await act(async () => {
          jest.advanceTimersByTime(SEND_CEILING_MS * 2);
        });
        expect(toast.error).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe("Leave: the seat's drop-out before the start (A5, R21; TK-K14)", () => {
  const OPEN_GATE = { ready: [CH, OP], timekeeperChecks: [[CH, "confirmed"], [OP, "confirmed"]] as [string, "confirmed"][], startBlockers: [] };
  let backHandlers: (() => boolean | null | undefined)[] = [];

  beforeEach(() => {
    backHandlers = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, h: () => boolean) => {
      backHandlers.push(h);
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  /** Taps the alert's action (`Leave`), or its safe button. */
  const alertTaps = (button: 0 | 1) =>
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[button]?.onPress?.());

  it("is in the header, called Leave (it cancels nothing), and asks TK-K14 naming both athletes, challenger first", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const s = render(<Screen />);
    await flush();
    const leave = s.getByTestId("faceoff-leave");
    expect(leave.props.accessibilityLabel).toBe("Leave");
    expect(s.queryByLabelText("Cancel match")).toBeNull();
    fireEvent.press(leave);
    const want = C["TK-K14"]({ a: "M. Reyes", b: "D. Okafor" });
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alert.mock.calls[0];
    expect({ title, body, buttons: buttons?.map((b) => b.text) }).toEqual({ title: want.title, body: want.body, buttons: [want.cancel, want.confirm] });
  });

  it("confirmed: leave_match_as_timekeeper, then TK-K17 and the exit, with no cancel for the athletes", async () => {
    mockLeave.mockResolvedValue({ ok: true, data: { status: "pending" } });
    alertTaps(1);
    const s = render(<Screen />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    await flush();
    expect(mockLeave).toHaveBeenCalledWith({ tag: "client" }, "M1");
    expect(mockCancel).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith({ text1: C["TK-K17"] });
    expect(mockDismissTo).toHaveBeenCalledWith("/arena");
  });

  it("Keep timekeeping does nothing", async () => {
    alertTaps(0);
    const s = render(<Screen />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    await flush();
    expect(mockLeave).not.toHaveBeenCalled();
    s.getByTestId("faceoff-leave");
  });

  it("Android back is Leave and never pops the match screen", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    render(<Screen />);
    await flush();
    expect(backHandlers.length).toBeGreaterThan(0);
    let handled: boolean | null | undefined;
    act(() => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe(C["TK-K14"]({ a: "M. Reyes", b: "D. Okafor" }).title);
  });

  it("is gone while Start is in flight and stays gone once it went through; back does nothing then", async () => {
    let resolve!: (v: unknown) => void;
    mockStart.mockReturnValue(new Promise((r) => (resolve = r)));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const s = render(<Screen state={tkState(OPEN_GATE)} />);
    await flush();
    s.getByTestId("faceoff-leave");
    fireEvent.press(s.getByTestId("faceoff-start"));
    await flush();
    expect(s.queryByTestId("faceoff-leave")).toBeNull();
    let handled: boolean | null | undefined;
    act(() => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(alert).not.toHaveBeenCalled();
    await act(async () => {
      resolve({ ok: true, data: { startedAt: "2026-10-21T12:06:00.000Z" } });
    });
    await flush();
    expect(s.queryByTestId("faceoff-leave")).toBeNull();
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("a refused Start gives Leave back", async () => {
    mockStart.mockResolvedValue({ ok: false, error: { code: "ATHLETES_NOT_READY", message: "server words" } });
    const s = render(<Screen state={tkState(OPEN_GATE)} />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-start"));
    await flush();
    s.getByTestId("faceoff-leave");
  });

  it("no Start while the Leave is in flight", async () => {
    mockLeave.mockReturnValue(new Promise(() => {}));
    alertTaps(1);
    const s = render(<Screen state={tkState(OPEN_GATE)} />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    await flush();
    expect(mockLeave).toHaveBeenCalledTimes(1);
    fireEvent.press(s.getByTestId("faceoff-start"));
    await flush();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("a Leave the server refuses (the match moved on) re-arms and re-reads, with no server text", async () => {
    mockLeave.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
    alertTaps(1);
    const s = render(<Screen />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    await flush();
    expect(mockReconcile).toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(JSON.stringify([(toast.error as jest.Mock).mock.calls, (toast.info as jest.Mock).mock.calls])).not.toContain("server words");
    expect(s.getByTestId("faceoff-leave").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
