import * as React from "react";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

const mockSetParams = jest.fn();
let mockId: string | undefined = "ref";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), setParams: mockSetParams, canGoBack: () => true }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: { testID?: string }) => R.createElement(RN.View, { testID: props.testID }) };
});
jest.mock("@/lib/motion", () => ({
  haptics: { select: jest.fn(async () => undefined) },
  useReduceMotion: () => false,
  useModalAnimation: () => "none",
}));
const mockUseMatchDetail = jest.fn();
jest.mock("@/lib/match-detail/use-match-detail", () => ({ useMatchDetail: (id: string | undefined) => mockUseMatchDetail(id) }));
const mockGetVideoAnalysis = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getVideoAnalysis: (...a: unknown[]) => mockGetVideoAnalysis(...a),
  getVideoSyncOffsets: jest.fn(async () => ({})),
}));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({ getMatchVideoPlaybackResult: (...a: unknown[]) => mockSign(...a) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({ captureMessage: (...a: unknown[]) => mockCaptureMessage(...a) }));
jest.mock("@react-native-community/netinfo", () => ({ __esModule: true, default: { fetch: jest.fn(async () => ({ type: "wifi", details: null })) } }));
jest.mock("@/lib/theme/use-theme", () => ({ useResolvedColorScheme: () => "dark", useThemedTokens: () => ({ accentCta: "#E63946" }) }));
jest.mock("expo-video", () => require("../support/fake-expo-video"));

import { fakePlayers, fakeViews, readyPlayer, resetFakeVideo, tick } from "../support/fake-expo-video";
import { __setMultiAnglePlayerForTests } from "@/lib/video/multi-angle/flag";
import { swipeDirection } from "@/components/film-room/multi-angle/angle-stack";
import MatchVideoScreen from "@/app/(app)/video/[id]";

const MATCH = "11111111-1111-4111-8111-111111111111";

function row(id: string, over: Record<string, unknown> = {}) {
  return { id, uploaded_by: id, uploaded_by_name: null, status: "ready", playability: "playable", duration_seconds: 400, camera_angle: null, has_analysis: false, is_mine: false, angle_label: "", poster_url: null, ...over };
}

const VIDEOS = [
  row("ref", { is_mine: true, uploaded_by_name: "Kai Reyes", is_primary: true, has_analysis: true, sync_offset_ms: 0 }),
  row("opp", { uploaded_by_name: "Mina Park", sync_offset_ms: 2500, sync_source: "audio", sync_confidence: 0.8 }),
  row("tk", { uploaded_by_name: "Jo Cruz", recording_type: "timekeeper", sync_offset_ms: 4000, sync_source: "clock", sync_confidence: null }),
  row("late", { uploaded_by_name: "Lee Moss", status: "uploading", playability: "processing", upload_bytes_confirmed: 42, upload_bytes_total: 100, upload_in_flight: true }),
];

const ANALYSIS = {
  ok: true,
  data: {
    summary: "Reyes won.",
    analysis_tier: "premium",
    positions: [],
    scoring_moments: [{ type: "takedown", timestamp_s: 27, description: "Single leg" }],
    technique_tags: [],
    completed_at: null,
    moment_angles: [{ t_s: 27, clarity: { ref: 2, opp: 9, tk: 5 } }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeVideo();
  __setMultiAnglePlayerForTests(true);
  mockId = "ref";
  mockSign.mockImplementation((_c: unknown, id: string) =>
    Promise.resolve({ ok: true, data: { url: `https://s/${id}.mp4`, posterUrl: null, status: "ready", playability: "playable", matchId: MATCH, durationSeconds: 400, sourceKind: "normalized" } }),
  );
  mockUseMatchDetail.mockImplementation((id: string | undefined) =>
    id === MATCH
      ? { state: "ready", error: null, refreshing: false, refetch: jest.fn(), data: { match: { id: MATCH, match_type: "ranked", result: "points" }, me: { athlete_id: "ref", display_name: "Kai Reyes" }, opponent: { athlete_id: "opp", display_name: "Mina Park" }, videos: VIDEOS, confirmations: [] } }
      : { state: "loading", data: null, error: null, refreshing: false, refetch: jest.fn() },
  );
  mockGetVideoAnalysis.mockResolvedValue(ANALYSIS);
});
afterAll(() => __setMultiAnglePlayerForTests(null));

async function openPlayer() {
  const utils = render(React.createElement(MatchVideoScreen));
  await waitFor(() => expect(fakePlayers[0]?.replaceAsync).toHaveBeenCalled(), { timeout: 5000 });
  act(() => readyPlayer(0));
  await waitFor(() => expect(fakePlayers[2].replaceAsync).toHaveBeenCalled());
  act(() => {
    readyPlayer(1);
    readyPlayer(2);
  });
  await waitFor(() => expect(utils.getByTestId("angle-bar")).toBeTruthy());
  return utils;
}

const opacity = (el: { props: { style: unknown } }) => Object.assign({}, ...([] as unknown[]).concat(el.props.style).flat(3)).opacity;

describe("multi-angle player (dev flag on)", () => {
  it("stacks one view per playable angle, only the visible one opaque, with the angle control in the bottom cluster", async () => {
    const utils = await openPlayer();
    expect(fakePlayers).toHaveLength(3);
    expect(opacity(utils.getByTestId("angle-view-ref"))).toBe(1);
    expect(opacity(utils.getByTestId("angle-view-opp"))).toBe(0);
    expect(opacity(utils.getByTestId("angle-view-tk"))).toBe(0);
    expect(utils.queryByTestId("angle-view-late")).toBeNull();
    // Ready-only quick switch: the uploading angle is counted, not offered.
    expect(utils.getByText("3 OF 4 ANGLES")).toBeTruthy();
    const bar = utils.getByTestId("angle-bar");
    expect(within(bar).getByTestId("angle-switcher")).toBeTruthy();
    expect(within(bar).queryByTestId("angle-late")).toBeNull();
  });

  it("switches by tapping a segment without remounting anything, and tags a clock-only angle Approx. sync", async () => {
    const utils = await openPlayer();
    const mounts = fakeViews.mounts;
    act(() => tick(0, 30));
    const before = fakePlayers[2].seeks.length;
    fireEvent.press(utils.getByLabelText("J. CRUZ'S ANGLE, TIMEKEEPER"));
    // A dip: black first, then the approximate seek.
    await waitFor(() => expect(fakePlayers[2].seeks.length).toBe(before + 1));
    act(() => tick(2, fakePlayers[2].seeks.at(-1)!));
    await waitFor(() => expect(opacity(utils.getByTestId("angle-view-tk"))).toBe(1));
    expect(utils.getByTestId("angle-approx-tag")).toHaveTextContent("APPROX. SYNC");
    expect(fakeViews.mounts).toBe(mounts);
    expect(fakePlayers).toHaveLength(3);
  });

  it("changes angle with the swipe layer's accessibility actions (the swipe is never the only route)", async () => {
    const utils = await openPlayer();
    const layer = utils.getByTestId("angle-swipe-layer");
    expect(layer.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(["Next angle", "Previous angle"]);
    act(() => tick(0, 10));
    act(() => utils.getByTestId("angle-swipe-layer").props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } }));
    act(() => tick(1, 7.5));
    await waitFor(() => expect(opacity(utils.getByTestId("angle-view-opp"))).toBe(1));
  });

  it("reads a horizontal swipe as next / previous and ignores vertical or short drags", () => {
    expect(swipeDirection(-80, 5)).toBe(1);
    expect(swipeDirection(90, -10)).toBe(-1);
    expect(swipeDirection(-40, 0)).toBeNull();
    expect(swipeDirection(-80, 60)).toBeNull();
  });

  it("lists every angle in the Angles sheet with the deck's row strings; a ready row switches", async () => {
    const utils = await openPlayer();
    fireEvent.press(utils.getByTestId("angle-count-chip"));
    const sheet = utils.getByTestId("angles-sheet");
    expect(within(sheet).getByTestId("angles-row-ref-state")).toHaveTextContent("WATCHING");
    expect(within(sheet).getByTestId("angles-row-late-state")).toHaveTextContent("UPLOADING 42%");
    expect(within(sheet).getByTestId("angles-row-late").props.accessibilityState).toMatchObject({ disabled: true });
    expect(within(sheet).getByTestId("angles-row-tk")).toHaveTextContent(/APPROX\. SYNC/);
    expect(within(sheet).getByTestId("angles-row-ref")).toHaveTextContent(/BEST ANGLE/);
    act(() => tick(0, 10));
    fireEvent.press(within(sheet).getByTestId("angles-row-opp"));
    act(() => tick(1, 7.5));
    await waitFor(() => expect(opacity(utils.getByTestId("angle-view-opp"))).toBe(1));
  });

  it("offers frame step only while paused, stepping one frame", async () => {
    const utils = await openPlayer();
    expect(utils.queryByTestId("frame-step")).toBeNull();
    act(() => tick(0, 12));
    fireEvent.press(utils.getByLabelText("Pause"));
    fireEvent.press(utils.getByTestId("frame-step-forward"));
    expect(fakePlayers[0].seeks.at(-1)).toBeCloseTo(12 + 1 / 30, 6);
    expect(utils.getByTestId("frame-step-back").props.accessibilityLabel).toMatch(/^Back one frame, 00:12\.\d\d$/);
  });

  it("opens a key moment on its clearest angle when the planner scored the angles", async () => {
    const utils = await openPlayer();
    act(() => tick(0, 5));
    await waitFor(() => expect(utils.getByLabelText("Jump to 00:27, Takedown")).toBeTruthy());
    fireEvent.press(utils.getByLabelText("Jump to 00:27, Takedown"));
    // The opponent's file is 2.5 s behind the Best angle's.
    await waitFor(() => expect(fakePlayers[1].seeks.at(-1)).toBeCloseTo(24.5, 6));
    act(() => tick(1, 24.5));
    await waitFor(() => expect(opacity(utils.getByTestId("angle-view-opp"))).toBe(1));
  });

  it("sends one telemetry event in multi mode", async () => {
    const utils = await openPlayer();
    utils.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage.mock.calls[0][1].tags["video.playback.mode"]).toBe("multi");
  });
});
