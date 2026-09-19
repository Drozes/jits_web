/**
 * The upload has to be VISIBLE (jits-od3).
 *
 * THE DEFECT: `UploadProgressBanner` was mounted inside `LiveStep`. Ending
 * a match calls `recorder.stop()` and `onEnded()` in the same tick, which
 * advances the step and unmounts `LiveStep`, and the upload only begins
 * once `recordAsync` settles, i.e. AFTER that unmount. So the upload ran
 * completely invisibly: no "uploading", no success, and, worst of all, no
 * failure. The recorder itself already survives the unmount on purpose
 * (`mountedRef` guards in the hook); what was missing was a surface that
 * outlives the step.
 *
 * These tests pin the replacement: the status surface is owned by the
 * WIZARD, so it renders on steps that exist only after `LiveStep` is gone.
 * They fail against the old code, where nothing on the summary step could
 * render recorder state at all.
 *
 * The record -> upload -> watch sequence itself, driven through a real
 * recorder and a production-shaped (resolved, not rejected) database
 * failure, is covered in `record-upload-sequence.test.tsx`.
 */
import * as React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import type { RecordingState, RecordingTruncation } from "@/lib/video/use-video-recorder";

// ---- the recorder under the wizard ----

interface FakeRecorder {
  state: RecordingState;
  error: string | null;
  videoId: string | null;
  truncation: RecordingTruncation | null;
}

let mockRecorderValue: FakeRecorder = {
  state: "idle",
  error: null,
  videoId: null,
  truncation: null,
};

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock("@/lib/video/use-video-recorder", () => ({
  useVideoRecorder: () => ({
    cameraRef: { current: null },
    state: mockRecorderValue.state,
    uploadProgress: null,
    error: mockRecorderValue.error,
    permission: { granted: true, canAskAgain: true },
    requestPermission: jest.fn(),
    start: mockStart,
    stop: mockStop,
    markCameraReady: jest.fn(),
    videoId: mockRecorderValue.videoId,
    truncation: mockRecorderValue.truncation,
    maxDurationSeconds: 1214,
  }),
}));

// ---- environment mocks (same shape as exit-navigation.test.tsx) ----

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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    textPrimary: "#E8EDF2",
    textSecondary: "#9AA3AD",
    statePositive: "#3FB950",
    stateNegative: "#F85149",
    accentCta: "#E5484D",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush, back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ athlete: { id: "me-1" } }),
}));

jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { size: () => 0, subscribe: () => () => {} },
}));

jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    EloTile: () => R.createElement(RN.View, { testID: "elo-tile" }),
    Plate: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.View, null, children),
  };
});

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));

jest.mock("@jits/shared/api/mutations", () => ({
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
}));

jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));

jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: () => ({
    broadcastTimerStarted: jest.fn(),
    broadcastReady: jest.fn(),
    broadcastMatchCancelled: jest.fn(),
    broadcastMatchEnded: jest.fn(),
    broadcastTimerPaused: jest.fn(),
    broadcastTimerResumed: jest.fn(),
  }),
}));

const mockUseMatchDetails = jest.fn();
jest.mock("@/lib/match-flow/use-match-details", () => ({
  useMatchDetails: (matchId: string) => mockUseMatchDetails(matchId),
}));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";

// ---- fixtures ----

const EXIT = "/(app)/arena";

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 80,
    outcome,
    elo_before: 1190,
    elo_after: 1200,
    elo_delta: 10,
    weight_division_gap: 0,
  };
}

/**
 * A match whose wizard mounts straight into the SUMMARY step: the step
 * that exists only long after LiveStep has unmounted, and where the old
 * code could render no recorder state whatsoever.
 */
function summaryMatch(status = "completed") {
  return {
    match: {
      id: "M1",
      status,
      match_type: "ranked",
      duration_seconds: 600,
      started_at: "2026-09-18T12:00:00.000Z",
      paused_at: null,
      total_paused_duration: 0,
      participants: [
        participant("me-1", "Me", "win"),
        participant("opp-1", "Opponent", "loss"),
      ],
    },
    submissionTypes: [],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  };
}

function renderSummary(recorder: Partial<FakeRecorder>, status = "completed") {
  mockRecorderValue = {
    state: "idle",
    error: null,
    videoId: null,
    truncation: null,
    ...recorder,
  };
  mockUseMatchDetails.mockReturnValue(summaryMatch(status));
  return render(
    <MatchFlowWizard
      exitHref={EXIT}
      exitLabel="Back to Arena"
      matchId="M1"
      currentAthleteId="me-1"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("upload status survives the step that started it", () => {
  it("shows an in-flight upload on the summary step", () => {
    const { getByTestId, getByText } = renderSummary({ state: "uploading" });

    getByTestId("upload-status-banner");
    getByText(/uploading match video/i);
  });

  it("shows the finishing-recording state on the summary step", () => {
    const { getByTestId, getByText } = renderSummary({ state: "stopping" });

    getByTestId("upload-status-banner");
    getByText(/finishing recording/i);
  });

  it("shows success on the summary step", () => {
    const { getByTestId, getByText } = renderSummary({
      state: "uploaded",
      videoId: "VID-1",
    });

    getByTestId("upload-status-banner");
    getByText(/match video uploaded/i);
  });

  it("shows a FAILED upload on the summary step, with the reason", () => {
    // The worst case of the defect: the user was never told the upload
    // failed, because the only surface that could say so had unmounted.
    const { getByTestId, getByText } = renderSummary({
      state: "error",
      error: "Upload failed: Video uploaded but saving the record failed: permission denied",
    });

    getByTestId("upload-status-banner");
    getByText(/upload failed/i);
    getByText(/permission denied/i);
  });

  it("does not congratulate the user on a truncated clip", () => {
    // A clip cut short by the OS cap uploads successfully, so state alone
    // reads as a plain success. It is not one (jits-2zpe).
    const { getByText, queryByText } = renderSummary({
      state: "uploaded",
      videoId: "VID-1",
      truncation: "limit",
    });

    getByText(/recording hit its time limit/i);
    expect(queryByText(/^match video uploaded$/i)).toBeNull();
  });

  it("says nothing at all when no recording was made", () => {
    const { queryByTestId } = renderSummary({ state: "idle" });
    expect(queryByTestId("upload-status-banner")).toBeNull();
  });

  it("keeps reporting the upload on a DISPUTED match's summary", () => {
    const { getByText } = renderSummary(
      { state: "error", error: "Upload failed: network died" },
      "disputed",
    );
    getByText(/upload failed/i);
  });
});

describe("watching the match back from the summary (jits-p75q)", () => {
  it("offers playback once the video has an id, and routes to the player", () => {
    const { getByText } = renderSummary({ state: "uploaded", videoId: "VID-1" });

    fireEvent.press(getByText("Watch Match Video"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/video/VID-1");
  });

  it("shows a pending affordance while the upload is still running", () => {
    // Never a link to an id that does not exist yet: that route would 404.
    const { getByText, queryByText } = renderSummary({ state: "uploading" });

    getByText(/video uploading/i);
    expect(queryByText("Watch Match Video")).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("offers playback on a DISPUTED match, which Past Match Videos cannot reach", () => {
    // The profile list filters on matches.status = 'completed', so this
    // summary is the only way to a disputed match's video.
    const { getByText } = renderSummary(
      { state: "uploaded", videoId: "VID-9" },
      "disputed",
    );

    fireEvent.press(getByText("Watch Match Video"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/video/VID-9");
  });

  it("offers nothing when there is no video and none is coming", () => {
    const { queryByText } = renderSummary({ state: "idle" });
    expect(queryByText("Watch Match Video")).toBeNull();
    expect(queryByText(/video uploading/i)).toBeNull();
  });
});

// Node's CommonJS globals exist under Jest but the mobile tsconfig carries
// no @types/node, so declare the one the source scan needs rather than
// widening the app's type surface.
declare const __dirname: string;

describe("no step owns the upload surface any more", () => {
  const fs = require("fs") as {
    readdirSync: (dir: string) => string[];
    statSync: (p: string) => { isDirectory: () => boolean };
    readFileSync: (p: string, enc: string) => string;
  };
  const path = require("path") as { join: (...parts: string[]) => string };

  const STEPS_DIR = path.join(__dirname, "../../../components/match-flow/steps");

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((name: string) => {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });
  }

  function strippedSource(file: string): string {
    return fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  /**
   * Guard the fix at the structural level, not just the rendered output.
   * A banner (or a recorder) put back inside a step is invisible again the
   * moment that step unmounts, and the render tests above would not
   * necessarily catch it, because a second banner still renders.
   */
  it("no step component mounts the upload banner or creates a recorder", () => {
    const files = sourceFiles(STEPS_DIR);
    // Guard the guard: if the tree moves, fail loudly rather than pass empty.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) => {
      const src = strippedSource(file);
      return /UploadProgressBanner|useVideoRecorder\s*\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
