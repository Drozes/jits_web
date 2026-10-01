/**
 * The face-off (weigh-in + ready merged, the first match step): fight card,
 * stakes and division line, per-athlete status over the match channel
 * (weighed_in, recording_optin, ready_signal), the weight edit, the
 * recording opt-in (OFF by default, the opponent's choice, the nobody-is-
 * recording warning), and Leave (the harness's "Cancel match").
 */
import * as React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), back: jest.fn() }) }));

const mockGetEloStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: (...a: unknown[]) => mockGetEloStakes(...a),
  getMatchDetails: jest.fn(),
}));
const mockCancel = jest.fn();
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: (...a: unknown[]) => mockCancel(...a),
  startMatch: (...a: unknown[]) => mockStart(...a),
}));
const mockUpdateWeight = jest.fn();
jest.mock("@jits/shared/api/athlete-weight", () => ({
  ...jest.requireActual("@jits/shared/api/athlete-weight"),
  updateAthleteWeight: (...a: unknown[]) => mockUpdateWeight(...a),
}));

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

import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTop } from "@/components/match-flow/faceoff/faceoff-top";
import { FaceoffBody } from "@/components/match-flow/faceoff/faceoff-body";
import { __resetRecordingOptInForTests, getRecordingOptIn } from "@/lib/match-flow/recording-optin";

const ME = { display_name: "Kai Reyes", current_elo: 1512 };
const OPP = { display_name: "Mina Park", current_elo: 1498 };
const STAKES = {
  challenger_win: 14,
  challenger_loss: -9,
  challenger_draw: -2,
  opponent_win: 9,
  opponent_loss: -14,
  opponent_draw: 2,
  challenger_expected: 0.5,
  opponent_expected: 0.5,
  weight_division_gap: 0,
  draw_score: 0.25,
};

function Harness({ phase, onWeighedIn = jest.fn(), onStarted = jest.fn(), onCancelledRemotely = jest.fn(), weightsRated = true }: {
  phase: "weight" | "ready";
  weightsRated?: boolean;
  onWeighedIn?: () => void;
  onStarted?: (s: string) => void;
  onCancelledRemotely?: (d?: string) => void;
}) {
  return (
    <FaceoffProvider
      active
      phase={phase}
      matchId="M1"
      exitHref="/arena"
      meId="me-1"
      opponentId="opp-1"
      myWeight={170}
      opponentWeight={167}
      weightsRated={weightsRated}
      onWeighedIn={onWeighedIn}
      onStarted={onStarted}
      onCancelledRemotely={onCancelledRemotely}
    >
      <FaceoffTop phase={phase} me={ME} opponent={OPP} />
      <FaceoffBody phase={phase} me={ME} opponent={OPP} />
    </FaceoffProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers = {};
  mockGetEloStakes.mockResolvedValue(STAKES);
  __resetRecordingOptInForTests(false);
});

describe("weigh-in", () => {
  it("shows the fight card, the stakes and the division line", async () => {
    const s = render(<Harness phase="weight" />);
    await flush();
    s.getByText("FACE-OFF · WEIGH IN");
    s.getByText("K. Reyes");
    s.getByText("M. Park");
    s.getByText("ELO 1512");
    expect(s.getByTestId("faceoff-my-weight")).toHaveTextContent("170 LBS");
    expect(s.getByTestId("faceoff-opponent-weight")).toHaveTextContent("167 LBS");
    s.getByText("3 LBS APART · SAME DIVISION");
    expect(s.getByTestId("weight-stakes-win")).toHaveTextContent("▲ +14");
    // The face-off passes no Dynamic Type cap, so the shared strip neither
    // caps nor truncates its cells here (only the incoming prompt does).
    for (const key of ["win", "draw", "loss"]) {
      const cell = s.getByTestId(`weight-stakes-${key}`);
      expect([key, cell.props.numberOfLines, cell.props.maxFontSizeMultiplier]).toEqual([key, undefined, undefined]);
    }
    expect(s.getByText("WIN").props.numberOfLines).toBeUndefined();
    // Viewer as challenger, with both weights.
    expect(mockGetEloStakes).toHaveBeenCalledWith(expect.anything(), 1512, 1498, 170, 167);
  });

  it("every match is the same kind: no RANKED or CASUAL tag", async () => {
    const s = render(<Harness phase="weight" />);
    await flush();
    expect(s.queryByText(/ranked/i)).toBeNull();
    expect(s.queryByText(/casual/i)).toBeNull();
  });

  it("Confirm (weight-confirm) moves on and tells the opponent this side weighed in", async () => {
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    s.getByText("CONFIRM WEIGHT");
    s.getByText("Confirm 170 lbs");
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-confirm"));
    });
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
    expect(mockSend.broadcastWeighedIn).toHaveBeenCalledWith("me-1", 170);
  });

  it("the opponent weighing in shows on their status; the match weight stays the rated one", async () => {
    const s = render(<Harness phase="weight" />);
    s.getByText("M. PARK WEIGHING IN");
    act(() => mockHandlers.onWeighedIn?.("opp-1", 171));
    s.getByText("WEIGHED IN");
    expect(s.getByTestId("faceoff-opponent-weight")).toHaveTextContent("167 LBS");
  });

  it("the pencil edits the PROFILE weight: this match's weight, stakes and weigh-in stay", async () => {
    mockUpdateWeight.mockResolvedValue({ ok: true, data: { weight: 172.5 } });
    const s = render(<Harness phase="weight" />);
    await flush();
    const stakesCalls = mockGetEloStakes.mock.calls.length;
    fireEvent.press(s.getByTestId("faceoff-edit-weight"));
    s.getByText("Updates your profile weight for future matches. This match keeps its weigh-in.");
    // Confirm waits while the editor is open.
    expect(s.getByTestId("weight-confirm").props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(s.getByTestId("faceoff-weight-input"), "12");
    expect(s.getByTestId("faceoff-weight-save").props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(s.getByTestId("faceoff-weight-input"), "172.5");
    await act(async () => {
      fireEvent.press(s.getByTestId("faceoff-weight-save"));
    });
    expect(mockUpdateWeight).toHaveBeenCalledWith(expect.anything(), "me-1", 172.5);
    expect(s.getByTestId("faceoff-my-weight")).toHaveTextContent("170 LBS");
    s.getByText("Profile weight saved: 172.5 lbs, for future matches.");
    s.getByText("Confirm 170 lbs");
    await flush();
    expect(mockGetEloStakes.mock.calls.length).toBe(stakesCalls);
    expect(s.getByTestId("weight-confirm").props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-confirm"));
    });
    expect(mockSend.broadcastWeighedIn).toHaveBeenLastCalledWith("me-1", 170);
  });

  it("Save is a 44 pt target and Cancel closes the editor", () => {
    const s = render(<Harness phase="weight" />);
    fireEvent.press(s.getByTestId("faceoff-edit-weight"));
    const style = s.getByTestId("faceoff-weight-save").props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.height).toBeGreaterThanOrEqual(44);
    expect(flat.minWidth).toBeGreaterThanOrEqual(44);
    fireEvent.press(s.getByTestId("faceoff-weight-cancel"));
    expect(s.queryByTestId("faceoff-weight-input")).toBeNull();
  });

  it("prices nothing until the match's rated (challenge) weights are read", async () => {
    render(<Harness phase="weight" weightsRated={false} />);
    await flush();
    expect(mockGetEloStakes).not.toHaveBeenCalled();
  });
});

describe("ready check", () => {
  it("keeps the harness's opponent panel, and I'm ready (ready-button) broadcasts", async () => {
    const s = render(<Harness phase="ready" />);
    s.getByText("FACE-OFF · READY");
    const panel = s.getByTestId("ready-panel-opponent");
    expect(panel.props.accessibilityLabel).toBe("Opponent, waiting");
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    expect(s.getByTestId("ready-panel-opponent").props.accessibilityLabel).toBe("Opponent, ready");
    s.getByText("M. PARK · READY");
    mockStart.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.press(s.getByTestId("ready-button"));
    });
    expect(mockSend.broadcastReady).toHaveBeenCalledWith("me-1");
    s.getByText("STARTING MATCH...");
  });

  it("both ready: starts the match and hands over the server started_at", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { started_at: "2026-09-27T12:00:00.000Z" } });
    const onStarted = jest.fn();
    const s = render(<Harness phase="ready" onStarted={onStarted} />);
    fireEvent.press(s.getByTestId("ready-button"));
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("2026-09-27T12:00:00.000Z"));
    expect(mockSend.broadcastTimerStarted).toHaveBeenCalledWith("2026-09-27T12:00:00.000Z");
  });

  it("recording is OFF by default, remembered when switched, and announced", async () => {
    const s = render(<Harness phase="ready" />);
    expect(s.getByTestId("faceoff-record-toggle").props.value).toBe(false);
    s.getByTestId("faceoff-camera-off");
    expect(mockSend.broadcastRecordingOptIn).toHaveBeenCalledWith("me-1", false);
    act(() => {
      fireEvent(s.getByTestId("faceoff-record-toggle"), "valueChange", true);
    });
    expect(getRecordingOptIn()).toBe(true);
    expect(mockSend.broadcastRecordingOptIn).toHaveBeenLastCalledWith("me-1", true);
    expect(s.queryByTestId("faceoff-camera-off")).toBeNull();
  });

  it("shows the opponent's choice, and warns when nobody records", () => {
    const s = render(<Harness phase="ready" />);
    s.getByText("M. PARK · CHOOSING");
    act(() => mockHandlers.onRecordingOptIn?.("opp-1", true));
    s.getByText("M. PARK RECORDING");
    expect(s.queryByTestId("faceoff-nobody-recording")).toBeNull();
    act(() => mockHandlers.onRecordingOptIn?.("opp-1", false));
    s.getByText("M. PARK NOT RECORDING");
    s.getByText("No one is recording this match");
  });

  it("repeats this side's state until the match starts (nothing here is in the DB)", () => {
    jest.useFakeTimers();
    render(<Harness phase="ready" />);
    const before = mockSend.broadcastRecordingOptIn.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(6_100);
    });
    expect(mockSend.broadcastRecordingOptIn.mock.calls.length).toBe(before + 2);
    jest.useRealTimers();
  });
});

describe("Leave", () => {
  it("is labelled 'Cancel match', confirms, cancels for both and exits", async () => {
    mockCancel.mockResolvedValue({ ok: true, data: {} });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    const s = render(<Harness phase="weight" />);
    s.getByText("Leave");
    fireEvent.press(s.getByLabelText("Cancel match"));
    expect(alert.mock.calls[0][0]).toBe("Cancel match?");
    expect(alert.mock.calls[0][2]?.map((b) => b.text)).toEqual(["Keep Waiting", "Cancel Match"]);
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/arena"));
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockSend.broadcastMatchCancelled).toHaveBeenCalled();
    alert.mockRestore();
  });

  it("never starts a match this athlete is leaving (both ready while the cancel is in flight)", async () => {
    mockCancel.mockReturnValue(new Promise(() => {}));
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    const s = render(<Harness phase="ready" />);
    fireEvent.press(s.getByTestId("ready-button"));
    fireEvent.press(s.getByLabelText("Cancel match"));
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await flush();
    expect(mockStart).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("an opponent's cancel leaves through the wizard's exit, once, with phase copy", () => {
    const onCancelledRemotely = jest.fn();
    render(<Harness phase="ready" onCancelledRemotely={onCancelledRemotely} />);
    act(() => {
      mockHandlers.onMatchCancelled?.();
      mockHandlers.onMatchCancelled?.();
    });
    expect(onCancelledRemotely).toHaveBeenCalledTimes(1);
    expect(onCancelledRemotely).toHaveBeenCalledWith("Your opponent left the ready check.");
  });
});
