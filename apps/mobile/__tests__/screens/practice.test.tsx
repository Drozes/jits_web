/**
 * The practice match screen (app/(app)/practice.tsx, jr_be spec 014).
 *
 * A full run against the scripted bot with every real match mutation doubled,
 * so the suite can prove the run is client-side only: the one network write is
 * markPracticeMatch, and the clip is never uploaded and is deleted on exit.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// ---- mocks ----

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({}),
  useResolvedColorScheme: () => "dark",
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/components/layout/app-header", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    AppHeader: ({ title }: { title: string }) => R.createElement(RN.Text, null, title),
  };
});

const mockAthlete = {
  id: "me",
  display_name: "Me",
  current_elo: 1000,
  current_weight: 170,
  status: "active",
  is_bot: false,
  practice_match_offered_at: null,
  practice_match_completed_at: null,
};
const mockRefreshSoft = jest.fn(async () => undefined);
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({ user: { id: "u" }, athlete: mockAthlete, isLoading: false }),
  useAuth: () => ({ refreshAthleteSoft: mockRefreshSoft }),
}));

// Every real mutation becomes a spy, so the suite can assert that nothing but
// markPracticeMatch is ever called during a run.
jest.mock("@jits/shared/api/mutations", () => {
  const actual = jest.requireActual("@jits/shared/api/mutations");
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) out[k] = typeof v === "function" ? jest.fn() : v;
  return out;
});

jest.mock("@jits/shared/api/queries", () => ({
  ...jest.requireActual("@jits/shared/api/queries"),
  getSubmissionTypes: jest.fn(),
  getEloStakes: jest.fn(),
}));

jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  ...jest.requireActual("@jits/shared/hooks/use-session-match-sync"),
  useSessionMatchSync: jest.fn(),
}));

jest.mock("@/lib/video/video-upload-manager", () => ({
  startMatchVideoUpload: jest.fn(),
}));

jest.mock("@/lib/video/upload-recording", () => ({ buildVideoPath: jest.fn() }));

jest.mock("@/lib/video/recording-file", () => ({ discardLocalClip: jest.fn() }));

jest.mock("@/lib/video/match-upload-store", () => ({
  ...jest.requireActual("@/lib/video/match-upload-store"),
  setMatchUpload: jest.fn(),
  beginMatchUploadAttempt: jest.fn(),
}));

jest.mock("@/lib/arena/arena-store", () => ({
  ...jest.requireActual("@/lib/arena/arena-store"),
  useArenaMatchScreen: jest.fn(),
  arenaActions: { toggle: jest.fn(), sendChallenge: jest.fn(), goOffline: jest.fn() },
}));

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));

jest.mock("expo-av", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Audio: { setAudioModeAsync: jest.fn(async () => undefined) },
    ResizeMode: { CONTAIN: "contain" },
    Video: (props: Record<string, unknown>) => R.createElement(RN.View, props),
  };
});

// A camera that records until stopped, then settles with a local file.
const mockPermission = { granted: true };
const mockCamera = {
  recordAsync: jest.fn(),
  stopRecording: jest.fn(),
};
jest.mock("expo-camera", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    CameraView: R.forwardRef(
      (props: { onCameraReady?: () => void }, ref: { current: unknown } | null) => {
        R.useLayoutEffect(() => {
          if (ref) ref.current = mockCamera;
          return () => {
            if (ref) ref.current = null;
          };
        }, []);
        R.useEffect(() => props.onCameraReady?.(), []);
        return R.createElement(RN.View, { testID: "camera-view" });
      },
    ),
    useCameraPermissions: () => [
      { granted: mockPermission.granted, canAskAgain: true },
      jest.fn(),
      jest.fn(async () => ({})),
    ],
    useMicrophonePermissions: () => [
      { granted: mockPermission.granted, canAskAgain: true },
      jest.fn(),
      jest.fn(async () => ({})),
    ],
  };
});

import PracticeScreen from "@/app/(app)/practice";
import * as mutations from "@jits/shared/api/mutations";
import * as queries from "@jits/shared/api/queries";
import { useSessionMatchSync } from "@jits/shared/hooks/use-session-match-sync";
import { startMatchVideoUpload } from "@/lib/video/video-upload-manager";
import { discardLocalClip } from "@/lib/video/recording-file";
import { setMatchUpload } from "@/lib/video/match-upload-store";
import { arenaActions, useArenaMatchScreen } from "@/lib/arena/arena-store";
import {
  BOT_ACCEPT_MS,
  BOT_CONFIRM_MS,
  BOT_READY_MS,
  PRACTICE_BOT_ID,
} from "@/lib/practice/constants";
import { AUTO_END_DELAY_MS } from "@/lib/video/recording-limits";

const CLIP = "file:///cache/practice.mp4";
const markPracticeMatch = mutations.markPracticeMatch as jest.Mock;

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockPermission.granted = true;
  markPracticeMatch.mockResolvedValue({
    ok: true,
    data: { practice_match_offered_at: "t", practice_match_completed_at: null },
  });
  (queries.getSubmissionTypes as jest.Mock).mockResolvedValue([
    { code: "armbar", display_name: "Armbar" },
  ]);
  let resolveRecord: ((v: { uri: string }) => void) | null = null;
  mockCamera.recordAsync.mockImplementation(
    () => new Promise((res) => (resolveRecord = res)),
  );
  mockCamera.stopRecording.mockImplementation(() => resolveRecord?.({ uri: CLIP }));
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Screen = ReturnType<typeof render>;

/** Offline -> lobby -> waiting -> (bot accepts) -> weight. */
function toWeight(s: Screen) {
  fireEvent.press(s.getByLabelText("Go live"));
  fireEvent.press(s.getByLabelText("Challenge Practice Partner"));
  expect(s.getByTestId("arena-waiting-plate")).toBeTruthy();
  advance(BOT_ACCEPT_MS);
  expect(s.getByTestId("match-step-weight")).toBeTruthy();
}

/** Weight -> ready -> (both ready) -> live. */
function toLive(s: Screen) {
  toWeight(s);
  fireEvent.press(s.getByTestId("weight-confirm"));
  expect(s.getByTestId("match-step-ready")).toBeTruthy();
  fireEvent.press(s.getByTestId("ready-button"));
  advance(BOT_READY_MS);
  expect(s.getByTestId("match-step-live")).toBeTruthy();
}

/** Live -> End Match -> end -> result. */
async function toResult(s: Screen) {
  toLive(s);
  await flush();
  fireEvent.press(s.getByTestId("live-end"));
  await flush();
  expect(s.getByTestId("match-step-end")).toBeTruthy();
  advance(1000);
  expect(s.getByTestId("match-step-result")).toBeTruthy();
}

/** Result (draw) -> confirm -> (bot confirms) -> summary. */
async function toSummary(s: Screen) {
  await toResult(s);
  fireEvent.press(s.getByTestId("result-outcome-draw"));
  fireEvent.press(s.getByTestId("result-record"));
  expect(s.getByTestId("match-step-confirm")).toBeTruthy();
  advance(BOT_CONFIRM_MS);
  fireEvent.press(s.getByTestId("confirm-result"));
  expect(s.getByTestId("match-step-summary")).toBeTruthy();
  await flush();
}

describe("PracticeScreen", () => {
  it("runs the whole Arena flow in order with the real step headers", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    expect(s.getByText("Step 8 / 8")).toBeTruthy();
    expect(s.getByText("Practice: rating unchanged")).toBeTruthy();
  });

  it("shows the PRACTICE tag with its accessibility label on every phase", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    const tag = () => s.getByLabelText("Practice match");
    expect(tag()).toBeTruthy();
    toWeight(s);
    expect(tag()).toBeTruthy();
    fireEvent.press(s.getByTestId("weight-confirm"));
    expect(tag()).toBeTruthy();
  });

  it("marks offered once on mount and completed once on reaching the summary", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    expect(markPracticeMatch).toHaveBeenCalledTimes(1);
    expect(markPracticeMatch).toHaveBeenLastCalledWith({}, "offered");
    await toSummary(s);
    expect(markPracticeMatch).toHaveBeenCalledTimes(2);
    expect(markPracticeMatch).toHaveBeenLastCalledWith({}, "completed");
    expect(mockRefreshSoft).toHaveBeenCalled();
  });

  it("does not mark completed when the athlete exits early", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    toWeight(s);
    fireEvent.press(s.getByTestId("practice-exit"));
    expect(mockRouter.back).toHaveBeenCalled();
    s.unmount();
    expect(markPracticeMatch).not.toHaveBeenCalledWith({}, "completed");
  });

  it("keeps going when markPracticeMatch fails", async () => {
    markPracticeMatch.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    expect(s.getByText("Practice: rating unchanged")).toBeTruthy();
  });

  it("never calls a real match mutation, upload, stakes read, channel or Arena action", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    for (const [name, fn] of Object.entries(mutations)) {
      if (name === "markPracticeMatch" || !jest.isMockFunction(fn)) continue;
      expect([name, (fn as jest.Mock).mock.calls.length]).toEqual([name, 0]);
    }
    expect(queries.getEloStakes).not.toHaveBeenCalled();
    expect(startMatchVideoUpload).not.toHaveBeenCalled();
    expect(setMatchUpload).not.toHaveBeenCalled();
    expect(useSessionMatchSync).not.toHaveBeenCalled();
    expect(arenaActions.toggle).not.toHaveBeenCalled();
    expect(arenaActions.sendChallenge).not.toHaveBeenCalled();
  });

  it("mounts useArenaMatchScreen for the screen", async () => {
    render(<PracticeScreen />);
    await flush();
    expect(useArenaMatchScreen).toHaveBeenCalled();
  });

  it("cancel in waiting returns to the lobby and the bot never accepts", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    fireEvent.press(s.getByLabelText("Go live"));
    fireEvent.press(s.getByLabelText("Challenge Practice Partner"));
    fireEvent.press(s.getByLabelText("Cancel challenge"));
    advance(BOT_ACCEPT_MS * 2);
    expect(s.queryByTestId("match-step-weight")).toBeNull();
    expect(s.getByLabelText("Challenge Practice Partner")).toBeTruthy();
  });

  it("starts the clock at 00:30, pauses, resumes and auto-ends at 00:00", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    toLive(s);
    expect(s.getByTestId("live-timer")).toHaveTextContent("00:30");
    advance(5000);
    expect(s.getByTestId("live-timer")).toHaveTextContent("00:25");
    fireEvent.press(s.getByTestId("live-pause-toggle"));
    advance(5000);
    expect(s.getByTestId("live-timer")).toHaveTextContent("00:25");
    fireEvent.press(s.getByTestId("live-pause-toggle"));
    advance(25000);
    expect(s.getByTestId("live-timer")).toHaveTextContent("00:00");
    advance(AUTO_END_DELAY_MS);
    await flush();
    expect(s.getByTestId("match-step-end")).toBeTruthy();
  });

  it("validates the result with the real rules and offers no dispute", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toResult(s);
    const record = () => s.getByTestId("result-record");
    expect(record()).toBeDisabled();
    fireEvent.press(s.getByTestId("result-outcome-submission"));
    fireEvent.press(s.getByTestId(`result-winner-${PRACTICE_BOT_ID}`));
    fireEvent.press(s.getByTestId("result-submission-armbar"));
    expect(record()).toBeDisabled(); // finish time required
    fireEvent.changeText(s.getByTestId("result-finish-time"), "0:45");
    expect(record()).toBeDisabled(); // past the 30s practice clock
    fireEvent.changeText(s.getByTestId("result-finish-time"), "0:20");
    expect(record()).not.toBeDisabled();
    fireEvent.press(record());
    expect(s.getByTestId("confirm-verdict")).toHaveTextContent("YOU LOST");
    expect(s.queryByTestId("confirm-dispute")).toBeNull();
    expect(s.queryByText(/rating is already updated/i)).toBeNull();
    expect(s.getByTestId("confirm-panel-opponent-confirming")).toBeTruthy();
    advance(BOT_CONFIRM_MS);
    expect(s.getByTestId("confirm-panel-opponent-confirmed")).toBeTruthy();
  });

  it("offers only a draw when the submission list could not load", async () => {
    (queries.getSubmissionTypes as jest.Mock).mockResolvedValue([]);
    const s = render(<PracticeScreen />);
    await flush();
    await toResult(s);
    fireEvent.press(s.getByTestId("result-outcome-submission"));
    expect(s.getByTestId("practice-no-submissions")).toBeTruthy();
    expect(s.getByTestId("result-record")).toBeDisabled();
  });

  it("records one local clip, offers playback, and deletes it on exit", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1);
    expect(s.queryByText(/share|rematch|view match details/i)).toBeNull();
    expect(s.getByText(/clip stays on this phone/)).toBeTruthy();
    fireEvent.press(s.getByTestId("practice-watch-clip"));
    const player = s.getByTestId("practice-clip-player");
    expect(player.props.source).toEqual({ uri: CLIP });
    expect(player.props.isMuted).toBe(true);
    expect(discardLocalClip).not.toHaveBeenCalledWith(CLIP);
    fireEvent.press(s.getByTestId("practice-done"));
    expect(mockRouter.back).toHaveBeenCalled();
    s.unmount();
    expect(discardLocalClip).toHaveBeenCalledWith(CLIP);
    expect(startMatchVideoUpload).not.toHaveBeenCalled();
  });

  it("Go to the Arena leaves through exitMatchTo", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    fireEvent.press(s.getByTestId("practice-go-arena"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/arena");
  });

  it("Practice again resets to offline, deletes the clip, and counts a second completion", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    fireEvent.press(s.getByTestId("practice-again"));
    expect(discardLocalClip).toHaveBeenCalledWith(CLIP);
    expect(s.getByLabelText("Go live")).toBeTruthy();
    expect(s.queryByTestId("practice-watch-clip")).toBeNull();
    await toSummary(s);
    expect(markPracticeMatch.mock.calls.filter((c) => c[1] === "completed")).toHaveLength(2);
    expect(markPracticeMatch.mock.calls.filter((c) => c[1] === "offered")).toHaveLength(1);
  });

  it("completes with no clip and no error when camera permission is denied", async () => {
    mockPermission.granted = false;
    const s = render(<PracticeScreen />);
    await flush();
    await toSummary(s);
    expect(mockCamera.recordAsync).not.toHaveBeenCalled();
    expect(s.queryByTestId("practice-watch-clip")).toBeNull();
    expect(s.getByText(/No clip this time/)).toBeTruthy();
  });

  it("exits from live with no bot timer or recording left behind", async () => {
    const s = render(<PracticeScreen />);
    await flush();
    toLive(s);
    await flush();
    fireEvent.press(s.getByTestId("practice-exit"));
    s.unmount();
    advance(60_000);
    await flush();
    expect(startMatchVideoUpload).not.toHaveBeenCalled();
    expect(markPracticeMatch).not.toHaveBeenCalledWith({}, "completed");
  });
});
