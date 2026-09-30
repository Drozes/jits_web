/**
 * Face-off opponent weight check (jits-02vo.6, backend jr_be-ahn.4, board
 * P-Faceoff-Weight): after weighing in, each athlete confirms the other's
 * weigh-in or flags it. A flag BLOCKS the match until the flagged athlete
 * re-weighs and the flagger re-confirms, or the flagger withdraws. The RPCs
 * are mocked; the check state is the RPC payload shape, applied as the
 * wizard's useMatchWeightChecks would.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { MatchWeightChecks, WeightCheckStatus } from "@jits/shared/api/match-weight-checks";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: jest.fn(() => Promise.resolve(null)),
  getMatchDetails: jest.fn(() => Promise.resolve(null)),
}));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: jest.fn(),
  startMatch: (...a: unknown[]) => mockStart(...a),
}));
const mockCheck = jest.fn();
const mockReweigh = jest.fn();
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  checkOpponentWeight: (...a: unknown[]) => mockCheck(...a),
  reweighForMatch: (...a: unknown[]) => mockReweigh(...a),
}));

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
let mockHandlers: Handlers = {};
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: Handlers) => {
    mockHandlers = p;
    return {
      broadcastWeighedIn: jest.fn(() => Promise.resolve("ok")),
      broadcastRecordingOptIn: jest.fn(() => Promise.resolve("ok")),
      broadcastReady: jest.fn(() => Promise.resolve("ok")),
      broadcastTimerStarted: jest.fn(() => Promise.resolve("ok")),
      broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
    };
  },
}));

import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTop } from "@/components/match-flow/faceoff/faceoff-top";
import { FaceoffBody } from "@/components/match-flow/faceoff/faceoff-body";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { toast as mockToast } from "@/components/ui/toast";
import type { WeightChecksHandle, WeightChecksStatus } from "@/lib/match-flow/use-match-weight-checks";

const ME = { display_name: "Marco Reyes", current_elo: 1487 };
const OPP = { display_name: "Dayo Okafor", current_elo: 1512 };

interface Spec {
  /** My check of the opponent. */
  mine?: WeightCheckStatus;
  /** The opponent's check of me. */
  theirs?: WeightCheckStatus;
  required?: boolean;
  myWeight?: number | null;
  oppWeight?: number | null;
  mineFlaggedAt?: string | null;
  mineReweighedAt?: string | null;
  theirsFlaggedAt?: string | null;
  theirsReweighedAt?: string | null;
}

function stateOf(s: Spec = {}): MatchWeightChecks {
  const mine = s.mine ?? "pending";
  const theirs = s.theirs ?? "pending";
  const required = s.required ?? false;
  const blocked = [mine, theirs].some((x) => x === "flagged" || x === "recheck");
  const confirmed = [mine, theirs].filter((x) => x === "confirmed").length;
  return {
    matchId: "M1",
    required,
    blocked,
    canStart: !blocked && (!required || confirmed === 2),
    weights: { "me-1": s.myWeight === undefined ? 170 : s.myWeight, "opp-1": s.oppWeight === undefined ? 168 : s.oppWeight },
    checks: [
      { checkerId: "me-1", subjectId: "opp-1", status: mine, weightSeen: null, flagCount: 0, flaggedAt: s.mineFlaggedAt ?? null, reweighedAt: s.mineReweighedAt ?? null, updatedAt: null },
      { checkerId: "opp-1", subjectId: "me-1", status: theirs, weightSeen: null, flagCount: 0, flaggedAt: s.theirsFlaggedAt ?? null, reweighedAt: s.theirsReweighedAt ?? null, updatedAt: null },
    ],
  };
}

const mockRefetch = jest.fn();
/** Push a new DB state, as a realtime-triggered refetch would. */
let pushState: (s: MatchWeightChecks) => void = () => undefined;

function Harness({
  phase: initialPhase,
  initial = stateOf(),
  status = "ready",
  onWeighedIn = jest.fn(),
  onStarted = jest.fn(),
}: {
  phase: "weight" | "ready";
  initial?: MatchWeightChecks;
  status?: WeightChecksStatus;
  onWeighedIn?: () => void;
  onStarted?: (s: string) => void;
}) {
  const [phase, setPhase] = React.useState(initialPhase);
  const [state, setState] = React.useState<MatchWeightChecks | null>(initial);
  pushState = setState;
  const handle = React.useMemo<WeightChecksHandle>(
    () => ({ status, state, refetch: mockRefetch, apply: setState }),
    [status, state],
  );
  return (
    <FaceoffProvider
      active
      phase={phase}
      matchId="M1"
      exitHref="/arena"
      meId="me-1"
      opponentId="opp-1"
      myWeight={state?.weights["me-1"] ?? null}
      opponentWeight={state?.weights["opp-1"] ?? null}
      weightsRated
      weightChecks={handle}
      onWeighedIn={() => {
        onWeighedIn();
        setPhase("ready");
      }}
      onStarted={onStarted}
      onCancelledRemotely={jest.fn()}
    >
      <FaceoffTop phase={phase} me={ME} opponent={OPP} />
      <FaceoffBody phase={phase} me={ME} opponent={OPP} />
    </FaceoffProvider>
  );
}

async function weighIn(s: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.press(s.getByTestId("weight-confirm"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers = {};
  __resetRecordingOptInForTests(false);
});

describe("weigh-in: my check of the opponent", () => {
  it("after I weigh in: WEIGHED IN + YOUR CHECK (pending), the opponent's weight, Confirm and Doesn't look right", async () => {
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    await weighIn(s);
    expect(onWeighedIn).not.toHaveBeenCalled();
    s.getByText("WEIGHED IN");
    s.getByText("YOUR CHECK");
    expect(s.getByTestId("faceoff-weight-check-plate").props.accessibilityLabel).toBe("D. OKAFOR's weight, your check pending");
    expect(s.getByTestId("weight-check-line")).toHaveTextContent("D. OKAFOR WEIGHED IN AT 168 LBS");
    s.getByText("Confirm");
    s.getByText("Doesn't look right");
    // The pencil hides once weighed in (unchanged behavior) and my own
    // Confirm is gone.
    expect(s.queryByTestId("faceoff-edit-weight")).toBeNull();
    expect(s.queryByTestId("weight-confirm")).toBeNull();
  });

  it("Confirm sends the weight shown, then moves to the ready step", async () => {
    mockCheck.mockResolvedValue({ ok: true, data: stateOf({ mine: "confirmed" }) });
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    await weighIn(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-check-confirm"));
    });
    expect(mockCheck).toHaveBeenCalledWith(expect.anything(), "M1", "confirm", 168);
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
    s.getByText("FACE-OFF · READY");
    expect(s.getByTestId("ready-button").props.accessibilityState.disabled).toBe(false);
  });

  it("Doesn't look right flags it: the match is on hold, with Withdraw flag", async () => {
    mockCheck.mockResolvedValue({ ok: true, data: stateOf({ mine: "flagged", mineFlaggedAt: "2026-09-30T10:00:00Z" }) });
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    await weighIn(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-check-flag"));
    });
    expect(mockCheck).toHaveBeenCalledWith(expect.anything(), "M1", "flag", 168);
    expect(onWeighedIn).not.toHaveBeenCalled();
    s.getByText("You flagged D. Okafor's weight. Match is on hold.");
    s.getByText("YOU FLAGGED");
    expect(s.queryByTestId("weight-check-confirm")).toBeNull();
    s.getByTestId("weight-check-withdraw");
  });

  it("Withdraw flag clears the hold and moves to ready", async () => {
    mockCheck.mockResolvedValue({ ok: true, data: stateOf({ mine: "confirmed" }) });
    const onWeighedIn = jest.fn();
    const s = render(
      <Harness phase="weight" initial={stateOf({ mine: "flagged", mineFlaggedAt: "2026-09-30T10:00:00Z" })} onWeighedIn={onWeighedIn} />,
    );
    await weighIn(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-check-withdraw"));
    });
    expect(mockCheck).toHaveBeenCalledWith(expect.anything(), "M1", "withdraw", undefined);
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
  });

  it("the flagged opponent re-weighs: I see the new weight and re-confirm it", async () => {
    const onWeighedIn = jest.fn();
    const s = render(
      <Harness phase="weight" initial={stateOf({ mine: "flagged", mineFlaggedAt: "2026-09-30T10:00:00Z" })} onWeighedIn={onWeighedIn} />,
    );
    await weighIn(s);
    // Realtime: they re-weighed at 172 (my check stays flagged, stamped).
    act(() =>
      pushState(
        stateOf({ mine: "flagged", oppWeight: 172, mineFlaggedAt: "2026-09-30T10:00:00Z", mineReweighedAt: "2026-09-30T10:02:00Z" }),
      ),
    );
    expect(s.getByTestId("weight-check-line")).toHaveTextContent("D. OKAFOR RE-WEIGHED AT 172 LBS");
    expect(s.getByTestId("faceoff-opponent-weight")).toHaveTextContent("172 LBS");
    expect(s.queryByTestId("weight-check-withdraw")).toBeNull();
    mockCheck.mockResolvedValue({ ok: true, data: stateOf({ mine: "confirmed", oppWeight: 172 }) });
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-check-confirm"));
    });
    expect(mockCheck).toHaveBeenCalledWith(expect.anything(), "M1", "confirm", 172);
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
  });

  it("weight_changed: refetches and asks again, without moving on", async () => {
    mockCheck.mockResolvedValue({ ok: false, error: { code: "WEIGHT_CHANGED", message: "Their weight just changed. Check it again." } });
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" onWeighedIn={onWeighedIn} />);
    await weighIn(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-check-confirm"));
    });
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({ text1: "Weight changed" }));
    expect(onWeighedIn).not.toHaveBeenCalled();
    s.getByTestId("weight-check-prompt");
  });

  it("no checks for this match (no challenge, older backend): Confirm moves straight to ready", async () => {
    const onWeighedIn = jest.fn();
    const s = render(<Harness phase="weight" status="unavailable" initial={null as never} onWeighedIn={onWeighedIn} />);
    await weighIn(s);
    expect(onWeighedIn).toHaveBeenCalledTimes(1);
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe("flagged athlete: re-weigh", () => {
  it("the opponent flagged me: re-weigh prompt, reweigh_for_match, then waiting for their re-check", async () => {
    const s = render(
      <Harness phase="weight" initial={stateOf({ theirs: "flagged", theirsFlaggedAt: "2026-09-30T10:00:00Z" })} />,
    );
    await weighIn(s);
    s.getByText("D. Okafor says your weight doesn't look right. Re-weigh to continue.");
    expect(s.getByTestId("weight-reweigh-input").props.value).toBe("170");
    fireEvent.changeText(s.getByTestId("weight-reweigh-input"), "600");
    expect(s.getByTestId("weight-reweigh-submit").props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(s.getByTestId("weight-reweigh-input"), "171.4");
    mockReweigh.mockResolvedValue({
      ok: true,
      data: stateOf({ theirs: "flagged", myWeight: 171.4, theirsFlaggedAt: "2026-09-30T10:00:00Z", theirsReweighedAt: "2026-09-30T10:01:00Z" }),
    });
    await act(async () => {
      fireEvent.press(s.getByTestId("weight-reweigh-submit"));
    });
    expect(mockReweigh).toHaveBeenCalledWith(expect.anything(), "M1", 171.4);
    expect(s.queryByTestId("weight-reweigh")).toBeNull();
    s.getByText("Waiting for D. Okafor to check your new weight.");
    expect(s.getByTestId("faceoff-my-weight")).toHaveTextContent("171.4 LBS");
  });

  it("a flag raised while I sit on the ready step holds the match there, with the re-weigh", async () => {
    mockStart.mockReturnValue(new Promise(() => {}));
    const s = render(<Harness phase="ready" initial={stateOf({ mine: "confirmed" })} />);
    expect(s.getByTestId("ready-button").props.accessibilityState.disabled).toBe(false);
    act(() => pushState(stateOf({ mine: "confirmed", theirs: "flagged", theirsFlaggedAt: "2026-09-30T10:00:00Z" })));
    s.getByTestId("ready-weight-hold");
    s.getByText("MATCH ON HOLD · WEIGHT CHECK");
    s.getByTestId("weight-reweigh");
    expect(s.getByTestId("ready-button").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(s.getByTestId("ready-button"));
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("ready step gate", () => {
  it("cannot start while blocked, even with both ready; starts once the flag is resolved", async () => {
    mockStart.mockResolvedValue({ ok: true, data: { started_at: "2026-09-30T12:00:00.000Z" } });
    const onStarted = jest.fn();
    const s = render(<Harness phase="ready" initial={stateOf({ mine: "confirmed" })} onStarted={onStarted} />);
    fireEvent.press(s.getByTestId("ready-button"));
    act(() => pushState(stateOf({ mine: "confirmed", theirs: "flagged", theirsFlaggedAt: "2026-09-30T10:00:00Z" })));
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStart).not.toHaveBeenCalled();
    // They withdrew (or re-confirmed after my re-weigh).
    act(() => pushState(stateOf({ mine: "confirmed", theirs: "confirmed" })));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("2026-09-30T12:00:00.000Z"));
  });

  it("required rollout flag: a pending check waits; not required: it does not block", () => {
    const s = render(<Harness phase="ready" initial={stateOf({ mine: "confirmed", theirs: "pending", required: true })} />);
    s.getByText("Waiting for D. Okafor to check your weight.");
    s.getByText("WAITING FOR WEIGHT CHECKS");
    expect(s.getByTestId("ready-button").props.accessibilityState.disabled).toBe(true);
    s.unmount();
    const t = render(<Harness phase="ready" initial={stateOf({ mine: "confirmed", theirs: "pending", required: false })} />);
    expect(t.queryByTestId("ready-weight-hold")).toBeNull();
    expect(t.getByTestId("ready-button").props.accessibilityState.disabled).toBe(false);
  });

  it("start_match weight_flagged: back to the checks with the message, ready cleared, no retry loop", async () => {
    mockStart.mockResolvedValue({
      ok: false,
      error: { code: "WEIGHT_FLAGGED", message: "A weigh-in was flagged. The match is on hold until it is resolved." },
    });
    const s = render(<Harness phase="ready" initial={stateOf({ mine: "confirmed" })} />);
    fireEvent.press(s.getByTestId("ready-button"));
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await waitFor(() => expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({ text1: "Match on hold" })));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockRefetch).toHaveBeenCalled();
    // Ready is cleared: the button is back for a fresh tap.
    s.getByTestId("ready-button");
    s.getByText("Match starts when you both tap ready");
  });
});
