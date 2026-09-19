/**
 * The upload outcome has to survive the wizard REMOUNTING and the upload
 * FINISHING LATE (jits-od3).
 *
 * Both are real, and neither was covered before. The first fix hoisted the
 * recorder above the step boundary, which handles a step unmounting, and
 * stopped there. Two paths still destroyed the result:
 *
 *  1. REMOUNT, on every single match. The confirm step calls `refresh()`
 *     the moment the row flips to completed or disputed (see
 *     use-match-completion.ts, which fires on BOTH terminal statuses and
 *     also on a 1s timer if the row is already terminal when it mounts).
 *     `useMatchDetails` opens its effect with an unconditional
 *     `setIsLoading(true)`, and the wizard returned `<WizardLoading/>`
 *     above the provider. So the provider subtree was torn down and a
 *     fresh recorder was built, idle, with no videoId and no error, right
 *     as the user arrived at the summary. Not a race: unconditional.
 *
 *  2. LATE COMPLETION. The upload deliberately runs past unmount. If it
 *     lands after the instance that started it is gone, a result written
 *     to component state goes nowhere. apps/web loses its `videoId`
 *     exactly this way: the object is in storage and the UI never learns
 *     its id. Hoisting narrows that window; it does not close it.
 *
 * Keying the outcome on the matchId closes both, because nothing that
 * happens to the component tree can reach it.
 *
 * `useMatchDetails` is REAL here, not stubbed. The earlier tests stubbed
 * it with `refresh: jest.fn()` and a frozen `isLoading: false`, so the
 * loading branch was never re-entered and the defect was invisible to
 * them: the test and the bug shared a blind spot.
 */
import * as React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// ---- native module stubs ----

interface FakeCamera {
  recordAsync: jest.Mock;
  stopRecording: jest.Mock;
}

const mockCamera: FakeCamera = { recordAsync: jest.fn(), stopRecording: jest.fn() };

jest.mock("expo-camera", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    CameraView: R.forwardRef(
      (props: { onCameraReady?: () => void }, ref: React.Ref<unknown>) => {
        R.useEffect(() => {
          if (typeof ref === "function") ref(mockCamera);
          else if (ref && typeof ref === "object") {
            (ref as { current: unknown }).current = mockCamera;
          }
          props.onCameraReady?.();
        }, []);
        return R.createElement(RN.View, { testID: "camera-view" });
      },
    ),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    useMicrophonePermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

const mockUploadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
jest.mock("expo-file-system/legacy", () => ({
  uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
}));

// ---- Supabase client: resolved responses, plus a drivable realtime channel ----

/** Captured postgres_changes handler from useMatchCompletion. */
const mockRowChange: { handler: ((p: { new: { status?: string } }) => void) | null } = {
  handler: null,
};

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
    storage: {
      from: () => ({ remove: async () => ({ data: [{ name: "x" }], error: null }) }),
    },
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = (
        _event: string,
        _filter: unknown,
        handler: (p: { new: { status?: string } }) => void,
      ) => {
        mockRowChange.handler = handler;
        return chan;
      };
      chan.subscribe = () => chan;
      return chan;
    },
    removeChannel: async () => undefined,
  },
}));

jest.mock("@/lib/env", () => ({
  env: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon-key" },
}));

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

// ---- the data layer the REAL useMatchDetails calls ----

const mockGetMatchDetails = jest.fn();
const mockGetSubmissionTypes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getSubmissionTypes: (...a: unknown[]) => mockGetSubmissionTypes(...a),
}));

// The result step's RPC. Stubbed so a draw submits in two taps; the step,
// the confirm step, the wizard and useMatchDetails are all real.
jest.mock("@/lib/match-flow/use-record-result", () => ({
  useRecordResult: ({ onRecorded }: { onRecorded: (r: unknown) => void }) => ({
    loading: false,
    submit: () => onRecorded({ result: "draw", winnerId: null }),
  }),
}));

// ---- match-flow environment ----

jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => {} }));

jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => Promise.resolve(),
    timeWarning: () => Promise.resolve(),
  },
}));

jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: () => ({
    broadcastTimerStarted: jest.fn(),
    broadcastReady: jest.fn(),
    broadcastMatchCancelled: jest.fn(),
    broadcastMatchEnded: jest.fn(),
    broadcastTimerPaused: jest.fn(),
    broadcastTimerResumed: jest.fn(),
    broadcastResult: jest.fn(),
  }),
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

// `upsertMatchVideo` returns a Result and NEVER rejects, because
// supabase-js never rejects: `shouldThrowOnError` defaults false and an
// outer handler turns fetch errors into a resolved `{ data: null, error }`.
// So every failure below is a RESOLVED `{ ok: false, error }`, the only
// shape production can emit. The PostgREST-level version of the same path
// is covered against the real mutation in record-upload-sequence.test.tsx.
const mockUpsertMatchVideo = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  buildMatchVideoStoragePath: (matchId: string, uploader: string, ext = "mp4") =>
    `${matchId}/${uploader}/1700000000000.${ext}`,
  upsertMatchVideo: (...a: unknown[]) => mockUpsertMatchVideo(...a),
  confirmMatchResult: async () => ({ ok: true, data: {} }),
  recordMatchResult: async () => ({ ok: true, data: {} }),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
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
  mutationQueue: { size: () => 0, subscribe: () => () => {}, enqueue: jest.fn() },
  isQueuedResult: () => false,
}));

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

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { resetMatchUploadStore } from "@/lib/video/match-upload-store";

// ---- fixtures ----

function participant(id: string, name: string) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 80,
    outcome: id === "me-1" ? "draw" : "draw",
    elo_before: 1200,
    elo_after: 1200,
    elo_delta: 0,
    weight_division_gap: 0,
  };
}

function matchRow(status: string) {
  return {
    id: "M1",
    status,
    match_type: "casual",
    duration_seconds: 600,
    started_at: "2026-09-18T12:00:00.000Z",
    paused_at: null,
    total_paused_duration: 0,
    participants: [participant("me-1", "Me"), participant("opp-1", "Opponent")],
  };
}

function renderWizard() {
  return render(
    <MatchFlowWizard
      exitHref="/(app)/arena"
      exitLabel="Back to Arena"
      matchId="M1"
      currentAthleteId="me-1"
    />,
  );
}

let resolveRecord: ((v: { uri: string } | undefined) => void) | null = null;
let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetMatchUploadStore();
  mockRowChange.handler = null;
  resolveRecord = null;
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

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
  mockUploadAsync.mockResolvedValue({ status: 200, body: "" });
  mockUpsertMatchVideo.mockResolvedValue({ ok: true, data: { id: "VID-1" } });
  mockGetSubmissionTypes.mockResolvedValue([]);
  mockGetMatchDetails.mockResolvedValue(matchRow("in_progress"));
});

afterEach(() => {
  warnSpy.mockRestore();
  logSpy.mockRestore();
});

/** Walk live -> end -> result -> confirm through the real steps. */
async function advanceToConfirm(screen: ReturnType<typeof render>) {
  await waitFor(() => expect(mockCamera.recordAsync).toHaveBeenCalledTimes(1));

  await act(async () => {
    fireEvent.press(screen.getByText("End Match"));
  });

  // EndStep auto-advances to the result step after its confirmation beat.
  await waitFor(() => screen.getByText("Draw"), { timeout: 3000 });
  await act(async () => {
    fireEvent.press(screen.getByText("Draw"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("Record Result"));
  });
}

/**
 * The row flips terminal. This is the REAL trigger: useMatchCompletion's
 * postgres_changes subscription, which calls the wizard's
 * `{ refresh(); setStep("summary"); }`.
 */
async function completeMatch(status: "completed" | "disputed" = "completed") {
  mockGetMatchDetails.mockResolvedValue(matchRow(status));
  await act(async () => {
    mockRowChange.handler?.({ new: { status } });
  });
}

describe("the confirm-to-summary refresh cannot erase the upload", () => {
  it("still shows the failure on the summary after the row completes", async () => {
    // A production-shaped DB refusal: a RESOLVED response carrying an
    // error, which is the only shape supabase-js emits.
    mockUpsertMatchVideo.mockResolvedValue({
      ok: false,
      error: {
        message: 'new row violates row-level security policy for table "match_videos"',
      },
    });

    const screen = renderWizard();
    await advanceToConfirm(screen);
    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeTruthy());

    await completeMatch();

    // Summary step, and the failure is still on screen. Before the store,
    // refresh() rebuilt the recorder idle here and the chip vanished.
    await waitFor(() => expect(screen.getByText("Back to Arena")).toBeTruthy());
    screen.getByTestId("upload-status-banner");
    screen.getByText(/upload failed/i);
    screen.getByText(/row-level security/i);
  });

  it("still offers Watch Match Video on the summary after the row completes", async () => {
    const screen = renderWizard();
    await advanceToConfirm(screen);
    await waitFor(() => expect(screen.getByText(/match video uploaded/i)).toBeTruthy());

    await completeMatch();

    await waitFor(() => expect(screen.getByText("Back to Arena")).toBeTruthy());
    // videoId lived only on the recorder before, so the remount lost it and
    // the summary offered no playback for a video that exists in storage.
    screen.getByText("Watch Match Video");
    screen.getByText(/match video uploaded/i);
  });

  it("survives a DISPUTED completion too, which takes the same refresh path", async () => {
    const screen = renderWizard();
    await advanceToConfirm(screen);
    await waitFor(() => expect(screen.getByText(/match video uploaded/i)).toBeTruthy());

    await completeMatch("disputed");

    await waitFor(() => expect(screen.getByText("Back to Arena")).toBeTruthy());
    screen.getByText("Watch Match Video");
  });
});

/**
 * Hold every `upsertMatchVideo` call open until `release()` is called, then
 * settle them all with `value` (and settle later calls immediately).
 *
 * Every call, not just the first: the recorder retries a failed upload
 * once, so releasing only one attempt would leave the other pending
 * forever and the test would hang rather than assert anything.
 */
function holdUpsert(value: unknown): { release: () => void } {
  let released = false;
  const pending: Array<(v: unknown) => void> = [];
  mockUpsertMatchVideo.mockImplementation(() =>
    released
      ? Promise.resolve(value)
      : new Promise((res) => {
          pending.push(res as (v: unknown) => void);
        }),
  );
  return {
    release: () => {
      released = true;
      for (const res of pending) res(value);
    },
  };
}

describe("an upload that finishes LATE still reaches the summary", () => {
  it("delivers the videoId written after the recorder that started it is gone", async () => {
    // Hold the match_videos write open so the upload is genuinely still in
    // flight while the wizard advances and remounts. This is the case that
    // still defeats apps/web: the object lands in storage, the insert
    // succeeds, and the id is written to an instance nobody is reading.
    const held = holdUpsert({ ok: true, data: { id: "VID-LATE" } });

    const screen = renderWizard();
    await advanceToConfirm(screen);

    // Upload in flight, not finished.
    await waitFor(() => expect(screen.getByText(/uploading match video/i)).toBeTruthy());

    // The match completes and the wizard refreshes while it is still going.
    await completeMatch();
    await waitFor(() => expect(screen.getByText("Back to Arena")).toBeTruthy());
    screen.getByText(/uploading match video/i);
    // Pending, not a dead link: the id does not exist yet.
    screen.getByText(/video uploading/i);
    expect(screen.queryByText("Watch Match Video")).toBeNull();

    // NOW the upload lands, long after the recorder that started it.
    await act(async () => {
      held.release();
    });

    await waitFor(() => expect(screen.getByText(/match video uploaded/i)).toBeTruthy());
    screen.getByText("Watch Match Video");
  });

  it("delivers a late FAILURE the same way", async () => {
    const held = holdUpsert({ ok: false, error: { message: "permission denied" } });

    const screen = renderWizard();
    await advanceToConfirm(screen);
    await waitFor(() => expect(screen.getByText(/uploading match video/i)).toBeTruthy());

    await completeMatch();
    await waitFor(() => expect(screen.getByText("Back to Arena")).toBeTruthy());

    await act(async () => {
      held.release();
    });

    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeTruthy());
    screen.getByTestId("upload-status-banner");
  });
});
