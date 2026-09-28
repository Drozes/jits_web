/**
 * Full-screen highlight viewer (jits-s6mi.4, jr_be spec 015 section 16.6.2):
 * every state with its exact copy, the one-Signal-Red-CTA rule, share and
 * save completely absent with `highlight_share_enabled` off, the label by
 * share path, seen + telemetry once per version, Improve, Close, Save.
 * `useHighlightShare` is mocked (its own behaviour is F5's suite).
 */
import * as React from "react";
import { Linking } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ---- mocks ----

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
const mockFocus: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  // Records each focus callback and runs the first focus on mount, like the real hook.
  useFocusEffect: (cb: () => void) => {
    const R = require("react");
    R.useEffect(() => {
      mockFocus.push(cb);
      cb();
    }, [cb]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ bgSecondary: "#13151B", textPrimary: "#E8EDF2", textTertiary: "#8D929D" }),
}));
jest.mock("@/lib/theme/theme-provider", () => ({ darkVarsStyle: {} }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));

// Stateful gorhom stand-in (same as the phase-1 card suite).
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef(
    (props: { children: React.ReactNode; onChange?: (i: number) => void; testID?: string }, ref: unknown) => {
      const [shown, setShown] = R.useState(false);
      const onChange = R.useRef(props.onChange);
      onChange.current = props.onChange;
      R.useImperativeHandle(ref, () => ({
        present: () => setShown(true),
        dismiss: () => {
          setShown(false);
          onChange.current?.(-1);
        },
      }));
      return shown
        ? R.createElement(
            RN.View,
            { testID: "sheet" },
            props.children,
            R.createElement(RN.Pressable, {
              testID: "sheet-swipe-close",
              onPress: () => {
                setShown(false);
                onChange.current?.(-1);
              },
            }),
          )
        : null;
    },
  );
  return {
    BottomSheetModal,
    BottomSheetView: (p: { children: React.ReactNode }) => R.createElement(RN.View, {}, p.children),
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: (p: Record<string, unknown>) => R.createElement(RN.TextInput, p),
  };
});

let mockProgress: Record<string, unknown> | null = null;
let mockProgressError: Record<string, unknown> | null = null;
const mockRefresh = jest.fn();
jest.mock("@jits/shared/hooks/use-highlight-progress", () => ({
  useHighlightProgress: () => ({ data: mockProgress, loading: false, error: mockProgressError, refresh: mockRefresh }),
}));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/highlights", () => ({
  signHighlightPlayback: (...a: unknown[]) => mockSign(...a),
  submitHighlightFeedback: jest.fn(() => Promise.resolve({ ok: true, data: { feedbackId: "fb" } })),
  regenerateHighlight: jest.fn(),
  retryHighlightRender: jest.fn(),
}));

const mockGetDetail = jest.fn();
const mockMarkSeen = jest.fn(() => Promise.resolve({ ok: true, data: null }));
const mockLog = jest.fn(() => Promise.resolve());
jest.mock("@jits/shared/api/highlight-share", () => ({
  getHighlightDetail: (...a: unknown[]) => mockGetDetail(...a),
  markHighlightSeen: (...a: unknown[]) => mockMarkSeen(...(a as [])),
  logHighlightShareEvent: (...a: unknown[]) => mockLog(...(a as [])),
}));

type Share = Record<string, unknown>;
let mockShare: Share;
const mockUseShare = jest.fn((_p: unknown) => mockShare);
const mockSweep = jest.fn(() => Promise.resolve());
const mockTrack = jest.fn();
// The real copy and constants; only the hook, telemetry and the cache sweep are faked.
jest.mock("@/lib/highlight-share", () => ({
  ...jest.requireActual("@/lib/highlight-share"),
  useHighlightShare: (p: unknown) => mockUseShare(p),
  sweepShareCache: () => mockSweep(),
  track: (...a: unknown[]) => mockTrack(...a),
}));

import { ViewerScreen } from "@/components/highlight-viewer/viewer-screen";

// ---- fixtures ----

const CAPTION = {
  athleteName: "Ana",
  opponentName: "Bea",
  matchType: "ranked",
  outcome: "win",
  eloAfter: 1234,
  eloDelta: 12,
  technique: "Armbar",
  playedAt: "2026-09-27T10:00:00Z",
};

function detail(over: Record<string, unknown> = {}) {
  return {
    highlightId: "h1",
    matchVideoId: "v1",
    matchId: "m1",
    version: 2,
    clipsEnabled: true,
    shareEnabled: true,
    caption: CAPTION,
    ...over,
  };
}

function progress(phase: string, over: Record<string, unknown> = {}) {
  return {
    matchVideoId: "v1",
    athleteId: "me",
    enabled: true,
    phase,
    highlightId: "h1",
    status: "ready",
    planStatus: "planned",
    renderTotal: 2,
    renderMax: 10,
    rendersRemaining: 8,
    canRegenerate: true,
    lastAttemptFailed: false,
    playback: {
      storagePath: "m/u/highlights/2.mp4",
      posterPath: "m/u/highlights/2.jpg",
      durationS: 31.2,
      version: 2,
      segments: [],
      readyAt: "2026-09-27T10:00:00Z",
    },
    errorMessage: null,
    identityDisputed: false,
    identitySide: null,
    lastChangeSummary: null,
    updatedAt: null,
    ...over,
  };
}

function makeShare(over: Share = {}): Share {
  const primaryPath = "primaryPath" in over ? over.primaryPath : "reels";
  return {
    activePath: primaryPath,
    capabilities: { reels: true, shareSheet: true, saveToPhotos: true, clipboard: false, facebookAppIdConfigured: true },
    primaryPath: "reels",
    stage: "idle",
    progress: null,
    error: null,
    caption: "Got the Armbar against Bea.",
    collabTip: "Tag Bea as a collaborator: in Instagram tap Tag people, then Invite collaborator. One post shows on both profiles.",
    start: jest.fn(),
    handoff: jest.fn((path: string) => Promise.resolve({ ok: true, path, oversize: false })),
    saveToPhotos: jest.fn(() => Promise.resolve({ ok: true })),
    copyCaption: jest.fn(() => Promise.resolve(true)),
    reset: jest.fn(),
    ...over,
  };
}

type Utils = ReturnType<typeof render>;
type HostNode = Utils["root"];

function redCtas(utils: Utils, root?: HostNode) {
  return (root ?? utils.root).findAll(
    (n: HostNode) =>
      typeof n.type === "string" &&
      typeof n.props.className === "string" &&
      /(^|\s)bg-cta(\s|$)/.test(n.props.className) &&
      n.props.accessibilityRole === "button",
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderViewer(source: "push" | "bell" | "home" | "profile" | "match_detail" = "home") {
  const utils = render(<ViewerScreen id="h1" source={source} />);
  await flush();
  const frame = utils.queryByTestId("viewer-frame");
  if (frame) {
    fireEvent(frame, "layout", { nativeEvent: { layout: { width: 390, height: 700 } } });
  }
  await flush();
  return utils;
}

function stepsLogged(): string[] {
  return mockTrack.mock.calls.map((c: unknown[]) => c[1] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  mockProgress = progress("ready");
  mockProgressError = null;
  mockShare = makeShare();
  mockGetDetail.mockResolvedValue({ ok: true, data: detail() });
  mockSign.mockResolvedValue({
    ok: true,
    data: { url: "https://signed/v2.mp4", posterUrl: "https://signed/v2.jpg", version: 2, durationS: 31.2 },
  });
});

// ---- states ----

describe("viewer states", () => {
  it("loading: the empty poster frame, no actions, header + close", async () => {
    mockGetDetail.mockReturnValue(new Promise(() => undefined));
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-skeleton")).toBeTruthy();
    expect(utils.getByRole("header")).toHaveTextContent("Your highlight");
    expect(utils.getByLabelText("Close")).toBeTruthy();
    expect(utils.queryByTestId("viewer-share")).toBeNull();
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("not found: exact copy and Back (no red CTA)", async () => {
    mockGetDetail.mockResolvedValue({ ok: false, error: { code: "HIGHLIGHT_NOT_FOUND", message: "x" } });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-not-found")).toHaveTextContent("That highlight no longer exists.Back");
    fireEvent.press(utils.getByText("Back"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(redCtas(utils)).toHaveLength(0);
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("another error: fallback copy, Try again (the one red CTA) re-reads", async () => {
    mockGetDetail.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-error")).toHaveTextContent("Something went wrong. Try again.Try again");
    expect(utils.queryByText("boom")).toBeNull();
    expect(redCtas(utils)).toHaveLength(1);
    fireEvent.press(utils.getByTestId("viewer-retry"));
    await flush();
    expect(mockGetDetail).toHaveBeenCalledTimes(2);
  });

  it("no live version: the replaced copy, no share, never marked seen", async () => {
    mockGetDetail.mockResolvedValue({ ok: true, data: detail({ version: null }) });
    mockProgress = progress("invalidated", { playback: null });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-invalidated")).toHaveTextContent(
      "Your match video was replaced. A new reel will be made once it's analysed.",
    );
    expect(utils.queryByText("Share to Instagram")).toBeNull();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it.each([
    ["waiting_for_analysis", "viewer-making", "Your reel is being made. It will play here as soon as it's ready."],
    ["planning", "viewer-making", "Your reel is being made. It will play here as soon as it's ready."],
    ["rendering", "viewer-making", "Your reel is being made. It will play here as soon as it's ready."],
    ["failed", "viewer-failed", "We couldn't make your highlight reel."],
    ["none", "viewer-none", "We couldn't find a clear highlight of you in this video."],
  ])("no live version, %s: a calm state, no share, never marked seen", async (phase, testID, copy) => {
    mockGetDetail.mockResolvedValue({ ok: true, data: detail({ version: null }) });
    mockProgress = progress(phase, { playback: null });
    const utils = await renderViewer();
    expect(utils.getByTestId(testID)).toHaveTextContent(copy);
    expect(utils.queryByTestId("viewer-share")).toBeNull();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("follows progress: an invalidated / rendering reel swaps to the new live version in place", async () => {
    mockGetDetail.mockResolvedValue({ ok: true, data: detail({ version: null }) });
    mockProgress = progress("rendering", { playback: null });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-making")).toBeTruthy();
    expect(mockSign).not.toHaveBeenCalled();
    // Realtime / polling (the shared progress hook) reports the new live version.
    mockProgress = progress("ready", { renderTotal: 3, playback: { ...(progress("ready").playback as object), version: 3 } });
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    fireEvent(utils.getByTestId("viewer-frame"), "layout", { nativeEvent: { layout: { width: 390, height: 700 } } });
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(utils.queryByTestId("viewer-making")).toBeNull();
    expect(utils.getByTestId("viewer-meta")).toHaveTextContent("31s · Version 3");
    expect(mockMarkSeen).toHaveBeenCalledWith({}, "h1", 3);
    expect(utils.getByTestId("viewer-share")).toBeTruthy();
  });

  it("a regeneration landing while watching swaps the new version into the SAME player", async () => {
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    const view = utils.getByTestId("expo-video-view");
    const player = view.props.player;
    mockSign.mockResolvedValue({
      ok: true,
      data: { url: "https://signed/v3.mp4", posterUrl: "https://signed/v3.jpg", version: 3, durationS: 28 },
    });
    mockProgress = progress("ready", {
      renderTotal: 3,
      playback: { ...(progress("ready").playback as object), version: 3, storagePath: "m/u/highlights/3.mp4" },
    });
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    await flush();
    expect(utils.getByTestId("expo-video-view").props.player).toBe(player);
    expect(player.replaceAsync).toHaveBeenCalledWith("https://signed/v3.mp4");
  });

  it("re-reads progress when the viewer regains focus (not on the first focus)", async () => {
    mockFocus.length = 0;
    await renderViewer();
    const before = mockRefresh.mock.calls.length;
    act(() => mockFocus.forEach((cb) => cb()));
    expect(mockRefresh.mock.calls.length).toBeGreaterThan(before);
  });

  it("unavailable: a neutral no-highlight state, not the replaced copy", async () => {
    mockProgress = progress("unavailable", { playback: null, highlightId: null });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-unavailable")).toHaveTextContent("No highlight for this video.");
    expect(utils.queryByText(/was replaced/)).toBeNull();
    expect(utils.queryByTestId("viewer-share")).toBeNull();
  });

  it("the first progress read failed: can't-play + Try again (refresh), never an endless skeleton", async () => {
    mockProgress = null;
    mockProgressError = { code: "UNKNOWN", message: "network" };
    const utils = await renderViewer();
    expect(utils.queryByTestId("viewer-skeleton")).toBeNull();
    expect(utils.getByTestId("viewer-progress-error")).toHaveTextContent("We couldn't play this reel right now.Try again");
    expect(redCtas(utils)).toHaveLength(0);
    const before = mockRefresh.mock.calls.length;
    fireEvent.press(utils.getByTestId("viewer-progress-retry"));
    expect(mockRefresh.mock.calls.length).toBe(before + 1);
    expect(utils.queryByText("network")).toBeNull();
  });

  it("a progress error with a snapshot keeps playing the snapshot", async () => {
    mockProgressError = { code: "UNKNOWN", message: "network" };
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(utils.queryByTestId("viewer-progress-error")).toBeNull();
  });

  it("while the first read runs (no data, no error): the poster-frame skeleton", async () => {
    mockProgress = null;
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-skeleton")).toBeTruthy();
  });

  it("progress lost its playback (invalidated): the replaced copy", async () => {
    mockProgress = progress("invalidated", { playback: null });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-invalidated")).toBeTruthy();
    expect(utils.queryByTestId("viewer-share")).toBeNull();
  });

  it("clips paused while open (no playback): paused copy", async () => {
    mockProgress = progress("disabled", { playback: null });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-paused")).toHaveTextContent("Highlights are paused right now.");
  });

  it("clips off at open (detail.clipsEnabled false): paused, no playback, no share, never marked seen", async () => {
    mockGetDetail.mockResolvedValue({ ok: true, data: detail({ clipsEnabled: false }) });
    const utils = await renderViewer();
    expect(utils.getByTestId("viewer-paused")).toHaveTextContent("Highlights are paused right now.");
    expect(utils.queryByTestId("highlight-player")).toBeNull();
    expect(mockSign).not.toHaveBeenCalled();
    expect(utils.queryByTestId("viewer-share")).toBeNull();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("ready: plays the signed LIVE version, mono meta, Share / Save / Improve", async () => {
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(utils.getByLabelText("Your highlight reel, 31 seconds")).toBeTruthy();
    expect(utils.queryByTestId("highlight-fullscreen")).toBeNull();
    const meta = utils.getByTestId("viewer-meta");
    expect(meta).toHaveTextContent("31s · Version 2");
    // The viewer's player: fullscreen disabled (no button), inline controls off.
    const video = utils.getByTestId("expo-video-view");
    expect(video.props.fullscreenOptions).toEqual({ enable: false });
    expect(video.props.nativeControls).toBe(false);
    expect(meta.props.className).toContain("font-mono");
    expect(meta.props.style).toEqual({ fontVariant: ["tabular-nums"] });
    expect(utils.getByText("Share to Instagram")).toBeTruthy();
    expect(utils.getByText("Save to Photos")).toBeTruthy();
    expect(utils.getByText("Improve this reel")).toBeTruthy();
    expect(redCtas(utils)).toHaveLength(1);
    expect(redCtas(utils)[0].props.testID).toBe("viewer-share");
  });

  it("player error re-signs (phase-1 renewal), a second fresh error shows cannot-play + Try again", async () => {
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    const player = utils.getByTestId("expo-video-view").props.player;
    await act(async () => player.emitStatus({ status: "error" }));
    await flush();
    expect(mockSign).toHaveBeenCalledTimes(2);
    await act(async () => player.emitStatus({ status: "error" }));
    await flush();
    expect(utils.getByTestId("viewer-cannot-play")).toHaveTextContent("We couldn't play this reel right now.Try again");
    fireEvent.press(utils.getByTestId("viewer-play-retry"));
    await flush();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockSign).toHaveBeenCalledTimes(3);
  });

  it("regenerating: live version keeps playing, banner, Improve disabled", async () => {
    mockProgress = progress("regenerating", { renderTotal: 3, status: "pending" });
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(utils.getByTestId("viewer-regenerating")).toHaveTextContent(
      "Making version 3… You can keep watching this one.",
    );
    const mono = utils.getByTestId("viewer-regenerating").findAll(
      (n: HostNode) => typeof n.type === "string" && n.props.testID === "mono-number",
    );
    expect(mono.map((n: HostNode) => n.props.children)).toEqual(["3"]);
    expect(mono[0].props.style).toEqual({ fontVariant: ["tabular-nums"] });
    expect(utils.getByTestId("viewer-improve").props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(utils.getByTestId("viewer-meta")).toHaveTextContent("31s · Version 2");
  });
});

// ---- the share flag and the one red CTA ----

describe("share flag and primary CTA", () => {
  it("share_enabled false: no Share to Instagram, Share reel or Save to Photos, no red CTA", async () => {
    mockGetDetail.mockResolvedValue({ ok: true, data: detail({ shareEnabled: false }) });
    const utils = await renderViewer();
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(utils.queryByText("Share to Instagram")).toBeNull();
    expect(utils.queryByText("Share reel")).toBeNull();
    expect(utils.queryByText("Save to Photos")).toBeNull();
    expect(utils.getByText("Improve this reel")).toBeTruthy();
    expect(redCtas(utils)).toHaveLength(0);
    expect(mockUseShare).toHaveBeenCalledWith(expect.objectContaining({ shareEnabled: false }));
  });

  it("passes the exact hook params (id, flag, live duration, caption context, source)", async () => {
    await renderViewer("bell");
    await waitFor(() =>
      expect(mockUseShare).toHaveBeenLastCalledWith({
        highlightId: "h1",
        shareEnabled: true,
        durationS: 31.2,
        captionContext: CAPTION,
        source: "bell",
      }),
    );
  });

  it("label follows primaryPath: share_sheet -> Share reel", async () => {
    mockShare = makeShare({ primaryPath: "share_sheet" });
    const utils = await renderViewer();
    expect(utils.getByText("Share reel")).toBeTruthy();
    expect(utils.queryByText("Share to Instagram")).toBeNull();
    expect(redCtas(utils)).toHaveLength(1);
  });

  it("primaryPath null: Share absent (no red CTA), Save still offered", async () => {
    mockShare = makeShare({ primaryPath: null });
    const utils = await renderViewer();
    expect(utils.queryByTestId("viewer-share")).toBeNull();
    expect(utils.getByText("Save to Photos")).toBeTruthy();
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("Save absent when the build has no media-library module", async () => {
    mockShare = makeShare({ capabilities: { reels: false, shareSheet: true, saveToPhotos: false, clipboard: false, facebookAppIdConfigured: false }, primaryPath: "share_sheet" });
    const utils = await renderViewer();
    expect(utils.queryByText("Save to Photos")).toBeNull();
  });
});

// ---- seen + telemetry ----

describe("seen and telemetry", () => {
  it("marks seen and logs viewer_opened ONCE per version, sweeps the cache once", async () => {
    const utils = await renderViewer("home");
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith({}, "h1", 2);
    expect(mockTrack).toHaveBeenCalledWith("h1", "viewer_opened", expect.objectContaining({ source: "home" }));
    expect(stepsLogged().filter((s) => s === "viewer_opened")).toHaveLength(1);
    expect(stepsLogged()).not.toContain("notification_opened");
    expect(mockSweep).toHaveBeenCalledTimes(1);

    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);

    // A regeneration lands while watching: the new version is seen too.
    mockProgress = progress("ready", { renderTotal: 3, playback: { ...(progress("ready").playback as object), version: 3 } });
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen).toHaveBeenLastCalledWith({}, "h1", 3);
    expect(stepsLogged().filter((s) => s === "viewer_opened")).toHaveLength(2);
    expect(mockSweep).toHaveBeenCalledTimes(1);
  });

  it("source=push also logs notification_opened once", async () => {
    await renderViewer("push");
    expect(stepsLogged().filter((s) => s === "notification_opened")).toHaveLength(1);
    expect(mockTrack).toHaveBeenCalledWith("h1", "viewer_opened", expect.objectContaining({ source: "push" }));
  });
});

// ---- actions ----

describe("actions", () => {
  it("Improve this reel: logs improve_tapped and opens the phase-1 feedback sheet", async () => {
    const utils = await renderViewer("profile");
    fireEvent.press(utils.getByTestId("viewer-improve"));
    await flush();
    expect(mockTrack).toHaveBeenCalledWith("h1", "improve_tapped", expect.objectContaining({ source: "profile" }));
    expect(utils.getByText("Improve your reel")).toBeTruthy();
  });

  it("Close goes back when there is a back stack", async () => {
    const utils = await renderViewer();
    fireEvent.press(utils.getByLabelText("Close"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("Close with no back stack (cold-start push) lands on Home", async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const utils = await renderViewer("push");
    fireEvent.press(utils.getByLabelText("Close"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("Save to Photos: spinner + Saving… while running, then back with the success toast", async () => {
    let finish: (v: unknown) => void = () => undefined;
    mockShare = makeShare({ saveToPhotos: jest.fn(() => new Promise((r) => (finish = r))) });
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-save"));
    await flush();
    expect(mockShare.saveToPhotos).toHaveBeenCalledTimes(1);
    expect(utils.getByText("Saving…")).toBeTruthy();
    expect(utils.getByTestId("viewer-save-spinner")).toBeTruthy();
    fireEvent.press(utils.getByTestId("viewer-save"));
    expect(mockShare.saveToPhotos).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    await flush();
    expect(utils.getByText("Save to Photos")).toBeTruthy();
    expect(mockToast.success).toHaveBeenCalledWith("Saved to Photos");
  });

  it.each([
    ["failed", "We couldn't save your reel. Try again."],
    ["download", "We couldn't save your reel. Try again."],
    ["disabled", "Sharing is turned off right now."],
    ["not_ready", "This reel can't be shared right now. A new version may be on the way."],
  ])("save outcome %s: error toast", async (kind, copy) => {
    mockShare = makeShare({ saveToPhotos: jest.fn(() => Promise.resolve({ ok: false, kind })) });
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-save"));
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith(copy);
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(utils.queryByTestId("viewer-save-permission")).toBeNull();
  });

  it("save outcome unavailable: silent", async () => {
    mockShare = makeShare({ saveToPhotos: jest.fn(() => Promise.resolve({ ok: false, kind: "unavailable" })) });
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-save"));
    await flush();
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("save permission denied: inline Settings copy + Open Settings", async () => {
    const spy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    mockShare = makeShare({ saveToPhotos: jest.fn(() => Promise.resolve({ ok: false, kind: "permission" })) });
    const utils = await renderViewer();
    expect(utils.queryByTestId("viewer-save-permission")).toBeNull();
    fireEvent.press(utils.getByTestId("viewer-save"));
    await flush();
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(utils.getByTestId("viewer-save-permission")).toHaveTextContent(
      "Allow ELO RATED to add to Photos in Settings to save your reel.Open Settings",
    );
    fireEvent.press(utils.getByText("Open Settings"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(redCtas(utils)).toHaveLength(1);
  });
});

// ---- pre-share sheet ----

async function openSheet(utils: Utils) {
  fireEvent.press(utils.getByTestId("viewer-share"));
  await flush();
  return utils.getByTestId("sheet");
}

describe("pre-share sheet", () => {
  it("opening calls start() and leaves share_tapped to the hook (the viewer logs no share step)", async () => {
    const utils = await renderViewer("match_detail");
    await openSheet(utils);
    expect(mockShare.start).toHaveBeenCalledTimes(1);
    expect(utils.getByText("Share your highlight")).toBeTruthy();
    expect(stepsLogged()).toEqual(["viewer_opened"]);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("downloading: progress copy with a mono percent, CTA disabled, iOS Reels note instead of the caption", async () => {
    mockShare = makeShare({ stage: "downloading", progress: 0.42 });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByTestId("share-progress")).toHaveTextContent("Preparing your reel… 42%");
    const pct = utils.getByTestId("share-progress-pct");
    expect(pct.props.className).toContain("font-mono");
    expect(pct.props.style).toEqual({ fontVariant: ["tabular-nums"] });
    expect(utils.getByTestId("share-progress-bar").props.style).toEqual({ width: "42%" });
    expect(utils.getByTestId("share-ios-reels-note")).toHaveTextContent(
      "Instagram opens with your reel ready to post. If iOS asks, tap Allow Paste." +
        "Your caption can't travel with the video. Come back here after to copy it.",
    );
    expect(utils.queryByTestId("share-caption")).toBeNull();
    expect(utils.getByTestId("share-collab-tip")).toHaveTextContent(/Tag Bea as a collaborator/);
    const cta = utils.getByTestId("share-handoff");
    expect(cta).toHaveTextContent("Open Instagram");
    expect(cta.props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("ready (Reels): Open Instagram enabled and hands off on the reels path", async () => {
    mockShare = makeShare({ stage: "ready" });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.queryByTestId("share-progress")).toBeNull();
    fireEvent.press(utils.getByTestId("share-handoff"));
    expect(mockShare.handoff).toHaveBeenCalledWith("reels");
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("share-sheet path, no clipboard: caption + press-and-hold helper, CTA Share", async () => {
    mockShare = makeShare({ stage: "ready", primaryPath: "share_sheet" });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByText("Suggested caption")).toBeTruthy();
    expect(utils.getByTestId("share-caption-text").props.selectable).toBe(true);
    expect(utils.getByTestId("share-press-hold")).toHaveTextContent("Press and hold the caption to copy it.");
    expect(utils.queryByText("Copy caption")).toBeNull();
    fireEvent.press(utils.getByText("Share"));
    expect(mockShare.handoff).toHaveBeenCalledWith("share_sheet");
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("no clipboard: a long press on the caption calls copyCaption (press-and-hold), no toast", async () => {
    mockShare = makeShare({ stage: "ready", primaryPath: "share_sheet", copyCaption: jest.fn(() => Promise.resolve(false)) });
    const utils = await renderViewer();
    await openSheet(utils);
    fireEvent(utils.getByTestId("share-caption-text"), "longPress");
    await flush();
    expect(mockShare.copyCaption).toHaveBeenCalledTimes(1);
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("a Reels handoff that reports oversize shows the advisory info toast", async () => {
    mockShare = makeShare({
      stage: "ready",
      handoff: jest.fn(() => Promise.resolve({ ok: true, path: "reels", oversize: true })),
    });
    const utils = await renderViewer();
    await openSheet(utils);
    fireEvent.press(utils.getByTestId("share-handoff"));
    await flush();
    const { REELS_OVERSIZE_WARNING } = jest.requireActual("@/lib/highlight-share");
    expect(mockToast.info).toHaveBeenCalledWith(REELS_OVERSIZE_WARNING);
  });

  it("a handoff without oversize (or a failed one) shows no toast", async () => {
    mockShare = makeShare({ stage: "ready", handoff: jest.fn(() => Promise.resolve({ ok: false, error: null })) });
    const utils = await renderViewer();
    await openSheet(utils);
    fireEvent.press(utils.getByTestId("share-handoff"));
    await flush();
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("clipboard present: outline Copy caption toasts Caption copied", async () => {
    mockShare = makeShare({
      stage: "ready",
      primaryPath: "share_sheet",
      capabilities: { reels: false, shareSheet: true, saveToPhotos: true, clipboard: true, facebookAppIdConfigured: false },
    });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    fireEvent.press(utils.getByTestId("share-copy-caption"));
    await flush();
    expect(mockShare.copyCaption).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith("Caption copied");
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("rerouted to the share sheet (activePath) on iOS: caption shown, CTA Share, handoff on the share sheet", async () => {
    mockShare = makeShare({ stage: "ready", primaryPath: "reels", activePath: "share_sheet" });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.queryByTestId("share-ios-reels-note")).toBeNull();
    expect(utils.getByTestId("share-caption")).toBeTruthy();
    expect(utils.getByTestId("share-handoff")).toHaveTextContent("Share");
    fireEvent.press(utils.getByTestId("share-handoff"));
    expect(mockShare.handoff).toHaveBeenCalledWith("share_sheet");
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("the viewer's Share label follows the effective path too", async () => {
    mockShare = makeShare({ primaryPath: "reels", activePath: "share_sheet" });
    const utils = await renderViewer();
    expect(utils.getByText("Share reel")).toBeTruthy();
    expect(utils.queryByText("Share to Instagram")).toBeNull();
  });

  it("iOS Reels done (Instagram never came up): the caption is offered", async () => {
    mockShare = makeShare({ stage: "done" });
    const utils = await renderViewer();
    await openSheet(utils);
    expect(utils.queryByTestId("share-ios-reels-note")).toBeNull();
    expect(utils.getByTestId("share-caption")).toBeTruthy();
  });

  it("download progress is exposed to accessibility as a progress bar", async () => {
    mockShare = makeShare({ stage: "downloading", progress: 0.42 });
    const utils = await renderViewer();
    await openSheet(utils);
    const track = utils.getByTestId("share-progress-track");
    expect(track.props.accessibilityRole).toBe("progressbar");
    expect(track.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
    expect(track.props.accessibilityLabel).toBe("Preparing your reel… 42%");
  });

  it("handing_off: CTA disabled with a spinner", async () => {
    mockShare = makeShare({ stage: "handing_off" });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByTestId("share-handoff").props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(redCtas(utils, sheet)).toHaveLength(1);
  });

  it("returned (iOS Reels): title, body, red Copy caption, Open Instagram again, Done", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockShare = makeShare({
      stage: "returned",
      capabilities: { reels: true, shareSheet: true, saveToPhotos: true, clipboard: true, facebookAppIdConfigured: true },
    });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByText("Back from Instagram?")).toBeTruthy();
    expect(utils.getByText("Copy your caption, then switch back to Instagram and paste it.")).toBeTruthy();
    expect(redCtas(utils, sheet)).toHaveLength(1);
    expect(redCtas(utils, sheet)[0].props.testID).toBe("share-returned-copy");
    fireEvent.press(utils.getByTestId("share-returned-copy"));
    await flush();
    expect(mockToast.success).toHaveBeenCalledWith("Caption copied");
    fireEvent.press(utils.getByText("Open Instagram again"));
    expect(open).toHaveBeenCalledWith("instagram://");
    fireEvent.press(utils.getByText("Done"));
    await flush();
    expect(utils.queryByTestId("sheet")).toBeNull();
    expect(mockShare.reset).toHaveBeenCalledTimes(1);
  });

  it("returned without a clipboard module: press-and-hold helper, no red CTA", async () => {
    mockShare = makeShare({ stage: "returned" });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByTestId("share-press-hold")).toBeTruthy();
    expect(redCtas(utils, sheet)).toHaveLength(0);
  });

  it("failed (kill switch hit mid-flow): the disabled copy and no retry", async () => {
    mockShare = makeShare({
      stage: "failed",
      error: { kind: "disabled", code: "disabled", message: "Sharing is turned off right now.", canFallBack: false, retryable: false },
    });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByTestId("share-error")).toHaveTextContent("Sharing is turned off right now.");
    expect(redCtas(utils, sheet)).toHaveLength(0);
    expect(utils.queryByTestId("share-handoff")).toBeNull();
  });

  it("failed download: Try again restarts the flow", async () => {
    mockShare = makeShare({
      stage: "failed",
      error: { kind: "download", code: "download-failed", message: "We couldn't download your reel. Check your connection and try again.", canFallBack: false, retryable: true },
    });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(redCtas(utils, sheet)).toHaveLength(1);
    fireEvent.press(utils.getByTestId("share-retry"));
    expect(mockShare.start).toHaveBeenCalledTimes(2);
  });

  it("failed Reels handoff (retryable): Try again (reels) and Use the share sheet", async () => {
    mockShare = makeShare({ stage: "failed", error: { kind: "reels", code: "handoff-failed", message: "Instagram failed.", canFallBack: true, retryable: true } });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(redCtas(utils, sheet)).toHaveLength(1);
    fireEvent.press(utils.getByTestId("share-retry"));
    expect(mockShare.handoff).toHaveBeenLastCalledWith("reels");
    fireEvent.press(utils.getByText("Use the share sheet"));
    expect(mockShare.handoff).toHaveBeenLastCalledWith("share_sheet");
  });

  it("failed Reels handoff (not retryable, e.g. Instagram missing): only Use the share sheet, no red", async () => {
    mockShare = makeShare({ stage: "failed", error: { kind: "reels", code: "instagram-unavailable", message: "Instagram isn't installed.", canFallBack: true, retryable: false } });
    const utils = await renderViewer();
    const sheet = await openSheet(utils);
    expect(utils.getByTestId("share-error")).toHaveTextContent("Instagram isn't installed.");
    expect(utils.queryByTestId("share-retry")).toBeNull();
    expect(redCtas(utils, sheet)).toHaveLength(0);
    fireEvent.press(utils.getByText("Use the share sheet"));
    expect(mockShare.handoff).toHaveBeenLastCalledWith("share_sheet");
  });

  it("failed share sheet: Try again retries the share sheet", async () => {
    mockShare = makeShare({ stage: "failed", error: { kind: "share_sheet", code: "share-sheet-failed", message: "x", canFallBack: false, retryable: true } });
    const utils = await renderViewer();
    await openSheet(utils);
    expect(utils.queryByText("Use the share sheet")).toBeNull();
    fireEvent.press(utils.getByTestId("share-retry"));
    expect(mockShare.handoff).toHaveBeenLastCalledWith("share_sheet");
  });

  it("swiping the sheet away resets the flow; reopening starts again", async () => {
    const utils = await renderViewer();
    await openSheet(utils);
    fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    await flush();
    expect(mockShare.reset).toHaveBeenCalledTimes(1);
    await openSheet(utils);
    expect(mockShare.start).toHaveBeenCalledTimes(2);
  });
});


describe("the share flow follows the live version (minor 3)", () => {
  it("a new live version closes the open sheet and resets the flow; it does not reopen", async () => {
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-share"));
    await flush();
    expect(utils.getByTestId("sheet")).toBeTruthy();
    mockSign.mockResolvedValue({
      ok: true,
      data: { url: "https://signed/v3.mp4", posterUrl: "https://signed/v3.jpg", version: 3, durationS: 31.2 },
    });
    mockProgress = progress("ready", {
      renderTotal: 3,
      playback: { ...(progress("ready").playback as object), version: 3, storagePath: "m/u/highlights/3.mp4" },
    });
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(utils.queryByTestId("sheet")).toBeNull();
    expect(mockShare.reset).toHaveBeenCalled();
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(utils.queryByTestId("sheet")).toBeNull();
    // The next Share starts cleanly for the new version.
    fireEvent.press(utils.getByTestId("viewer-share"));
    await flush();
    expect(mockShare.start).toHaveBeenCalledTimes(2);
  });

  it("playback going away closes the sheet and resets; it does not pop back open when a version returns", async () => {
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-share"));
    await flush();
    expect(utils.getByTestId("sheet")).toBeTruthy();
    (mockShare.reset as jest.Mock).mockClear();
    mockProgress = progress("invalidated", { playback: null });
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(utils.getByTestId("viewer-invalidated")).toBeTruthy();
    expect(mockShare.reset).toHaveBeenCalledTimes(1);
    mockProgress = progress("ready");
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    fireEvent(utils.getByTestId("viewer-frame"), "layout", { nativeEvent: { layout: { width: 390, height: 700 } } });
    await flush();
    expect(utils.getByTestId("viewer-share")).toBeTruthy();
    expect(utils.queryByTestId("sheet")).toBeNull();
  });

  it("an unchanged version (a re-render or re-sign) leaves an open sheet alone", async () => {
    const utils = await renderViewer();
    fireEvent.press(utils.getByTestId("viewer-share"));
    await flush();
    (mockShare.reset as jest.Mock).mockClear();
    utils.rerender(<ViewerScreen id="h1" source="home" />);
    await flush();
    expect(utils.getByTestId("sheet")).toBeTruthy();
    expect(mockShare.reset).not.toHaveBeenCalled();
  });
});
