/**
 * "Your highlight" card (jits-s6mi.10, jr_be spec 014 section 10): every
 * phase with its exact copy, one Signal Red CTA per surface, the player
 * surviving a regenerate, thumbs, the feedback sheet and its payloads.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// ---- mocks ----

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: jest.fn(), useRouter: () => ({ push: mockRouterPush }) }));

const mockMarkSeen = jest.fn(() => Promise.resolve({ ok: true, data: null }));
jest.mock("@jits/shared/api/highlight-share", () => ({
  markHighlightSeen: (...a: unknown[]) => mockMarkSeen(...(a as [])),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: unknown, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "dark",
  useThemedTokens: () => ({
    bgSecondary: "#13151B",
    textPrimary: "#E8EDF2",
    textTertiary: "#8D929D",
    textOnAccent: "#FFFFFF",
  }),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));

let mockSheetProps: Record<string, unknown> = {};
// A stateful gorhom stand-in: children render only while presented, and
// dismiss() reports index -1 like the real modal once it has closed.
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef(
    (props: { children: React.ReactNode; onChange?: (i: number) => void }, ref: unknown) => {
      mockSheetProps = props as Record<string, unknown>;
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
    BottomSheetBackdrop: (p: Record<string, unknown>) => R.createElement(RN.View, { testID: "backdrop", ...p }),
    BottomSheetTextInput: (p: Record<string, unknown>) => R.createElement(RN.TextInput, p),
  };
});

let mockProgress: Record<string, unknown> | null = null;
const mockRefresh = jest.fn();
jest.mock("@jits/shared/hooks/use-highlight-progress", () => ({
  useHighlightProgress: () => ({ data: mockProgress, loading: false, error: null, refresh: mockRefresh }),
}));

const mockSign = jest.fn();
const mockSubmit = jest.fn();
const mockRegenerate = jest.fn();
const mockRetry = jest.fn();
jest.mock("@jits/shared/api/highlights", () => ({
  signHighlightPlayback: (...a: unknown[]) => mockSign(...a),
  submitHighlightFeedback: (...a: unknown[]) => mockSubmit(...a),
  regenerateHighlight: (...a: unknown[]) => mockRegenerate(...a),
  retryHighlightRender: (...a: unknown[]) => mockRetry(...a),
}));

import { HighlightCard } from "@/components/match-detail/highlight/highlight-card";
import { HIGHLIGHT_ERROR_FALLBACK } from "@/lib/highlight/highlight-copy";

// ---- fixtures ----

const PLAYBACK = {
  storagePath: "m/u/highlights/1.mp4",
  posterPath: "m/u/highlights/1.jpg",
  durationS: 31.2,
  version: 1,
  segments: [],
  readyAt: "2026-09-27T10:00:00Z",
};

function progress(phase: string, over: Record<string, unknown> = {}) {
  return {
    matchVideoId: "v1",
    athleteId: "me",
    enabled: true,
    phase,
    highlightId: "h1",
    status: "ready",
    planStatus: "planned",
    renderTotal: 1,
    renderMax: 10,
    rendersRemaining: 9,
    canRegenerate: true,
    lastAttemptFailed: false,
    playback: PLAYBACK,
    errorMessage: null,
    identityDisputed: false,
    identitySide: null,
    lastChangeSummary: null,
    updatedAt: null,
    ...over,
  };
}

async function renderCard(p: Record<string, unknown> | null) {
  mockProgress = p;
  const utils = render(<HighlightCard matchVideoId="v1" angleLabel={null} />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

/** Pressables styled as the Signal Red fill. */
type HostNode = ReturnType<typeof render>["root"];

function redCtas(utils: ReturnType<typeof render>, root?: HostNode) {
  const scope = root ?? utils.root;
  return scope.findAll(
    (n: HostNode) =>
      typeof n.type === "string" &&
      typeof n.props.className === "string" &&
      /(^|\s)bg-cta(\s|$)/.test(n.props.className) &&
      n.props.accessibilityRole === "button",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProgress = null;
  mockSign.mockResolvedValue({
    ok: true,
    data: { url: "https://signed/v1.mp4", posterUrl: "https://signed/v1.jpg", version: 1, durationS: 31.2 },
  });
  mockSubmit.mockResolvedValue({ ok: true, data: { feedbackId: "fb" } });
  mockRegenerate.mockResolvedValue({
    ok: true,
    data: { feedbackId: "fb", highlightId: "h1", renderTotal: 2, rendersRemaining: 8, changeSummary: null },
  });
  mockRetry.mockResolvedValue({ ok: true, data: { highlightId: "h1" } });
});

// ---- phases ----

describe("HighlightCard phases", () => {
  it("renders nothing before progress loads", async () => {
    const utils = await renderCard(null);
    expect(utils.toJSON()).toBeNull();
  });

  it.each(["disabled", "unavailable"])("renders nothing for %s", async (phase) => {
    const utils = await renderCard(progress(phase, { playback: null }));
    expect(utils.toJSON()).toBeNull();
  });

  it("waiting_for_analysis: muted one-liner", async () => {
    const utils = await renderCard(progress("waiting_for_analysis", { playback: null, highlightId: null }));
    expect(utils.getByText("Your highlight")).toBeTruthy();
    expect(utils.getByTestId("highlight-waiting")).toHaveTextContent(
      "Your highlight reel will be made after your match video is analysed.",
    );
    expect(redCtas(utils)).toHaveLength(0);
  });

  it.each([
    ["planning", 1],
    ["rendering", 2],
  ])("%s: GENERATING chip, step %i active, ETA copy", async (phase, step) => {
    const utils = await renderCard(progress(phase, { playback: null }));
    expect(utils.getByText("GENERATING")).toBeTruthy();
    expect(utils.getByText("Finding your best moments")).toBeTruthy();
    expect(utils.getByText("Cutting your reel")).toBeTruthy();
    expect(utils.getByText("Usually 1 to 3 minutes. You can leave this screen.")).toBeTruthy();
    expect(utils.getByTestId(`highlight-step-${step}`).props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId(`highlight-step-${3 - step}`).props.accessibilityState).toEqual({ selected: false });
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("ready: player with poster, mono meta, feedback row, no red CTA", async () => {
    const utils = await renderCard(progress("ready"));
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("highlight-poster").props.source.uri).toBe("https://signed/v1.jpg");
    expect(utils.getByLabelText("Your highlight reel, 31 seconds")).toBeTruthy();
    const meta = utils.getByTestId("highlight-meta");
    expect(meta).toHaveTextContent("31s · Version 1");
    expect(meta.props.className).toContain("font-mono");
    expect(meta.props.style).toEqual({ fontVariant: ["tabular-nums"] });
    expect(utils.getByLabelText("Good reel")).toBeTruthy();
    expect(utils.getByLabelText("Bad reel")).toBeTruthy();
    expect(utils.getByText("Improve this reel")).toBeTruthy();
    expect(utils.queryByTestId("highlight-change-summary")).toBeNull();
    expect(utils.queryByTestId("highlight-last-attempt-failed")).toBeNull();
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("ready: shows what changed and the failed-attempt note", async () => {
    const utils = await renderCard(
      progress("ready", { lastChangeSummary: "Built from your moments.", lastAttemptFailed: true }),
    );
    expect(utils.getByTestId("highlight-change-summary")).toHaveTextContent(
      "What changed: Built from your moments.",
    );
    expect(utils.getByTestId("highlight-last-attempt-failed")).toHaveTextContent(
      "We couldn't make the new version. Your previous reel is still here.",
    );
  });

  it("regenerating: keeps the SAME player mounted, banner, Improve disabled", async () => {
    mockProgress = progress("ready");
    const utils = render(<HighlightCard matchVideoId="v1" angleLabel={null} />);
    await waitFor(() => expect(utils.getByTestId("highlight-player")).toBeTruthy());
    const videoBefore = utils.getByTestId("expo-video-view");

    mockProgress = progress("regenerating", { status: "pending", renderTotal: 2, canRegenerate: false });
    utils.rerender(<HighlightCard matchVideoId="v1" angleLabel={null} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(utils.getByTestId("expo-video-view")).toBe(videoBefore);
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId("highlight-regenerating")).toHaveTextContent(
      "Making version 2… You can keep watching this one.",
    );
    expect(utils.getByTestId("highlight-improve").props.accessibilityState).toEqual({ disabled: true });
  });

  it("failed with renders left: reason, ONE red Try again that retries", async () => {
    const utils = await renderCard(
      progress("failed", { status: "failed", playback: null, errorMessage: "The render timed out." }),
    );
    expect(utils.getByText("We couldn't make your highlight reel.")).toBeTruthy();
    expect(utils.getByTestId("highlight-error-reason")).toHaveTextContent("The render timed out.");
    expect(redCtas(utils)).toHaveLength(1);
    await act(async () => {
      fireEvent.press(utils.getByText("Try again"));
    });
    expect(mockRetry).toHaveBeenCalledWith({}, "h1");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("failed with a NULL reason renders no reason at all", async () => {
    const utils = await renderCard(progress("failed", { status: "failed", playback: null }));
    expect(utils.queryByTestId("highlight-error-reason")).toBeNull();
    expect(utils.queryByText("null")).toBeNull();
  });

  it("failed with no highlight row (plan failed): no-highlights copy and no action", async () => {
    const utils = await renderCard(
      progress("failed", { status: null, highlightId: null, playback: null, planStatus: "failed", errorMessage: "planner timeout" }),
    );
    expect(utils.getByTestId("highlight-plan-failed")).toHaveTextContent(
      "We couldn't find highlights in this video.",
    );
    expect(utils.queryByText("No retries left for this reel.")).toBeNull();
    expect(utils.queryByText("Try again")).toBeNull();
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("ready but the live render cannot be signed: cannot-play note, no dead player", async () => {
    mockSign.mockResolvedValue({ ok: false, error: { code: "VIDEO_FILE_MISSING", message: "x" } });
    const utils = await renderCard(progress("ready"));
    await waitFor(() => expect(utils.getByTestId("highlight-cannot-play")).toBeTruthy());
    expect(utils.getByTestId("highlight-cannot-play")).toHaveTextContent(
      "We couldn't play this reel right now. Pull down to refresh.",
    );
    expect(utils.queryByTestId("expo-video-view")).toBeNull();
  });

  it("caches the poster by its storage key, not by version", async () => {
    const utils = await renderCard(progress("ready"));
    await waitFor(() => expect(utils.getByTestId("highlight-poster")).toBeTruthy());
    expect(utils.getByTestId("highlight-poster").props.source).toEqual({
      uri: "https://signed/v1.jpg",
      cacheKey: "highlight-poster:m/u/highlights/1.jpg",
    });
  });

  it("failed with no renders left: no CTA, no-retries note", async () => {
    const utils = await renderCard(
      progress("failed", { status: "failed", playback: null, rendersRemaining: 0 }),
    );
    expect(redCtas(utils)).toHaveLength(0);
    expect(utils.getByTestId("highlight-no-retries")).toHaveTextContent("No retries left for this reel.");
  });

  it("failed retry error toasts the mapped copy", async () => {
    mockRetry.mockResolvedValue({ ok: false, error: { code: "HIGHLIGHT_RENDER_LIMIT", message: "x" } });
    const utils = await renderCard(progress("failed", { status: "failed", playback: null }));
    await act(async () => {
      fireEvent.press(utils.getByText("Try again"));
    });
    expect(mockToast.error).toHaveBeenCalledWith("You've used all versions for this reel.");
  });

  it("none: muted copy", async () => {
    const utils = await renderCard(progress("none", { playback: null, highlightId: null }));
    expect(utils.getByTestId("highlight-none")).toHaveTextContent(
      "We couldn't find a clear highlight of you in this video.",
    );
  });

  it("invalidated: muted copy", async () => {
    const utils = await renderCard(progress("invalidated", { playback: null }));
    expect(utils.getByTestId("highlight-invalidated")).toHaveTextContent(
      "Your match video was replaced. A new reel will be made once it's analysed.",
    );
  });

  it("offers no share, save or export affordance in any phase", async () => {
    for (const phase of ["planning", "ready", "regenerating", "failed", "none"]) {
      const utils = await renderCard(progress(phase));
      for (const word of [/share/i, /save/i, /export/i, /download/i, /instagram/i]) {
        expect(utils.queryByText(word)).toBeNull();
        expect(utils.queryByLabelText(word)).toBeNull();
      }
      utils.unmount();
    }
  });
});

// ---- thumbs ----

describe("HighlightCard thumbs", () => {
  it("thumbs up writes rating 1 optimistically", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockSubmit.mockReturnValue(new Promise((r) => (resolve = r)));
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-up"));
    expect(utils.getByTestId("highlight-thumb-up").props.accessibilityState.selected).toBe(true);
    expect(mockSubmit).toHaveBeenCalledWith({}, { highlightId: "h1", rating: 1, chips: [], freeText: null });
    await act(async () => resolve({ ok: true, data: { feedbackId: "fb" } }));
    expect(utils.getByTestId("highlight-thumb-up").props.accessibilityState.selected).toBe(true);
  });

  it("thumbs up reverts with a toast on error", async () => {
    mockSubmit.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const utils = await renderCard(progress("ready"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-thumb-up"));
    });
    expect(utils.getByTestId("highlight-thumb-up").props.accessibilityState.selected).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't save your rating.");
  });

  it("thumbs down opens the sheet preset to -1 and writes nothing yet", async () => {
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    expect(utils.getByText("Improve your reel")).toBeTruthy();
    expect(utils.getByTestId("highlight-sheet-thumb-down").props.accessibilityState.selected).toBe(true);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("closing a thumbs-down sheet without submitting writes the -1 alone", async () => {
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith({}, { highlightId: "h1", rating: -1, chips: [], freeText: null });
    expect(utils.getByTestId("highlight-thumb-down").props.accessibilityState.selected).toBe(true);
  });

  it("closing an Improve sheet without submitting writes nothing", async () => {
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-improve"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

// ---- feedback sheet ----

async function openSheet(p: Record<string, unknown>) {
  const utils = await renderCard(p);
  fireEvent.press(utils.getByTestId("highlight-improve"));
  return utils;
}

describe("Feedback sheet", () => {
  it("shows title, prompts, the six chips, placeholder and a mono counter", async () => {
    const utils = await openSheet(progress("ready"));
    const sheet = within(utils.getByTestId("sheet"));
    expect(sheet.getByText("How was it?")).toBeTruthy();
    expect(sheet.getByText("What's off?")).toBeTruthy();
    for (const label of [
      "That's not me",
      "Missed my best moment",
      "Too long",
      "Too short",
      "Slow start",
      "Wrong moment labelled",
    ]) {
      expect(sheet.getByText(label)).toBeTruthy();
    }
    expect(
      sheet.getByPlaceholderText("Tell us what to change, e.g. 'add the sweep near the end'"),
    ).toBeTruthy();
    const counter = sheet.getByTestId("highlight-feedback-counter");
    expect(counter).toHaveTextContent("0/280");
    expect(counter.props.className).toContain("font-mono");
    expect(counter.props.style).toEqual({ fontVariant: ["tabular-nums"] });
  });

  it("has exactly ONE Signal Red CTA: Regenerate (n left)", async () => {
    const utils = await openSheet(progress("ready"));
    const sheetRoot = utils.getByTestId("sheet");
    expect(redCtas(utils, sheetRoot)).toHaveLength(1);
    expect(within(sheetRoot).getByText("Regenerate (9 left)")).toBeTruthy();
    expect(within(sheetRoot).getByText("Just send feedback")).toBeTruthy();
  });

  it("toggles chips and sends the regenerate payload (rating, ordered chips, trimmed text)", async () => {
    const utils = await openSheet(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-sheet-thumb-down"));
    fireEvent.press(utils.getByTestId("highlight-chip-slow_start"));
    fireEvent.press(utils.getByTestId("highlight-chip-not_me"));
    fireEvent.press(utils.getByTestId("highlight-chip-too_long"));
    fireEvent.press(utils.getByTestId("highlight-chip-too_long")); // off again
    expect(utils.getByTestId("highlight-chip-not_me").props.accessibilityState).toEqual({ selected: true });
    expect(utils.getByTestId("highlight-chip-too_long").props.accessibilityState).toEqual({ selected: false });
    fireEvent.changeText(utils.getByTestId("highlight-feedback-text"), "  add the sweep near the end  ");
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(mockRegenerate).toHaveBeenCalledWith(
      {},
      {
        highlightId: "h1",
        rating: -1,
        chips: ["not_me", "slow_start"],
        freeText: "add the sweep near the end",
      },
    );
    expect(mockToast.success).toHaveBeenCalledWith("Making a new version.");
    expect(utils.queryByTestId("sheet")).toBeNull();
    expect(mockRefresh).toHaveBeenCalled();
    // The regenerate stored the rating: no extra -1 write on close.
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("caps free text at 280 characters", async () => {
    const utils = await openSheet(progress("ready"));
    const input = utils.getByTestId("highlight-feedback-text");
    expect(input.props.maxLength).toBe(280);
    fireEvent.changeText(input, "y".repeat(300));
    expect(utils.getByTestId("highlight-feedback-counter")).toHaveTextContent("280/280");
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(mockRegenerate.mock.calls[0][1].freeText).toHaveLength(280);
  });

  it("shows the spinner copy while the regenerate call runs", async () => {
    mockRegenerate.mockReturnValue(new Promise(() => undefined));
    const utils = await openSheet(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-regenerate"));
    expect(utils.getByText("Working out a new cut…")).toBeTruthy();
    expect(utils.getByTestId("highlight-regenerate").props.accessibilityState.disabled).toBe(true);
  });

  it("disables Regenerate at 0 left with the exhausted helper", async () => {
    const utils = await openSheet(progress("ready", { rendersRemaining: 0, renderTotal: 10, canRegenerate: false }));
    const button = utils.getByTestId("highlight-regenerate");
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(utils.getByText("Regenerate (0 left)")).toBeTruthy();
    expect(utils.getByTestId("highlight-regenerate-helper")).toHaveTextContent(
      "You've used all 10 versions of this reel.",
    );
    fireEvent.press(button);
    expect(mockRegenerate).not.toHaveBeenCalled();
  });

  it("hides Regenerate when the backend says no for another reason", async () => {
    const utils = await openSheet(progress("ready", { canRegenerate: false }));
    expect(utils.queryByTestId("highlight-regenerate")).toBeNull();
    expect(utils.getByTestId("highlight-regenerate-helper")).toHaveTextContent(
      "Regeneration is paused right now.",
    );
    expect(redCtas(utils, utils.getByTestId("sheet"))).toHaveLength(0);
  });

  it("while regenerating, a thumbs-down sheet says a version is being made", async () => {
    const utils = await renderCard(
      progress("regenerating", { status: "pending", renderTotal: 2, canRegenerate: false }),
    );
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    expect(utils.queryByTestId("highlight-regenerate")).toBeNull();
    expect(utils.getByTestId("highlight-regenerate-helper")).toHaveTextContent(
      "A new version is already being made.",
    );
  });

  it("Just send feedback is disabled until something is chosen, then stores without regenerating", async () => {
    const utils = await openSheet(progress("ready"));
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(utils.getByTestId("highlight-chip-too_short"));
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-send-feedback"));
    });
    expect(mockSubmit).toHaveBeenCalledWith(
      {},
      { highlightId: "h1", rating: null, chips: ["too_short"], freeText: null },
    );
    expect(mockRegenerate).not.toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith("Thanks, feedback sent.");
    expect(utils.queryByTestId("sheet")).toBeNull();
  });

  const ERROR_COPY: [string, string][] = [
    ["ATHLETE_NOT_FOUND", "Sign in to see your highlight."],
    ["NOT_PARTICIPANT", "You are not in this match."],
    ["HIGHLIGHTS_DISABLED", "Highlight reels are paused right now."],
    ["HIGHLIGHT_NOT_FOUND", "That highlight no longer exists."],
    ["HIGHLIGHT_NOT_READY", "Your highlight isn't ready yet."],
    ["HIGHLIGHT_SOURCE_NOT_READY", "Your match video isn't available for a highlight right now."],
    ["HIGHLIGHT_RENDER_IN_PROGRESS", "A new version is already being made."],
    ["HIGHLIGHT_RENDER_LIMIT", "You've used all versions for this reel."],
    ["HIGHLIGHT_REGEN_UNAVAILABLE", "This reel can't be regenerated."],
    ["HIGHLIGHT_REGEN_FAILED", "We couldn't work out a better cut. Try different feedback."],
    ["HIGHLIGHT_REGEN_EXPIRED", "That took too long. Try again."],
    ["HIGHLIGHT_NOT_RETRYABLE", "This reel doesn't need a retry."],
    ["HIGHLIGHT_FEEDBACK_INVALID", "We couldn't save that feedback."],
    ["HIGHLIGHT_FEEDBACK_LIMIT", "You've sent a lot of feedback on this reel. Try again later."],
    ["HIGHLIGHT_BAD_SEGMENTS", "Those moments can't make a reel."],
    ["UNKNOWN", HIGHLIGHT_ERROR_FALLBACK],
  ];

  it.each(ERROR_COPY)("a %s regenerate error stays open with its copy", async (code, copy) => {
    mockRegenerate.mockResolvedValue({ ok: false, error: { code, message: "raw server text" } });
    const utils = await openSheet(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-chip-not_me"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(utils.getByTestId("sheet")).toBeTruthy();
    expect(utils.getByTestId("highlight-feedback-error")).toHaveTextContent(copy);
    expect(utils.queryByText("raw server text")).toBeNull();
  });

  it("a thumbs-down sheet whose regenerate expired shows the copy and does not write -1 on close", async () => {
    mockRegenerate.mockResolvedValue({ ok: false, error: { code: "HIGHLIGHT_REGEN_EXPIRED", message: "x" } });
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(utils.getByTestId("highlight-feedback-error")).toHaveTextContent("That took too long. Try again.");
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("a thumbs-down sheet whose regenerate the AI failed does not write -1 again on close", async () => {
    mockRegenerate.mockResolvedValue({ ok: false, error: { code: "HIGHLIGHT_REGEN_FAILED", message: "x" } });
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("clears the sheet thumbs on a second tap; nothing selected disables Just send", async () => {
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(false);
    fireEvent.press(utils.getByTestId("highlight-sheet-thumb-down"));
    expect(utils.getByTestId("highlight-sheet-thumb-down").props.accessibilityState.selected).toBe(false);
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(true);
  });

  it("never stores a rating-only duplicate: after thumbs up, Improve's Just send waits for a change", async () => {
    const utils = await renderCard(progress("ready"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-thumb-up"));
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    fireEvent.press(utils.getByTestId("highlight-improve"));
    expect(utils.getByTestId("highlight-sheet-thumb-up").props.accessibilityState.selected).toBe(true);
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(utils.getByTestId("highlight-send-feedback"));
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    fireEvent.press(utils.getByTestId("highlight-sheet-thumb-down"));
    expect(utils.getByTestId("highlight-send-feedback").props.accessibilityState.disabled).toBe(false);
  });

  it("locks swipe and backdrop close while a submit runs", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRegenerate.mockReturnValue(new Promise((r) => (resolve = r)));
    const utils = await openSheet(progress("ready"));
    const backdrop = () =>
      (mockSheetProps.backdropComponent as (p: object) => React.ReactElement<{ pressBehavior: string }>)({});
    expect(mockSheetProps.enablePanDownToClose).toBe(true);
    expect(backdrop().props.pressBehavior).toBe("close");
    fireEvent.press(utils.getByTestId("highlight-regenerate"));
    expect(mockSheetProps.enablePanDownToClose).toBe(false);
    expect(backdrop().props.pressBehavior).toBe("none");
    await act(async () => resolve({ ok: false, error: { code: "HIGHLIGHT_RENDER_LIMIT", message: "x" } }));
    expect(mockSheetProps.enablePanDownToClose).toBe(true);
  });

  it("a sheet closed mid-regenerate writes no -1, and the result still toasts and refreshes", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRegenerate.mockReturnValue(new Promise((r) => (resolve = r)));
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    fireEvent.press(utils.getByTestId("highlight-regenerate"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).not.toHaveBeenCalled();
    await act(async () =>
      resolve({
        ok: true,
        data: { feedbackId: "fb", highlightId: "h1", renderTotal: 2, rendersRemaining: 8, changeSummary: null },
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith("Making a new version.");
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(utils.getByTestId("highlight-thumb-down").props.accessibilityState.selected).toBe(true);
  });

  it("a sheet closed mid-regenerate surfaces a later error (e.g. 422) as a toast", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockRegenerate.mockReturnValue(new Promise((r) => (resolve = r)));
    const utils = await openSheet(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-chip-too_long"));
    fireEvent.press(utils.getByTestId("highlight-regenerate"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    await act(async () => resolve({ ok: false, error: { code: "HIGHLIGHT_REGEN_FAILED", message: "x" } }));
    expect(mockToast.error).toHaveBeenCalledWith(
      "We couldn't work out a better cut. Try different feedback.",
    );
  });

  it("a thumbs-down sheet closed after a submit that stored nothing still writes the -1", async () => {
    mockRegenerate.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(utils.getByTestId("highlight-feedback-error")).toHaveTextContent(HIGHLIGHT_ERROR_FALLBACK);
    await act(async () => {
      fireEvent.press(utils.getByTestId("sheet-swipe-close"));
    });
    expect(mockSubmit).toHaveBeenCalledWith({}, { highlightId: "h1", rating: -1, chips: [], freeText: null });
  });

  it("a regenerate timeout closes softly, says still working and refreshes (no error, no -1)", async () => {
    mockRegenerate.mockResolvedValue({
      ok: false,
      error: { code: "HIGHLIGHT_REGEN_TIMEOUT", message: "x" },
    });
    const utils = await renderCard(progress("ready"));
    fireEvent.press(utils.getByTestId("highlight-thumb-down"));
    await act(async () => {
      fireEvent.press(utils.getByTestId("highlight-regenerate"));
    });
    expect(mockToast.info).toHaveBeenCalledWith("Still working on it. Check back in a minute.");
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    expect(utils.queryByTestId("sheet")).toBeNull();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe("Open reel (phase 2 viewer link)", () => {
  it("ready: a secondary text link opens the viewer with source=match_detail (no red)", async () => {
    const utils = await renderCard(progress("ready"));
    const link = utils.getByTestId("highlight-open-reel");
    expect(link).toHaveTextContent("Open reel");
    expect(link.props.className ?? "").not.toMatch(/(^|\s)bg-cta(\s|$)/);
    fireEvent.press(link);
    expect(mockRouterPush).toHaveBeenCalledWith("/highlight/h1?source=match_detail");
    expect(redCtas(utils)).toHaveLength(0);
  });

  it("marks the live version seen once per version while the ready card shows it", async () => {
    const utils = await renderCard(progress("ready"));
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith({}, "h1", 1);
    utils.rerender(<HighlightCard matchVideoId="v1" angleLabel={null} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    mockProgress = progress("ready", { renderTotal: 2, playback: { ...PLAYBACK, version: 2 } });
    utils.rerender(<HighlightCard matchVideoId="v1" angleLabel={null} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockMarkSeen).toHaveBeenCalledTimes(2);
    expect(mockMarkSeen).toHaveBeenLastCalledWith({}, "h1", 2);
  });

  it.each([
    ["waiting_for_analysis", { playback: null, highlightId: null }],
    ["rendering", { playback: null }],
    ["failed", { playback: null }],
  ])("%s: no Open reel link and nothing marked seen", async (phase, over) => {
    const utils = await renderCard(progress(phase, over));
    expect(utils.queryByTestId("highlight-open-reel")).toBeNull();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});
