/**
 * The face-off's start race (the self-run start policy, `useDualAutoStart`,
 * timekeeper mode PR3 gap test). Both phones call `start_match` once both
 * athletes are ready. The loser of the race reads the DB: a match that did
 * start moves this phone to live on the DB's `started_at`, and a match that
 * did not start says "Couldn't start match" with the server's reason.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: jest.fn(async () => null),
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
}));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: jest.fn(),
  startMatch: (...a: unknown[]) => mockStart(...a),
}));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: jest.fn(async () => ({ ok: true, data: null })),
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

import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTop } from "@/components/match-flow/faceoff/faceoff-top";
import { FaceoffBody } from "@/components/match-flow/faceoff/faceoff-body";
import { toast } from "@/components/ui/toast";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";
import { __resetRecordingIntentForTests } from "@/lib/match-flow/recording-intent";

const ME = { displayName: "Kai Reyes", currentElo: 1512 };
const OPP = { displayName: "Mina Park", currentElo: 1498 };
const LOST = { ok: false, error: { code: "UNKNOWN", message: "Match is not pending" } };

function renderReady(onStarted = jest.fn()) {
  const s = render(
    <FaceoffProvider
      active
      phase="ready"
      matchId="M1"
      exitHref="/arena"
      meId="me-1"
      opponentId="opp-1"
      myWeight={170}
      opponentWeight={167}
      weightsRated
      onWeighedIn={jest.fn()}
      onStarted={onStarted}
      onCancelledRemotely={jest.fn()}
    >
      <FaceoffTop phase="ready" me={ME} opponent={OPP} />
      <FaceoffBody phase="ready" me={ME} opponent={OPP} />
    </FaceoffProvider>,
  );
  return { s, onStarted };
}

/** Both athletes ready: this phone races start_match. */
function bothReady(s: ReturnType<typeof render>) {
  fireEvent.press(s.getByTestId("ready-button"));
  act(() => mockHandlers.onReadySignal?.("opp-1"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers = {};
  __resetRecordingOptInForTests(false);
  __resetAiConsentForTests({ athleteId: "me-1", consentAt: "2026-10-14T12:00:00Z", known: true });
  __resetRecordingIntentForTests();
});

describe("losing the start race", () => {
  it("follows a match the other phone started, on the DB's started_at, with no error", async () => {
    mockStart.mockResolvedValue(LOST);
    mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "in_progress", started_at: "2026-10-19T12:00:03.000Z" });
    const { s, onStarted } = renderReady();
    bothReady(s);
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("2026-10-19T12:00:03.000Z"));
    expect(mockGetMatchDetails).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(toast.error).not.toHaveBeenCalled();
    // The winner already announced the start; the loser does not repeat it.
    expect(mockSend.broadcastTimerStarted).not.toHaveBeenCalled();
  });

  it("says Couldn't start match with the server's reason when the DB shows no start", async () => {
    // The first attempt loses; later attempts hang, so the test sees one failure.
    mockStart.mockResolvedValueOnce(LOST).mockReturnValue(new Promise(() => {}));
    mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
    const { s, onStarted } = renderReady();
    bothReady(s);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match", description: "Match is not pending" }),
    );
    expect(onStarted).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable match like one that did not start", async () => {
    mockStart.mockResolvedValueOnce(LOST).mockReturnValue(new Promise(() => {}));
    mockGetMatchDetails.mockResolvedValue(null);
    const { s, onStarted } = renderReady();
    bothReady(s);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match", description: "Match is not pending" }),
    );
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("an in-progress read with no started_at is not followed", async () => {
    mockStart.mockResolvedValueOnce(LOST).mockReturnValue(new Promise(() => {}));
    mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "in_progress", started_at: null });
    const { s, onStarted } = renderReady();
    bothReady(s);
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("hides Leave while the start is in flight; after a failed start both stay ready and it retries at once (pins current behaviour, bug jits-l7g3)", async () => {
    let fail!: (v: unknown) => void;
    mockStart.mockReturnValueOnce(new Promise((r) => (fail = r))).mockReturnValue(new Promise(() => {}));
    mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
    const { s } = renderReady();
    bothReady(s);
    await waitFor(() => s.getByText("STARTING MATCH..."));
    expect(s.queryByTestId("faceoff-leave")).toBeNull();
    await act(async () => {
      fail(LOST);
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    // Nothing cleared ready, so the start policy races start_match again at
    // once, with no backoff and a new toast each time. This pins today's
    // behaviour so a refactor cannot change it by accident; it is the bug
    // jits-l7g3 tracks, and the fix for that bead updates this test on purpose.
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  });
});
