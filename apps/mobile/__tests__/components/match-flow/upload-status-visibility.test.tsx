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
import { render, fireEvent, act } from "@testing-library/react-native";
import type { RecordingState, RecordingTruncation } from "@/lib/video/use-video-recorder";

// ---- the recorder under the wizard ----

/**
 * Only the TRANSIENT half of the recorder is stubbed here. The durable
 * half, the upload's outcome, is seeded into the REAL match-keyed store,
 * because that is what the wizard actually reads. Stubbing the outcome on
 * the recorder would exercise a path production no longer takes.
 */
interface FakeRecorder {
  state: RecordingState;
  error: string | null;
}

let mockRecorderValue: FakeRecorder = { state: "idle", error: null };

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
    releaseCamera: jest.fn(),
    videoId: null,
    truncation: null,
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
const mockRouterDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockRouterDismissTo, push: mockRouterPush, back: jest.fn() }),
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

// The wizard's reconciler reads both on mount; mock both so it never calls
// through to an unmocked export (which throws into its catch and warns).
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: jest.fn(),
  getMatchConfirmations: jest.fn(() => Promise.resolve([])),
}));

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
import {
  resetMatchUploadStore,
  setMatchUpload,
  type MatchUploadEntry,
} from "@/lib/video/match-upload-store";

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

type UploadSeed = Partial<Omit<MatchUploadEntry, "matchId" | "updatedAt">>;

function renderSummary(
  upload: UploadSeed | null,
  opts: { recorder?: Partial<FakeRecorder>; status?: string } = {},
) {
  mockRecorderValue = { state: "idle", error: null, ...opts.recorder };
  if (upload) setMatchUpload("M1", upload);
  mockUseMatchDetails.mockReturnValue(summaryMatch(opts.status ?? "completed"));
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
  // The store is module state by design, so it outlives a render. Reset it
  // between tests or one case's failure leaks into the next.
  resetMatchUploadStore();
});

describe("upload status survives the step that started it", () => {
  it("the reconciler's mount-time reads both hit mocks, never an unmocked export", async () => {
    const { getMatchConfirmations } = jest.requireMock("@jits/shared/api/queries") as {
      getMatchConfirmations: jest.Mock;
    };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    renderSummary(null);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getMatchConfirmations).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(warn).not.toHaveBeenCalledWith("[match-flow] reconcile failed", expect.anything());
    warn.mockRestore();
  });

  it("shows an in-flight upload on the summary step", () => {
    const { getByTestId, getByText } = renderSummary({ status: "uploading" });

    getByTestId("upload-status-banner");
    getByText(/uploading match video/i);
  });

  it("shows the finishing-recording state on the summary step", () => {
    const { getByTestId, getByText } = renderSummary(null, {
      recorder: { state: "stopping" },
    });

    getByTestId("upload-status-banner");
    getByText(/finishing recording/i);
  });

  it("shows success on the summary step", () => {
    const { getByTestId, getByText } = renderSummary({
      status: "uploaded",
      videoId: "VID-1",
    });

    getByTestId("upload-status-banner");
    getByText(/match video uploaded/i);
  });

  it("shows a FAILED upload on the summary step, with the reason", () => {
    // The worst case of the defect: the user was never told the upload
    // failed, because the only surface that could say so had unmounted.
    const { getByTestId, getByText } = renderSummary({
      status: "error",
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
      status: "uploaded",
      videoId: "VID-1",
      truncation: "limit",
    });

    getByText(/recording hit its time limit/i);
    expect(queryByText(/^match video uploaded$/i)).toBeNull();
  });

  it("says nothing at all when no recording was made", () => {
    const { queryByTestId } = renderSummary(null);
    expect(queryByTestId("upload-status-banner")).toBeNull();
  });

  it("keeps reporting the upload on a DISPUTED match's summary", () => {
    const { getByText } = renderSummary(
      { status: "error", error: "Upload failed: network died" },
      { status: "disputed" },
    );
    getByText(/upload failed/i);
  });
});

describe("watching the match back from the summary (jits-p75q)", () => {
  it("offers playback once the video has an id, and routes to the player", () => {
    const { getByText } = renderSummary({ status: "uploaded", videoId: "VID-1" });

    fireEvent.press(getByText("Watch Match Video"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/video/VID-1");
  });

  it("shows a pending affordance while the upload is still running", () => {
    // Never a link to an id that does not exist yet: that route would 404.
    const { getByText, queryByText } = renderSummary({ status: "uploading" });

    getByText(/video uploading/i);
    expect(queryByText("Watch Match Video")).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("offers playback on a DISPUTED match, which Past Match Videos cannot reach", () => {
    // The profile list filters on matches.status = 'completed', so this
    // summary is the only way to a disputed match's video.
    const { getByText } = renderSummary(
      { status: "uploaded", videoId: "VID-9" },
      { status: "disputed" },
    );

    fireEvent.press(getByText("Watch Match Video"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/video/VID-9");
  });

  it("offers no playback when there is no video and none is coming", () => {
    const { queryByText } = renderSummary(null);
    expect(queryByText("Watch Match Video")).toBeNull();
    expect(queryByText(/video uploading/i)).toBeNull();
  });

  it("links a reopened match with no video id to the match detail screen", () => {
    // Reopening a completed match starts with an empty upload store, so the
    // detail screen (which reads every video from the server) is the way in.
    const { getByText } = renderSummary(null);

    fireEvent.press(getByText("View match details"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/match-detail/M1");
  });

  it("links a reopened DISPUTED match to the match detail screen too", () => {
    const { getByText } = renderSummary(null, { status: "disputed" });

    fireEvent.press(getByText("View match details"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/match-detail/M1");
  });

  it("still shows the details link while a video is available or uploading", () => {
    // Watch plays only this device's clip; the detail screen lists both
    // athletes' recordings, so the link is always offered below it.
    const withVideo = renderSummary({ status: "uploaded", videoId: "VID-1" });
    withVideo.getByText("Watch Match Video");
    fireEvent.press(withVideo.getByText("View match details"));
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/match-detail/M1");
    resetMatchUploadStore();
    const uploading = renderSummary({ status: "uploading" });
    uploading.getByText(/video uploading/i);
    uploading.getByText("View match details");
  });
});

// Node's CommonJS globals exist under Jest but the mobile tsconfig carries
// no @types/node, so declare the one the source scan needs rather than
// widening the app's type surface.
declare const __dirname: string;

/**
 * Guard the fix STRUCTURALLY, not only through rendered output. A banner
 * or a recorder put back inside a component that unmounts is invisible
 * again, and the render tests above would not necessarily catch it,
 * because a second banner still renders somewhere.
 *
 * The first version of this guard was defeated three ways, all of them
 * ordinary things to do rather than deliberate evasion:
 *
 *   1. aliasing the hook, `const useRec = useVideoRecorder`, slipped past
 *      a pattern that required a call, `useVideoRecorder\s*\(`;
 *   2. re-exporting the banner under another name hid the import;
 *   3. only `steps/` was scanned, so a new panel dropped next to
 *      camera-overlay.tsx, queue-status-banner.tsx and wizard-status.tsx,
 *      which already live directly in `components/match-flow/`, was
 *      invisible to it.
 *
 * The predicates below are pure so each defeat can be mutation-tested
 * against synthetic sources, rather than trusted to be caught.
 */
describe("recorder ownership is structural, not by convention", () => {
  const fs = require("fs") as {
    readdirSync: (dir: string) => string[];
    statSync: (p: string) => { isDirectory: () => boolean };
    readFileSync: (p: string, enc: string) => string;
  };
  const path = require("path") as {
    join: (...parts: string[]) => string;
    relative: (from: string, to: string) => string;
  };

  // The WHOLE match-flow tree, not just steps/.
  const MATCH_FLOW_DIR = path.join(__dirname, "../../../components/match-flow");
  // ... and the whole components tree for the launder scan, because a
  // launderer does not have to live next to what it launders (defeat 4).
  const COMPONENTS_DIR = path.join(__dirname, "../../../components");
  const VIDEO_LIB_DIR = path.join(__dirname, "../../../lib/video");

  /**
   * The only files allowed to name the recorder or the banner. Anything
   * else in the tree referencing them is a component taking ownership of
   * state that must outlive it. Adding to this list is a visible,
   * reviewable act, which is the point.
   */
  const OWNERS = [
    "match-recorder-context.tsx",
    "match-recorder-surface.tsx",
    "match-flow-wizard.tsx",
    "upload-progress-banner.tsx",
  ];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir).flatMap((name: string) => {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });
  }

  function strippedSource(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  /**
   * Does this source take ownership of the recorder or the status banner?
   * Matches the BARE IDENTIFIER, not a call, so an alias is still caught:
   * an alias has to name the thing it aliases.
   */
  function claimsRecorderOwnership(src: string): boolean {
    const s = strippedSource(src);
    return /\buseVideoRecorder\b/.test(s) || /\bUploadProgressBanner\b/.test(s);
  }

  /**
   * Does this source launder one of them out under another name? This is
   * what catches the re-export defeats: the importing step looks innocent,
   * so the guard has to fail the file doing the laundering.
   *
   * Three spellings, because each of the last two was a live hole:
   *   export { UploadProgressBanner as StatusChip }   named re-export
   *   export * from "./use-video-recorder"           barrel re-export
   *   export default UploadProgressBanner            default re-export
   *
   * The default form mattered most: it works from inside an ALLOWLISTED
   * owner file, which by definition is allowed to name the identifier, and
   * a step importing a default binds it to whatever name it likes.
   */
  function laundersExport(src: string): boolean {
    const s = strippedSource(src);
    return (
      /export\s*\{[^}]*\b(?:UploadProgressBanner|useVideoRecorder)\b[^}]*\}/.test(s) ||
      /export\s*\*\s*from\s*["'][^"']*(?:use-video-recorder|upload-progress-banner)["']/.test(s) ||
      /export\s+default\s+(?:function\s+|class\s+)?(?:UploadProgressBanner|useVideoRecorder)\b/.test(s)
    );
  }

  it("scans the whole match-flow tree, not just steps/", () => {
    const files = sourceFiles(MATCH_FLOW_DIR).map((f) => path.relative(MATCH_FLOW_DIR, f));
    // Guard the guard: fail loudly if the tree moves, never pass empty.
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain("steps/live-step.tsx");
    // Defeat 3: components that live directly in match-flow/, which the
    // steps-only scan could never see.
    expect(files).toContain("camera-overlay.tsx");
    expect(files).toContain("queue-status-banner.tsx");
  });

  it("only the four owning files name the recorder or the banner", () => {
    const offenders = sourceFiles(MATCH_FLOW_DIR)
      .filter((file) => claimsRecorderOwnership(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(MATCH_FLOW_DIR, file))
      .filter((rel) => !OWNERS.includes(rel));
    expect(offenders).toEqual([]);
  });

  it("every owner on the allowlist actually exists", () => {
    // A rename that orphans an allowlist entry silently widens the guard.
    const present = sourceFiles(MATCH_FLOW_DIR).map((f) => path.relative(MATCH_FLOW_DIR, f));
    for (const owner of OWNERS) expect(present).toContain(owner);
  });

  it("nothing ANYWHERE under components/ re-exports them under another name", () => {
    // Deliberately not limited to match-flow/ and not exempting the owner
    // allowlist: a launderer can sit anywhere the consuming step can
    // import from, and an owner is exactly the file best placed to launder.
    const files = [...sourceFiles(COMPONENTS_DIR), ...sourceFiles(VIDEO_LIB_DIR)];
    expect(files.length).toBeGreaterThan(20);
    const offenders = files
      .filter((file) => laundersExport(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(COMPONENTS_DIR, file));
    expect(offenders).toEqual([]);
  });

  // ---- mutation tests: each defeat, fed to the predicate as source ----

  it("catches DEFEAT 1, aliasing the hook instead of calling it", () => {
    const aliased = `
      import { useVideoRecorder } from "@/lib/video/use-video-recorder";
      const useRec = useVideoRecorder;
      export function LiveStep() { const r = useRec("M", "A"); return null; }
    `;
    expect(claimsRecorderOwnership(aliased)).toBe(true);
    // And the old pattern, for the record, did not.
    expect(/useVideoRecorder\s*\(/.test(strippedSource(aliased))).toBe(false);
  });

  it("catches DEFEAT 2, re-exporting the banner under another name", () => {
    const launderer = `
      import { UploadProgressBanner } from "./upload-progress-banner";
      export { UploadProgressBanner as StatusChip };
    `;
    expect(laundersExport(launderer)).toBe(true);
    expect(laundersExport(`export * from "./use-video-recorder";`)).toBe(true);
    // A step importing the laundered alias looks innocent on its own,
    // which is exactly why the laundering file is what gets failed.
    expect(claimsRecorderOwnership(`import { StatusChip } from "../chip";`)).toBe(false);
  });

  it("catches DEFEAT 4, a launderer outside the match-flow tree", () => {
    // components/video/chip.tsx re-exporting both under new names, consumed
    // by a step whose own source names neither. The step is invisible to
    // the ownership scan by construction, so the launder scan has to reach
    // outside match-flow/ to see the file doing it. That is why it runs
    // over the whole components tree.
    const outsider = `
      export { UploadProgressBanner as StatusChip } from "../match-flow/upload-progress-banner";
      export { useVideoRecorder as useRec } from "@/lib/video/use-video-recorder";
    `;
    expect(laundersExport(outsider)).toBe(true);

    const consumer = `
      import { StatusChip, useRec } from "@/components/video/chip";
      export function LiveStep() { const r = useRec("M", "A"); return <StatusChip />; }
    `;
    // Confirming WHY the scan has to be wide: the consumer itself is clean.
    expect(claimsRecorderOwnership(consumer)).toBe(false);

    // And the scan really does reach outside match-flow/.
    const scanned = sourceFiles(COMPONENTS_DIR).map((f) => path.relative(COMPONENTS_DIR, f));
    expect(scanned.some((f: string) => !f.startsWith("match-flow/"))).toBe(true);
  });

  it("catches DEFEAT 5, a default export added to an ALLOWLISTED owner", () => {
    // The owner is allowed to name the identifier, so the ownership scan
    // cannot help, and a default import in a step binds any name it likes.
    expect(laundersExport(`export default UploadProgressBanner;`)).toBe(true);
    expect(laundersExport(`export default function UploadProgressBanner() {}`)).toBe(true);
    expect(laundersExport(`export default useVideoRecorder;`)).toBe(true);
    // `as default` inside braces was already covered by the named form.
    expect(laundersExport(`export { UploadProgressBanner as default };`)).toBe(true);
    // The legitimate definition is NOT a default re-export.
    expect(laundersExport(`export function UploadProgressBanner() {}`)).toBe(false);
    expect(laundersExport(`export default function MatchRecorderStatus() {}`)).toBe(false);
  });

  /**
   * KNOWN RESIDUAL, written down rather than chased.
   *
   * A source scan cannot see through a WRAPPER. A file that renders the
   * banner inside a component of its own, and exports that component under
   * a new name, is caught only because the wrapper's source still names
   * `UploadProgressBanner`, and only where the ownership scan reaches
   * (components/match-flow). A wrapper placed elsewhere under components/
   * is caught by neither scan today: it is not a re-export, so
   * `laundersExport` does not match, and it is outside the ownership scan.
   *
   * Closing that would mean widening the ownership allowlist over the whole
   * components tree, which buys little: a wrapper is a deliberate act with
   * a component boundary in it, not the accidental shape these guards
   * exist to catch, and the render-level tests above already fail if the
   * chip stops appearing on the summary. Noted so the limit is a choice.
   */
  it("does not fire on prose that merely mentions them", () => {
    // Comments are stripped, so the house docblock style that names the
    // component a file was ported from is not a false positive.
    expect(
      claimsRecorderOwnership(`
        /** Mirrors UploadProgressBanner; see useVideoRecorder for the states. */
        export function TimerDisplay() { return null; }
      `),
    ).toBe(false);
    expect(
      claimsRecorderOwnership(`// uses useVideoRecorder indirectly\nexport const x = 1;`),
    ).toBe(false);
  });
});
