/**
 * A timekeeper-mode athlete's face-off (timekeeper mode spec 4.2 Weigh-in,
 * Ready and Start; COPY-DECK B5; slice M3, acceptance 14.8 M3):
 *  - the shipped weigh-in plus the timekeeper's row (TK-F1 to TK-F3, the
 *    weights line only with the sub-flag on);
 *  - the merged ready: `Weight looks right, I'm ready` (TK-F4) is one
 *    `mark_match_ready` that also confirms the opponent check; ready is the
 *    server's row, never a broadcast; TK-F5 once both are ready; TK-F6;
 *  - the timekeeper's flag on me (TK-F7) and the opponent's both ask for a
 *    re-weigh; my own flag holds the match with Withdraw;
 *  - no auto-start (the timekeeper starts), no ready or weigh-in broadcast
 *    (only the recording choice), and a received `timer_started` only
 *    re-reads (M-R8);
 *  - Leave cancels for everyone and, once a timekeeper is seated, says so
 *    naming the opponent (TK-E4; spec 4.3);
 *  - no refusal on this face-off shows the server's text (M-R4, spec 14.9
 *    X1), and no "No one is recording" (the timekeeper always records);
 *  - the timekeeper offline before the start: TK-D7 under the face-off's
 *    TK-D9, with no chip of its own (spec 4.3, jits-o47s.29 item 3);
 *  - a read without the timekeeper's name prints the role, never a blank.
 * The face-off is the real provider, header and body; only the data layer
 * and the channel are stubbed.
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: jest.fn(),
  startMatch: (...a: unknown[]) => mockStart(...a),
}));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: jest.fn(async () => ({ ok: true, data: null })),
}));
const mockUpdateWeight = jest.fn();
jest.mock("@jits/shared/api/athlete-weight", () => ({
  ...jest.requireActual("@jits/shared/api/athlete-weight"),
  updateAthleteWeight: (...a: unknown[]) => mockUpdateWeight(...a),
}));
const mockCheckOpponent = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  checkOpponentWeight: (...a: unknown[]) => mockCheckOpponent(...a),
  reweighForMatch: jest.fn(),
}));
const mockMarkReady = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  markMatchReady: (...a: unknown[]) => mockMarkReady(...a),
}));
jest.mock("@/lib/invites/location", () => ({
  ...jest.requireActual("@/lib/invites/location"),
  readLocationOnce: jest.fn(async () => ({ status: "denied", canAskAgain: true })),
}));
jest.mock("@/lib/arena/location-telemetry", () => ({ logMatchStartLocation: jest.fn() }));

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
let mockHandlers: Handlers = {};
const mockSend = {
  broadcastWeighedIn: jest.fn(() => Promise.resolve("ok")),
  broadcastRecordingOptIn: jest.fn(() => Promise.resolve("ok")),
  broadcastReady: jest.fn(() => Promise.resolve("ok")),
  broadcastTimerStarted: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
};
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: Handlers) => {
    mockHandlers = p;
    return mockSend;
  },
}));

import type { MatchWeightChecks, WeightCheck } from "@jits/shared/api/match-weight-checks";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTop } from "@/components/match-flow/faceoff/faceoff-top";
import { FaceoffBody } from "@/components/match-flow/faceoff/faceoff-body";
import { toast } from "@/components/ui/toast";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import type { WeightChecksHandle } from "@/lib/match-flow/use-match-weight-checks";
import { READY_ECHO_HOLD_MS } from "@/lib/match-flow/use-merged-ready";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";
import { __resetRecordingIntentForTests } from "@/lib/match-flow/recording-intent";
import { CH, OP, tkFlow, tkState } from "../../support/timekeeper-faceoff";
import { renderedAbove, testIDsInOrder } from "../../support/rendered-above";

const mockReconcile = jest.fn();
const mockRefetch = jest.fn();

function check(checkerId: string, subjectId: string, status: WeightCheck["status"], over: Partial<WeightCheck> = {}): WeightCheck {
  return {
    checkerId,
    subjectId,
    status,
    weightSeen: null,
    flagCount: status === "flagged" ? 1 : 0,
    flaggedAt: status === "flagged" ? "2026-10-21T12:00:00.000Z" : null,
    reweighedAt: null,
    updatedAt: null,
    ...over,
  };
}

/** The athletes' own check handle (`get_match_weight_checks`), with the given rows. */
function checksHandle(checks: WeightCheck[] = [check(OP, CH, "pending"), check(CH, OP, "pending")]): WeightChecksHandle {
  const state: MatchWeightChecks = { matchId: "M1", required: true, blocked: false, canStart: false, weights: {}, checks };
  return { status: "ready", state, refetch: mockRefetch, apply: jest.fn() };
}

/** The opponent (`op-1`) is the viewer by default; the challenger is `ch-1`. */
function Harness({
  phase,
  state = tkState(),
  subFlag = true,
  viewer = OP,
  checks = checksHandle(),
  onWeighedIn = jest.fn(),
  onStarted = jest.fn(),
  seated = true,
  named = true,
}: {
  phase: "weight" | "ready";
  state?: TimekeeperMatchState | null;
  subFlag?: boolean;
  viewer?: string;
  checks?: WeightChecksHandle;
  onWeighedIn?: () => void;
  onStarted?: (s: string) => void;
  /** False: a timekeeper-mode match with nobody seated (yet, or again after a drop-out). */
  seated?: boolean;
  /** False: the read carries the seat without the timekeeper's name (an older backend). */
  named?: boolean;
}) {
  const flow = tkFlow(viewer, { subFlag, state, seated, named });
  const me = flow.roles.me!;
  const opponent = flow.roles.opponent!;
  return (
    <MatchSyncProvider
      value={{
        onChannelStatus: () => {},
        reconcileNow: mockReconcile,
        markExiting: () => {},
        subscribeSnapshot: () => () => {},
        timekeeperModeSelfId: viewer,
      }}
    >
      <FaceoffProvider
        active
        phase={phase}
        matchId="M1"
        exitHref="/arena"
        meId={me.athleteId}
        opponentId={opponent.athleteId}
        myWeight={170}
        opponentWeight={167}
        weightsRated
        weightChecks={checks}
        onWeighedIn={onWeighedIn}
        onStarted={onStarted}
        onCancelledRemotely={jest.fn()}
        flow={flow}
      >
        <FaceoffTop phase={phase} me={me} opponent={opponent} />
        <FaceoffBody phase={phase} me={me} opponent={opponent} matchId="M1" />
      </FaceoffProvider>
    </MatchSyncProvider>
  );
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers = {};
  __resetRecordingOptInForTests(false);
  __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
  __resetRecordingIntentForTests();
  mockMarkReady.mockResolvedValue({ ok: true, data: tkState() });
});

describe("weigh-in: the shipped weigh-in plus the timekeeper's row (TK-F1 to TK-F3)", () => {
  it("shows the timekeeper, CHECKING WEIGHTS while the sub-flag's checks are owed", async () => {
    const s = render(<Harness phase="weight" />);
    await flush();
    s.getByTestId("weight-confirm");
    const row = s.getByTestId("faceoff-timekeeper-row");
    expect(row.props.accessibilityLabel).toBe(`${C["TK-F1"]}, J. Cruz, ${C["TK-F2"]}`);
    expect(s.getByTestId("faceoff-timekeeper-state").props.children).toBe(C["TK-F2"]);
  });

  it("WEIGHTS CONFIRMED once the timekeeper confirmed both", async () => {
    const state = tkState({ timekeeperChecks: [[CH, "confirmed"], [OP, "confirmed"]] });
    const s = render(<Harness phase="weight" state={state} />);
    await flush();
    expect(s.getByTestId("faceoff-timekeeper-state").props.children).toBe(C["TK-F3"]);
  });

  it("sub-flag off: the row names the timekeeper with no weights line", async () => {
    const s = render(<Harness phase="weight" subFlag={false} />);
    await flush();
    expect(s.getByTestId("faceoff-timekeeper-row").props.accessibilityLabel).toBe(`${C["TK-F1"]}, J. Cruz`);
    expect(s.queryByTestId("faceoff-timekeeper-state")).toBeNull();
  });

  it("confirming my weight goes straight to the ready check: the opponent check is merged into ready", async () => {
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    await flush();
    fireEvent.press(s.getByTestId("weight-confirm"));
    await flush();
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
    // No separate check on the weigh-in in timekeeper mode.
    expect(s.queryByTestId("weight-check-prompt")).toBeNull();
    expect(s.queryByTestId("faceoff-weight-check-plate")).toBeNull();
  });

  it("the face-off timeout counts down under the bar from the seat (TK-D9)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T12:05:30.000Z"));
    try {
      const s = render(<Harness phase="weight" />);
      await flush();
      expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 4:30");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the merged ready (TK-F4 to TK-F6)", () => {
  it("offers the opponent's weigh-in, TK-F4, the shipped flag and TK-F6; no shipped I'm ready", async () => {
    const s = render(<Harness phase="ready" />);
    await flush();
    expect(s.getByTestId("weight-check-line").props.children).toBe("M. REYES WEIGHED IN AT 167 LBS");
    expect(s.getByTestId("ready-button").props.accessibilityLabel).toBe(C["TK-F4"]);
    s.getByTestId("weight-check-flag");
    s.getByText(C["TK-F6"]("J. Cruz"));
    expect(s.queryByText("I'm ready")).toBeNull();
    expect(s.queryByText("Match starts when you both tap ready")).toBeNull();
  });

  it("one tap is one mark_match_ready that also confirms my check of the opponent", async () => {
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("ready-button"));
    fireEvent.press(s.getByTestId("ready-button"));
    await flush();
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
    expect(mockMarkReady).toHaveBeenCalledWith({ tag: "client" }, "M1", true);
  });

  it("ready is the server's: busy until the state read shows it, then waiting, then TK-F5", async () => {
    const view = (state: TimekeeperMatchState) => <Harness phase="ready" state={state} />;
    const s = render(view(tkState()));
    await flush();
    fireEvent.press(s.getByTestId("ready-button"));
    await flush();
    // Succeeded, not in the state yet: busy, never an optimistic ready.
    expect(s.getByTestId("ready-button").props.accessibilityState).toMatchObject({ busy: true });
    expect(s.getByText("YOU · NOT READY")).toBeTruthy();
    s.rerender(view(tkState({ ready: [OP] })));
    await flush();
    expect(s.getByText("YOU · READY")).toBeTruthy();
    expect(s.getByTestId("merged-ready-waiting").props.children).toBe("WAITING FOR M. REYES...");
    s.rerender(view(tkState({ ready: [OP, CH] })));
    await flush();
    expect(s.getByTestId("merged-ready-waiting").props.children).toBe(C["TK-F5"]("J. Cruz"));
    expect(s.getByTestId("ready-panel-opponent").props.accessibilityLabel).toBe("Opponent, ready");
  });

  it("a state that never shows the ready frees the button after the hold", async () => {
    jest.useFakeTimers();
    try {
      const s = render(<Harness phase="ready" />);
      await flush();
      fireEvent.press(s.getByTestId("ready-button"));
      await flush();
      expect(s.getByTestId("ready-button").props.accessibilityState).toMatchObject({ busy: true });
      await act(async () => {
        jest.advanceTimersByTime(READY_ECHO_HOLD_MS);
      });
      expect(s.getByTestId("ready-button").props.accessibilityState).toMatchObject({ busy: false });
    } finally {
      jest.useRealTimers();
    }
  });

  it("a weight hold refusal says the shipped Match on hold and re-reads; a moved-on refusal the shipped Couldn't save your check alone; any other adds the guidance (no server text; PM29)", async () => {
    mockMarkReady.mockResolvedValueOnce({ ok: false, error: { code: "WEIGHT_FLAGGED", message: "server words" } });
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("ready-button"));
    await flush();
    expect(toast.info).toHaveBeenCalledWith({ text1: "Match on hold" });
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalled();
    // Moved on: the timekeeper left, or the match was cancelled. The re-read explains it.
    for (const code of ["TIMEKEEPER_REQUIRED", "MATCH_NOT_PENDING"]) {
      mockMarkReady.mockResolvedValueOnce({ ok: false, error: { code, message: "server words" } });
      fireEvent.press(s.getByTestId("ready-button"));
      await flush();
      expect([code, (toast.error as jest.Mock).mock.lastCall]).toEqual([code, [{ text1: "Couldn't save your check" }]]);
    }
    // A failure the screen cannot explain.
    mockMarkReady.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    fireEvent.press(s.getByTestId("ready-button"));
    await flush();
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't save your check", description: "Check your connection and try again." });
    expect(toast.error).toHaveBeenCalledTimes(3);
    expect(mockReconcile).toHaveBeenCalledTimes(4);
    expect(JSON.stringify((toast.error as jest.Mock).mock.calls)).not.toContain("server words");
  });

  it("Doesn't look right is the shipped flag of the opponent's weight on screen", async () => {
    mockCheckOpponent.mockResolvedValue({ ok: true, data: checksHandle().state });
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("weight-check-flag"));
    await flush();
    expect(mockCheckOpponent).toHaveBeenCalledWith({ tag: "client" }, "M1", "flag", 167);
  });

  it("after the opponent re-weighed, the line reads RE-WEIGHED AT", async () => {
    const s = render(<Harness phase="ready" checks={checksHandle([check(OP, CH, "recheck"), check(CH, OP, "confirmed")])} />);
    await flush();
    expect(s.getByTestId("weight-check-line").props.children).toBe("M. REYES RE-WEIGHED AT 167 LBS");
  });

  it("after my re-weigh, the shipped waiting notice sits under TK-F4 and the flag, and its going moves neither (PM31 (1); Wave 3 gate, T10)", async () => {
    // I re-weighed (the checks on me are voided), so I wait for the
    // opponent's re-check; my check of them is still owed (TK-F4 gives it).
    const notice = "Waiting for M. Reyes to check your new weight.";
    const s = render(<Harness phase="ready" checks={checksHandle([check(OP, CH, "pending"), check(CH, OP, "recheck")])} />);
    await flush();
    s.getByText(notice);
    const ids = testIDsInOrder(s.toJSON());
    expect(ids.indexOf("ready-button")).toBeGreaterThan(-1);
    expect(ids.indexOf("weight-check-flag")).toBeGreaterThan(ids.indexOf("ready-button"));
    expect(ids.indexOf("weight-await-recheck")).toBeGreaterThan(ids.indexOf("weight-check-flag"));
    const before = renderedAbove(s.toJSON(), "weight-check-flag");
    // The opponent's ready confirms my new weight: the notice goes, TK-F4 and the flag stay put.
    s.rerender(<Harness phase="ready" checks={checksHandle([check(OP, CH, "pending"), check(CH, OP, "confirmed")])} />);
    await flush();
    expect(s.queryByText(notice)).toBeNull();
    expect(renderedAbove(s.toJSON(), "weight-check-flag")).toEqual(before);
  });
});

describe("flags and holds", () => {
  it("the timekeeper flagged me: TK-F7 and the re-weigh, no ready", async () => {
    const s = render(<Harness phase="ready" state={tkState({ timekeeperChecks: [[OP, "flagged"]] })} />);
    await flush();
    s.getByText(C["TK-F7"]("J. Cruz"));
    s.getByTestId("weight-reweigh-input");
    expect(s.queryByTestId("ready-button")).toBeNull();
  });

  it("the opponent flagged me: the shipped notice and the re-weigh, even when I was ready", async () => {
    const checks = checksHandle([check(CH, OP, "flagged"), check(OP, CH, "confirmed")]);
    const s = render(<Harness phase="ready" state={tkState({ ready: [OP] })} checks={checks} />);
    await flush();
    s.getByText("M. Reyes says your weight doesn't look right. Re-weigh to continue.");
    s.getByTestId("weight-reweigh-input");
  });

  it("my own flag holds the match: the shipped hold and Withdraw flag", async () => {
    const checks = checksHandle([check(OP, CH, "flagged"), check(CH, OP, "confirmed")]);
    const s = render(<Harness phase="ready" checks={checks} />);
    await flush();
    s.getByText("You flagged M. Reyes's weight. Match is on hold.");
    s.getByTestId("weight-check-withdraw");
    expect(s.queryByTestId("ready-button")).toBeNull();
  });
});

describe("no auto-start, no ready broadcast (spec 4.2 Start, Q2)", () => {
  it("both athletes ready on the server: this phone never calls start_match", async () => {
    jest.useFakeTimers();
    try {
      const s = render(<Harness phase="ready" state={tkState({ ready: [OP, CH], startBlockers: ["weight_check_pending"] })} />);
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });
      expect(mockStart).not.toHaveBeenCalled();
      expect(s.queryByText("STARTING MATCH...")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("announces the recording choice only: no weighed-in, no ready", async () => {
    jest.useFakeTimers();
    try {
      render(<Harness phase="ready" state={tkState({ ready: [OP] })} />);
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(mockSend.broadcastRecordingOptIn).toHaveBeenCalled();
      expect(mockSend.broadcastWeighedIn).not.toHaveBeenCalled();
      expect(mockSend.broadcastReady).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a ready broadcast from the other phone changes nothing; ready is the server's", async () => {
    const s = render(<Harness phase="ready" />);
    await flush();
    act(() => mockHandlers.onReadySignal?.(CH));
    expect(s.getByTestId("ready-panel-opponent").props.accessibilityLabel).toBe("Opponent, waiting");
  });

  it("the timekeeper's timer_started only re-reads (M-R8); the reconciler moves to live", async () => {
    const onStarted = jest.fn();
    render(<Harness phase="ready" onStarted={onStarted} />);
    await flush();
    act(() => mockHandlers.onTimerStarted?.("2026-10-21T12:06:00.000Z", "tk-1"));
    expect(mockReconcile).toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe("Leave (spec 4.3)", () => {
  it("once a timekeeper is seated, it names the opponent and the timekeeper (TK-E4) and cancels for everyone", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const s = render(<Harness phase="weight" />);
    await flush();
    const leave = s.getByTestId("faceoff-leave");
    // The harness and screen readers still know it as the athletes' cancel.
    expect(leave.props.accessibilityLabel).toBe("Cancel match");
    fireEvent.press(leave);
    const want = C["TK-E4"]("M. Reyes");
    const [title, body, buttons] = alert.mock.calls[0];
    expect({ title, body, buttons: buttons?.map((b) => b.text) }).toEqual({
      title: want.title,
      body: "M. Reyes and your timekeeper go back to the Arena.",
      buttons: [want.cancel, want.confirm],
    });
    expect(want.body).toBe(body);
    alert.mockRestore();
  });

  it("with nobody seated it keeps the shipped body", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const s = render(<Harness phase="weight" seated={false} />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual(["Cancel match?", "Your opponent will be returned to the lobby."]);
    alert.mockRestore();
  });
});

describe("no server text on this face-off (M-R4, spec 14.9 X1)", () => {
  const mockReweigh = jest.requireMock("@jits/shared/api/match-weight-checks").reweighForMatch as jest.Mock;
  const shown = () => JSON.stringify([(toast.error as jest.Mock).mock.calls, (toast.info as jest.Mock).mock.calls]);

  it("a refused Doesn't look right says the shipped title with the guidance (PM29) and re-reads", async () => {
    mockCheckOpponent.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("weight-check-flag"));
    await flush();
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't save your check", description: "Check your connection and try again." });
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalled();
    expect(shown()).not.toContain("server words");
  });

  it("a check or re-weigh refused because the match moved on (MATCH_NOT_PENDING: started or cancelled) says the shipped title alone, which is true, and re-reads (PM29)", async () => {
    mockCheckOpponent.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("weight-check-flag"));
    await flush();
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't save your check" });
    expect(mockReconcile).toHaveBeenCalled();
    s.unmount();
    mockReweigh.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "server words" } });
    const t = render(<Harness phase="ready" state={tkState({ timekeeperChecks: [[OP, "flagged"]] })} />);
    await flush();
    fireEvent.changeText(t.getByTestId("weight-reweigh-input"), "171");
    fireEvent.press(t.getByTestId("weight-reweigh-submit"));
    await flush();
    expect(toast.error).toHaveBeenLastCalledWith({ text1: "Couldn't re-weigh" });
    expect(shown()).not.toContain("server words");
  });

  it("a flag refused as WEIGHT_CHANGED says the shipped Weight changed alone", async () => {
    mockCheckOpponent.mockResolvedValue({ ok: false, error: { code: "WEIGHT_CHANGED", message: "server words" } });
    const s = render(<Harness phase="ready" />);
    await flush();
    fireEvent.press(s.getByTestId("weight-check-flag"));
    await flush();
    expect(toast.info).toHaveBeenCalledWith({ text1: "Weight changed" });
    expect(shown()).not.toContain("server words");
  });

  it("a refused Withdraw flag says the shipped title with the guidance (PM29)", async () => {
    mockCheckOpponent.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    const checks = checksHandle([check(OP, CH, "flagged"), check(CH, OP, "confirmed")]);
    const s = render(<Harness phase="ready" checks={checks} />);
    await flush();
    fireEvent.press(s.getByTestId("weight-check-withdraw"));
    await flush();
    expect(mockCheckOpponent).toHaveBeenCalledWith({ tag: "client" }, "M1", "withdraw", undefined);
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't save your check", description: "Check your connection and try again." });
    expect(shown()).not.toContain("server words");
  });

  it("a refused re-weigh after the timekeeper's flag (TK-F7) says the shipped title with the guidance (PM29) and re-reads", async () => {
    mockReweigh.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    const s = render(<Harness phase="ready" state={tkState({ timekeeperChecks: [[OP, "flagged"]] })} />);
    await flush();
    fireEvent.changeText(s.getByTestId("weight-reweigh-input"), "171");
    fireEvent.press(s.getByTestId("weight-reweigh-submit"));
    await flush();
    expect(mockReweigh).toHaveBeenCalledWith({ tag: "client" }, "M1", 171);
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't re-weigh", description: "Check your connection and try again." });
    expect(mockReconcile).toHaveBeenCalled();
    expect(shown()).not.toContain("server words");
  });

  it("a refused profile weight edit says the shipped title with the guidance (PM29)", async () => {
    mockUpdateWeight.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "server words" } });
    const s = render(<Harness phase="weight" />);
    await flush();
    fireEvent.press(s.getByTestId("faceoff-edit-weight"));
    fireEvent.changeText(s.getByTestId("faceoff-weight-input"), "175");
    fireEvent.press(s.getByTestId("faceoff-weight-save"));
    await flush();
    expect(mockUpdateWeight).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't update weight", description: "Check your connection and try again." });
    expect(shown()).not.toContain("server words");
  });
});

describe("the ready check's recording line", () => {
  it("never says No one is recording: the timekeeper always records (TK-K9)", async () => {
    const s = render(<Harness phase="ready" />);
    await flush();
    act(() => mockHandlers.onRecordingOptIn?.(CH, false));
    s.getByText("M. REYES NOT RECORDING");
    s.getByTestId("faceoff-camera-off");
    expect(s.queryByTestId("faceoff-nobody-recording")).toBeNull();
    expect(s.queryByText("No one is recording this match")).toBeNull();
  });
});

describe("the weigh-in's opponent plate", () => {
  it("reads WEIGHING IN until the opponent is ready on the server: no weigh-in broadcast reaches it in timekeeper mode", async () => {
    const view = (state: TimekeeperMatchState) => <Harness phase="weight" state={state} />;
    const s = render(view(tkState()));
    await flush();
    // A weighed-in broadcast is not timekeeper mode's signal.
    act(() => mockHandlers.onWeighedIn?.(CH, 168));
    expect(s.getByTestId("faceoff-opponent-weighed").props.accessibilityLabel).toBe("M. REYES, not weighed in yet");
    s.rerender(view(tkState({ ready: [CH] })));
    await flush();
    expect(s.getByTestId("faceoff-opponent-weighed").props.accessibilityLabel).toBe("M. REYES, weighed in");
  });
});

describe("the timekeeper offline before the start (TK-D7, spec 4.3; jits-o47s.29 item 3)", () => {
  const offline = () => tkState({ presence: "offline" });

  it("TK-D7 sits under the face-off timeout with no chip of its own: one TK-D9 on screen, on both phases", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-21T12:05:30.000Z"));
    try {
      for (const phase of ["weight", "ready"] as const) {
        const s = render(<Harness phase={phase} state={offline()} />);
        await flush();
        const banner = s.getByTestId("live-timekeeper-offline");
        within(banner).getByText(C["TK-D7"]("J. Cruz"));
        expect(C["TK-D7"]("J. Cruz")).toBe("J. CRUZ IS OFFLINE");
        // The face-off is a themed page: the themed tone, never the live screen's on-media plate.
        expect(banner.props.style.backgroundColor).toBe("transparent");
        expect(within(banner).queryByTestId("timeout-chip")).toBeNull();
        expect(s.getAllByTestId("timeout-chip")).toHaveLength(1);
        expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 4:30");
        s.unmount();
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("not while the timekeeper is online, before the first state read, or with nobody seated", async () => {
    const cases: { name: string; props: Partial<React.ComponentProps<typeof Harness>> }[] = [
      { name: "online", props: { state: tkState() } },
      { name: "no state yet", props: { state: null } },
      { name: "nobody seated", props: { seated: false, state: offline() } },
    ];
    for (const c of cases) {
      const s = render(<Harness phase="weight" {...c.props} />);
      await flush();
      expect([c.name, s.queryByTestId("live-timekeeper-offline")]).toEqual([c.name, null]);
      s.unmount();
    }
  });

  it("clears when the timekeeper is back", async () => {
    const s = render(<Harness phase="ready" state={offline()} />);
    await flush();
    s.getByTestId("live-timekeeper-offline");
    s.rerender(<Harness phase="ready" state={tkState()} />);
    await flush();
    expect(s.queryByTestId("live-timekeeper-offline")).toBeNull();
  });

  it("a read without the timekeeper's name says the role (TIMEKEEPER IS OFFLINE)", async () => {
    const s = render(<Harness phase="weight" state={offline()} named={false} />);
    await flush();
    within(s.getByTestId("live-timekeeper-offline")).getByText(C["TK-D7"](C["TK-F1"]));
  });
});

describe("a read without the timekeeper's name (jits-o47s.27 lineage)", () => {
  it("TK-F5, TK-F6, TK-F7 and the row name the role, never a blank", async () => {
    const view = (state: TimekeeperMatchState) => <Harness phase="ready" named={false} state={state} />;
    const s = render(view(tkState()));
    await flush();
    s.getByText(C["TK-F6"](C["TK-F1"]));
    expect(s.getByTestId("faceoff-timekeeper-row").props.accessibilityLabel).toBe(`${C["TK-F1"]}, ${C["TK-F2"]}`);
    expect(JSON.stringify(s.toJSON())).not.toMatch(/" starts the match|" STARTS THE MATCH|" says your weight/);
    s.rerender(view(tkState({ ready: [OP, CH] })));
    await flush();
    expect(s.getByTestId("merged-ready-waiting").props.children).toBe(C["TK-F5"](C["TK-F1"]));
    s.rerender(view(tkState({ timekeeperChecks: [[OP, "flagged"]] })));
    await flush();
    s.getByText(C["TK-F7"](C["TK-F1"]));
  });
});
