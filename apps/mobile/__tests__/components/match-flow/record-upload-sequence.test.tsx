/**
 * The record -> upload sequence across the step boundary (jits-od3,
 * jits-2zpe).
 *
 * This drives the REAL recorder hook and the REAL upload path (only the
 * native modules and the Supabase client are stubbed), so it exercises the
 * chain that actually shipped: end the match -> the live step unmounts ->
 * recordAsync settles -> upload -> match_videos write -> what the user
 * sees. The old code had no surface left by the time any of that happened.
 *
 * THE FAILURE IS DERIVED FROM DATA, NOT FROM A REJECTION. supabase-js does
 * not reject: `shouldThrowOnError` defaults to false and an outer handler
 * turns fetch errors into a RESOLVED `{ data: null, error }`. So the
 * database failure here is a resolved response carrying an `error`, the
 * only shape production can actually produce. A test built on
 * `mockRejectedValue` would pass against a fix that only handles
 * `.catch()`, which is dead code in production.
 */
import * as React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ---- native module stubs ----

interface FakeCamera {
  recordAsync: jest.Mock;
  stopRecording: jest.Mock;
}

/**
 * recordAsync resolves with a clip URI only once stopRecording fires, the
 * same contract expo-camera has.
 */
const mockCamera: FakeCamera = {
  recordAsync: jest.fn(),
  stopRecording: jest.fn(),
};

/** Set by the CameraView stub each time one mounts. */
const mockCameraMounts = { count: 0 };

jest.mock("expo-camera", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    // A CameraView that behaves like the real one for the three things this
    // sequence depends on: it publishes an imperative handle on the ref, it
    // DETACHES that handle on unmount, and it reports readiness once the
    // native session is live.
    //
    // The detach is not cosmetic. React attaches and detaches refs in the
    // MUTATION phase, so a real CameraView's handle is already null by the
    // time any passive effect cleanup runs. This stub used to set the ref
    // on mount and never null it, which diverges from React in exactly the
    // direction that hides unmount-time bugs: it kept
    // `useVideoRecorder`'s unmount "stop the camera" guard looking alive
    // when it was dead code. A layout effect is used rather than a passive
    // one so the attach/detach lands in the same commit phase React uses.
    CameraView: R.forwardRef(
      (props: { onCameraReady?: () => void }, ref: React.Ref<unknown>) => {
        R.useLayoutEffect(() => {
          const set = (v: unknown) => {
            if (typeof ref === "function") ref(v);
            else if (ref && typeof ref === "object") {
              (ref as { current: unknown }).current = v;
            }
          };
          set(mockCamera);
          return () => set(null);
        }, []);
        R.useEffect(() => {
          mockCameraMounts.count += 1;
          props.onCameraReady?.();
        }, []);
        return R.createElement(RN.View, { testID: "camera-view" });
      },
    ),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    useMicrophonePermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

const mockGetInfoAsync = jest.fn();
jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

// Custody of the local clip (move out of the camera cache, delete when the
// job settles) is covered in __tests__/lib/video/recording-file.test.ts.
// Here it would only add a filesystem to stub.
jest.mock("@/lib/video/recording-file", () => ({
  retainRecording: (uri: string) => uri,
  releaseRecording: jest.fn(),
}));

// The real NetInfo module reaches for a native reachability probe that does
// not exist under Jest. The manager only uses it to notice a RECONNECT.
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: async () => ({ isConnected: true }),
    addEventListener: () => () => undefined,
  },
}));

// Backoff is real everywhere else; here it would just make the test sleep.
jest.mock("@jits/shared/utils", () => ({
  ...jest.requireActual("@jits/shared/utils"),
  backoffDelayMs: () => 0,
}));

// ---- tus-js-client double ----
//
// The upload is now a resumable tus transfer. The protocol is tus's problem;
// what this sequence cares about is that ONE transfer happens, against the
// object key prod RLS requires, and that its outcome reaches a surface that
// outlives the live step.

interface CapturedTus {
  options: Record<string, unknown>;
}
const mockTusCalls: CapturedTus[] = [];
const mockTusFailure = { current: null as Error | null };

/**
 * Calls one of the tus option callbacks. A helper rather than an inline
 * cast because a `jest.mock` factory may not reference any out-of-scope
 * identifier, including the parameter name in a function type annotation.
 */
function mockInvoke(options: Record<string, unknown>, key: string, ...args: unknown[]): void {
  const fn = options[key];
  if (typeof fn === "function") (fn as (...rest: unknown[]) => void)(...args);
}

jest.mock("tus-js-client/lib.es5/browser/index.js", () => ({
  Upload: class {
    url: string | null = null;
    options: Record<string, unknown>;
    constructor(_file: unknown, options: Record<string, unknown>) {
      this.options = options;
      mockTusCalls.push({ options });
    }
    start() {
      if (mockTusFailure.current) {
        mockInvoke(this.options, "onError", mockTusFailure.current);
        return;
      }
      this.url = "https://example.supabase.co/storage/v1/upload/resumable/abc";
      mockInvoke(this.options, "onUploadUrlAvailable");
      mockInvoke(this.options, "onProgress", 1, 1);
      mockInvoke(this.options, "onSuccess");
    }
    abort() {
      return Promise.resolve();
    }
  },
}));

// ---- Supabase client: resolved responses, never rejections ----

const mockInsertSingle = jest.fn();
const mockStorageRemove = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
    from: () => ({
      insert: () => ({ select: () => ({ single: () => mockInsertSingle() }) }),
    }),
    storage: { from: () => ({ remove: (...a: unknown[]) => mockStorageRemove(...a) }) },
  },
}));

jest.mock("@/lib/env", () => ({
  env: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon-key" },
}));

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

// ---- match-flow environment ----

jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => {} }));

jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => Promise.resolve(),
    timeWarning: () => Promise.resolve(),
  },
}));

interface CapturedSyncParams {
  onTimerStarted?: (startedAt: string) => void;
  onMatchEnded?: () => void;
}
const mockSyncParams: { current: CapturedSyncParams | null } = { current: null };
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: CapturedSyncParams) => {
    // The ready step and the live step both subscribe; the ready step's
    // params are the ones carrying onTimerStarted.
    if (params.onTimerStarted) mockSyncParams.current = params;
    return {
      broadcastTimerStarted: jest.fn(),
      broadcastReady: jest.fn(),
      broadcastMatchCancelled: jest.fn(),
      broadcastMatchEnded: jest.fn(),
      broadcastTimerPaused: jest.fn(),
      broadcastTimerResumed: jest.fn(),
    };
  },
}));

jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    formatted: "05:00",
    remaining: 300,
    paused: false,
    running: true,
    syncFromBroadcast: jest.fn(),
  }),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    textSecondary: "#9AA3AD",
    textOnAccent: "#FFFFFF",
    statePositive: "#3FB950",
    stateNegative: "#F85149",
    accentCta: "#E5484D",
  }),
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));

jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { size: () => 0, subscribe: () => () => {} },
}));

// The ELO primitives pull reanimated in through the barrel; render each of
// them as a plain container that still shows its children.
jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = (props: { children?: React.ReactNode }) =>
    R.createElement(RN.View, null, props?.children ?? null);
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

const mockUseMatchDetails = jest.fn();
jest.mock("@/lib/match-flow/use-match-details", () => ({
  useMatchDetails: (matchId: string) => mockUseMatchDetails(matchId),
}));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { computeMaxRecordingSeconds } from "@/lib/video/recording-limits";
import { resetMatchUploadStore } from "@/lib/video/match-upload-store";

// ---- fixtures ----

const MATCH_DURATION = 600;

function participant(id: string, name: string) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 80,
    outcome: null,
    elo_before: null,
    elo_after: null,
    elo_delta: null,
    weight_division_gap: 0,
  };
}

function matchResult(status: string) {
  return {
    match: {
      id: "M1",
      status,
      match_type: "casual",
      duration_seconds: MATCH_DURATION,
      started_at: "2026-09-18T12:00:00.000Z",
      paused_at: null,
      total_paused_duration: 0,
      participants: [participant("me-1", "Me"), participant("opp-1", "Opponent")],
    },
    submissionTypes: [],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  };
}

function renderWizard(status: string) {
  mockUseMatchDetails.mockReturnValue(matchResult(status));
  return render(
    <MatchFlowWizard
      exitHref="/(app)/arena"
      exitLabel="Back to Arena"
      matchId="M1"
      currentAthleteId="me-1"
    />,
  );
}

/** A PostgREST RLS denial, as supabase-js actually delivers one. */
const RLS_DENIAL = {
  data: null,
  error: {
    code: "42501",
    message: 'new row violates row-level security policy for table "match_videos"',
    details: null,
    hint: null,
  },
};

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockCameraMounts.count = 0;
  mockSyncParams.current = null;
  // The upload store is module state and outlives a render by design.
  resetMatchUploadStore();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

  // recordAsync resolves with a clip only once stopRecording fires.
  let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
  mockCamera.recordAsync.mockImplementation(
    () =>
      new Promise<{ uri: string } | undefined>((res) => {
        resolveRecord = res;
      }),
  );
  mockCamera.stopRecording.mockImplementation(() => {
    resolveRecord?.({ uri: "file://clip.mp4" });
  });

  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
  mockTusCalls.length = 0;
  mockTusFailure.current = null;
  mockStorageRemove.mockResolvedValue({ data: [{ name: "x" }], error: null });
  mockInsertSingle.mockResolvedValue({ data: { id: "VID-1" }, error: null });
});

afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

describe("the camera is warm before the match starts (jits-2zpe)", () => {
  it("mounts the viewfinder on the ready step, without recording", async () => {
    const { getByText, getByTestId, queryByTestId } = renderWizard("pending");

    // Weight step: no camera yet. A live capture session on a step that can
    // sit open indefinitely would burn battery for nothing.
    expect(queryByTestId("camera-view")).toBeNull();

    fireEvent.press(getByText("Confirm Weights"));

    // Ready step: the session is warming while the athletes tap Ready, so
    // onCameraReady has long since fired by the time start_match does.
    getByTestId("camera-view");
    getByText(/preview only/i);
    // Warm is not recording. Nothing is captured before the match starts.
    expect(mockCamera.recordAsync).not.toHaveBeenCalled();
  });

  it("keeps ONE capture session across the ready to live boundary", async () => {
    const { getByText, getByTestId } = renderWizard("pending");
    fireEvent.press(getByText("Confirm Weights"));
    getByTestId("camera-view");
    expect(mockCameraMounts.count).toBe(1);

    // The opponent's timer-started broadcast advances ready -> live. The
    // camera is owned by the wizard, not by a step, so crossing that
    // boundary does not tear the native capture session down and rebuild
    // it. A rebuilt session would put the whole start-delay budget back on
    // the match clock, which is the defect being fixed.
    await act(async () => {
      mockSyncParams.current?.onTimerStarted?.("2026-09-18T12:00:00.000Z");
    });

    getByText("End Match");
    expect(mockCameraMounts.count).toBe(1);
    // And the warm session records immediately, with no deferral.
    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));
  });
});

describe("record, end, upload, across the step boundary", () => {
  it("starts recording on the live step under the derived cap", async () => {
    renderWizard("in_progress");

    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));
    expect(mockCamera.recordAsync).toHaveBeenCalledWith({
      maxDuration: computeMaxRecordingSeconds(MATCH_DURATION),
    });
  });

  it("shows a FAILED upload after the live step is gone", async () => {
    // The database write fails the way production fails it: a RESOLVED
    // response carrying an error. Both the first attempt and the automatic
    // retry hit it.
    mockInsertSingle.mockResolvedValue(RLS_DENIAL);

    const { getByText, queryByText, getByTestId } = renderWizard("in_progress");
    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));

    // End the match. This stops the recorder and advances the step in the
    // same tick, so LiveStep unmounts before the upload even begins.
    await act(async () => {
      fireEvent.press(getByText("End Match"));
    });

    // LiveStep is gone: its controls are no longer in the tree.
    expect(queryByText("End Match")).toBeNull();

    // ... and the failure still reaches the user. This is the assertion the
    // old code could not satisfy at all: the only banner had unmounted.
    await waitFor(() => {
      expect(getByText(/saving the record failed/i)).toBeTruthy();
    });
    getByTestId("upload-status-banner");
    getByText(/row-level security/i);
    // The copy tells the user it is not over, because it is not: the job
    // is parked in phase "row" and the next foreground retries the write.
    getByText(/retry automatically/i);

    // THE BYTES WENT UP ONCE. The old path deleted the object on the first
    // DB failure and re-uploaded the whole file on the retry; now the row
    // is retried on its own budget and the object is left alone, because a
    // 600 MB re-upload is not a reasonable response to a transient write.
    expect(mockTusCalls).toHaveLength(1);
    expect(mockInsertSingle.mock.calls.length).toBeGreaterThan(1);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it("shows success after the live step is gone", async () => {
    const { getByText, queryByText, getByTestId } = renderWizard("in_progress");
    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.press(getByText("End Match"));
    });
    expect(queryByText("End Match")).toBeNull();

    await waitFor(() => expect(getByText(/match video uploaded/i)).toBeTruthy());
    getByTestId("upload-status-banner");
    expect(mockTusCalls).toHaveLength(1);
  });

  it("does not pretend to release the camera on unmount", async () => {
    // Navigating away mid-recording. `useVideoRecorder` used to read
    // `cameraRef.current` in its unmount cleanup and call `stopRecording()`
    // on it, logging "unmount cleanup stopping an active recording".
    //
    // That guard could never run: React detaches refs in the MUTATION
    // phase, so the ref is null before any passive cleanup. It only LOOKED
    // alive because this stub set the ref on mount and never nulled it.
    // With the stub honest, the guard is provably dead, so it is gone; what
    // releases the capture session is expo-camera's own native teardown
    // when CameraView unmounts.
    const { unmount } = renderWizard("in_progress");
    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));

    unmount();

    expect(mockCamera.stopRecording).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n"),
    ).not.toMatch(/unmount cleanup/i);
  });

  it("uploads to the path prod storage RLS requires", async () => {
    const { getByText } = renderWizard("in_progress");
    await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.press(getByText("End Match"));
    });
    await waitFor(() => expect(mockTusCalls).toHaveLength(1));

    // `<match_id>/<uploader_athlete_id>/<unix_ts>.mp4`: segment 1 must be
    // the match uuid and segment 2 the uploader's own athlete id, per
    // jr_be `20260610000000_match_videos_bucket.sql`. Under tus the key
    // travels as Upload-Metadata rather than in the URL, but the
    // convention is unchanged and the storage INSERT policy still keys on
    // `foldername[2] = auth_athlete_id()`.
    const metadata = mockTusCalls[0].options.metadata as Record<string, string>;
    expect(metadata.bucketName).toBe("match-videos");
    expect(metadata.objectName).toMatch(/^M1\/me-1\/\d+\.mp4$/);
    // And Supabase's mandated chunk size is what actually goes out.
    expect(mockTusCalls[0].options.chunkSize).toBe(6 * 1024 * 1024);
  });
});
