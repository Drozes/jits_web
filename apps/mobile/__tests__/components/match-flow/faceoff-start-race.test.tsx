/**
 * The face-off's start race (the self-run start policy, `useDualAutoStart`,
 * timekeeper mode PR3 gap test). Both phones call `start_match` once both
 * athletes are ready. The loser of the race reads the DB: a match that did
 * start moves this phone to live on the DB's `started_at`, and a match that
 * did not start says "Couldn't start match" with the server's reason.
 *
 * A persistent failure (owner decision A29, bug jits-l7g3; slice M3) says so
 * once per run, backs off and stops after `MAX_START_ATTEMPTS` calls, with
 * Leave available throughout; the last three cases fail on the old tight
 * loop (one toast per call, a call per render).
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
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getRatingStakes: jest.fn(async () => null),
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
}));
const mockStart = jest.fn();
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: (...a: unknown[]) => mockCancel(...a),
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
import { MAX_START_ATTEMPTS, START_RETRY_BACKOFF_MS } from "@/lib/match-flow/use-dual-auto-start";

const ME = { athleteId: "me-1", displayName: "Kai Reyes", currentElo: 1512 };
const OPP = { athleteId: "opp-1", displayName: "Mina Park", currentElo: 1498 };
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

/**
 * Every start_match refuses (not a race, not the weight gate). A loop is cut
 * off after `LOOP_CEILING` calls (the call then hangs), so the tight loop of
 * bug jits-l7g3 fails these cases on their call and toast counts, not on a
 * timeout.
 */
const LOOP_CEILING = 50;
function refuseEveryStart() {
  mockStart.mockImplementation(() =>
    mockStart.mock.calls.length > LOOP_CEILING ? new Promise(() => {}) : Promise.resolve(LOST),
  );
}

/** Let every pending start, DB read and state update settle. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
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

  it("hides Leave while the start is in flight; a persistent failure backs off and stops after a bounded number of attempts with ONE toast (A29, bug jits-l7g3)", async () => {
    // Rewritten on purpose by slice M3 (A29, a named M-R5 exception): this
    // case pinned the tight retry loop (a failed start re-armed the start
    // effect at once, about 3,600 calls and toasts in 5 s), and it fails on
    // that loop now: thousands of calls, a toast per attempt.
    jest.useFakeTimers();
    try {
      let fail!: (v: unknown) => void;
      // The first attempt is held so Leave can be checked mid-flight; every
      // attempt refuses the same way (not a race, not the weight gate), and
      // the DB never shows a start.
      refuseEveryStart();
      mockStart.mockReturnValueOnce(new Promise((r) => (fail = r)));
      mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
      const { s, onStarted } = renderReady();
      bothReady(s);
      await waitFor(() => s.getByText("STARTING MATCH..."));
      expect(s.queryByTestId("faceoff-leave")).toBeNull();
      await act(async () => {
        fail(LOST);
      });
      await settle();
      expect(toast.error).toHaveBeenCalledTimes(1);
      // Leave is back while the run backs off.
      s.getByTestId("faceoff-leave");
      // The bound and the backoff chosen for A29 (recorded on jits-l7g3):
      // three attempts, the second 2 s after the first failure, the third
      // 4 s after the second.
      expect(MAX_START_ATTEMPTS).toBe(3);
      expect(START_RETRY_BACKOFF_MS).toEqual([2_000, 4_000]);
      const advance = async (ms: number) => {
        await act(async () => {
          jest.advanceTimersByTime(ms);
        });
        await settle();
      };
      await advance(1_999);
      expect(mockStart).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(mockStart).toHaveBeenCalledTimes(2);
      await advance(3_999);
      expect(mockStart).toHaveBeenCalledTimes(2);
      await advance(1);
      expect(mockStart).toHaveBeenCalledTimes(3);
      // Well past the whole backoff, every refusal settling: no fourth.
      for (let i = 0; i < 12; i++) await advance(1_000);
      expect(mockStart).toHaveBeenCalledTimes(MAX_START_ATTEMPTS);
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith({ text1: "Couldn't start match", description: "Match is not pending" });
      // The run is over: nothing more, however long the face-off stays open.
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(MAX_START_ATTEMPTS);
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(onStarted).not.toHaveBeenCalled();
      // Leave stays available, and ready is cleared: a new run is a fresh tap.
      s.getByTestId("faceoff-leave");
      expect(s.getByTestId("ready-button")).toBeTruthy();
      expect(s.getByText("YOU · NOT READY")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a fresh tap after the run stopped is a new bounded run with its own single toast", async () => {
    jest.useFakeTimers();
    try {
      refuseEveryStart();
      mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
      const { s } = renderReady();
      bothReady(s);
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        await settle();
      }
      expect(mockStart).toHaveBeenCalledTimes(MAX_START_ATTEMPTS);
      expect(toast.error).toHaveBeenCalledTimes(1);
      fireEvent.press(s.getByTestId("ready-button"));
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        await settle();
      }
      expect(mockStart).toHaveBeenCalledTimes(2 * MAX_START_ATTEMPTS);
      expect(toast.error).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("Leave during the backoff stops the run: no further start_match", async () => {
    jest.useFakeTimers();
    try {
      refuseEveryStart();
      mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
      mockCancel.mockReturnValue(new Promise(() => {}));
      const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style === "destructive")?.onPress?.();
      });
      const { s } = renderReady();
      bothReady(s);
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(1);
      fireEvent.press(s.getByTestId("faceoff-leave"));
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        await settle();
      }
      expect(mockStart).toHaveBeenCalledTimes(1);
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Leave opened during the backoff and confirmed after the retry would have fired still cancels, once, with no further start_match", async () => {
    // The athlete reads "Couldn't start match", taps Leave and only confirms
    // after the 2 s backoff ended. Before the fix the retry fired under the
    // open alert, claimed the face-off for its call, and the confirm was a
    // silent no-op (no cancel at all).
    jest.useFakeTimers();
    try {
      refuseEveryStart();
      mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
      mockCancel.mockReturnValue(new Promise(() => {}));
      let confirm: (() => void) | undefined;
      const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
        confirm = buttons?.find((b) => b.style === "destructive")?.onPress as () => void;
      });
      const { s } = renderReady();
      bothReady(s);
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledTimes(1);
      fireEvent.press(s.getByTestId("faceoff-leave"));
      expect(alert).toHaveBeenCalledTimes(1);
      // Well past both backoffs with the alert still open: no retry.
      for (let i = 0; i < 8; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        await settle();
      }
      expect(mockStart).toHaveBeenCalledTimes(1);
      // The run ended with Leave: ready is cleared under the alert.
      s.getByText("YOU · NOT READY");
      await act(async () => {
        confirm?.();
      });
      await settle();
      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Keep Waiting after a Leave during the backoff: a fresh tap of ready is a new run", async () => {
    jest.useFakeTimers();
    try {
      refuseEveryStart();
      mockGetMatchDetails.mockResolvedValue({ id: "M1", status: "pending", started_at: null });
      // Keep Waiting: the alert closes with nothing done.
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const { s } = renderReady();
      bothReady(s);
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(1);
      fireEvent.press(s.getByTestId("faceoff-leave"));
      for (let i = 0; i < 8; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        await settle();
      }
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(mockCancel).not.toHaveBeenCalled();
      fireEvent.press(s.getByTestId("ready-button"));
      await settle();
      expect(mockStart).toHaveBeenCalledTimes(2);
      // A new run says so once again.
      expect(toast.error).toHaveBeenCalledTimes(2);
      alert.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Leave with no failed start keeps the shipped Leave: ready stays and nothing stops", async () => {
    mockStart.mockReturnValue(new Promise(() => {}));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { s } = renderReady();
    fireEvent.press(s.getByTestId("ready-button"));
    await settle();
    fireEvent.press(s.getByTestId("faceoff-leave"));
    expect(alert).toHaveBeenCalledTimes(1);
    s.getByText("YOU · READY");
    // The opponent's ready still starts the run.
    act(() => mockHandlers.onReadySignal?.("opp-1"));
    await settle();
    expect(mockStart).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
