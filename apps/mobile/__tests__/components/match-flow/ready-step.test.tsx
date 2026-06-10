/**
 * Tests for the ready-check step (components/match-flow/steps/ready-step.tsx).
 *
 * Focus: the start-race rescue. Both devices race start_match when the ready
 * handshake completes and the RPC only succeeds once (pending -> in_progress).
 * The loser must check the DB before surfacing an error:
 * - rescue path: start_match fails but the match IS running -> advance via
 *   the DB's started_at, no error toast, no duplicate timer broadcast.
 * - fallthrough: start_match fails and the match never started -> error
 *   toast, onStarted never fires, and startedRef is reset so a later
 *   attempt is possible.
 */
import * as React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ---- mocks ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_target: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textSecondary: "#9AA3AD",
    statePositive: "#3FB950",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@jits/shared/api/mutations", () => ({
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
}));

jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: jest.fn(),
}));

interface CapturedSyncParams {
  onReadySignal?: (athleteId: string) => void;
  onTimerStarted?: (startedAt: string) => void;
  onMatchCancelled?: () => void;
}

const mockBroadcastTimerStarted = jest.fn();
const mockBroadcastReady = jest.fn();
const mockBroadcastMatchCancelled = jest.fn();
let mockSyncParams: CapturedSyncParams | null = null;

jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: CapturedSyncParams) => {
    mockSyncParams = params;
    return {
      broadcastTimerStarted: mockBroadcastTimerStarted,
      broadcastReady: mockBroadcastReady,
      broadcastMatchCancelled: mockBroadcastMatchCancelled,
    };
  },
}));

import { ReadyStep } from "@/components/match-flow/steps/ready-step";
import { toast } from "@/components/ui/toast";
import { startMatch } from "@jits/shared/api/mutations";
import { getMatchDetails } from "@jits/shared/api/queries";

const mockStartMatch = startMatch as jest.Mock;
const mockGetMatchDetails = getMatchDetails as jest.Mock;

function renderReadyStep(onStarted: jest.Mock) {
  return render(
    <ReadyStep
      sessionId="S1"
      matchId="M1"
      currentAthleteId="me-1"
      opponentId="opp-1"
      onStarted={onStarted}
    />,
  );
}

/** Tap our Ready button, then deliver the opponent's ready broadcast. */
function driveBothReady(utils: ReturnType<typeof render>) {
  fireEvent.press(utils.getByText("Ready"));
  act(() => {
    mockSyncParams?.onReadySignal?.("opp-1");
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncParams = null;
});

describe("ReadyStep", () => {
  it("rescues a lost start race via getMatchDetails instead of surfacing an error", async () => {
    // The other device won the pending -> in_progress transition; our
    // start_match fails, but the match IS running.
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "match already started" },
    });
    mockGetMatchDetails.mockResolvedValue({
      status: "in_progress",
      started_at: "2026-06-10T12:00:00.000Z",
    });

    const onStarted = jest.fn();
    const utils = renderReadyStep(onStarted);
    driveBothReady(utils);

    await waitFor(() =>
      expect(onStarted).toHaveBeenCalledWith("2026-06-10T12:00:00.000Z"),
    );
    expect(mockStartMatch).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(mockGetMatchDetails).toHaveBeenCalledWith(expect.anything(), "M1");
    // Losing the race is NOT an error, and the winner already broadcast
    // timer_started; re-broadcasting would be a duplicate.
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockBroadcastTimerStarted).not.toHaveBeenCalled();
  });

  it("surfaces the error and does not advance when the match never started", async () => {
    mockStartMatch.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    mockGetMatchDetails.mockResolvedValue(null);

    const onStarted = jest.fn();
    const utils = renderReadyStep(onStarted);
    driveBothReady(utils);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.objectContaining({ text1: "Couldn't start match" }),
      ),
    );
    expect(onStarted).not.toHaveBeenCalled();

    // startedRef was reset on failure, so the both-ready effect is allowed
    // to attempt the start again (loading flipping back re-arms it).
    await waitFor(() =>
      expect(mockStartMatch.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    expect(onStarted).not.toHaveBeenCalled();

    // Stop the re-armed start loop before test teardown.
    utils.unmount();
  });
});
