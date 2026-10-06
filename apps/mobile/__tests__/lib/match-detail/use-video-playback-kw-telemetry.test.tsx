import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

/**
 * Review L2 (jits-xfvd.19): a keep-watching switch abandoned by the app
 * going to the background, or by the screen unmounting, is in the ONE
 * "Video playback session" event that background or unmount flushes. The
 * real telemetry hook, the shared fake expo-video.
 */

const mockCaptureMessage = jest.fn();
jest.mock("@/lib/error-tracking/sentry", () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ type: "wifi", details: null })), addEventListener: jest.fn(() => () => undefined) },
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockSign = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchVideoPlaybackResult: (...a: unknown[]) => mockSign(...a),
}));
jest.mock("expo-video", () => require("../../support/fake-expo-video"));
import { deferReplace, fakePlayers as mockPlayers, readyPlayer, resetFakeVideo, tick } from "../../support/fake-expo-video";
import { __resetSwitchLeadStoreForTests } from "@/lib/match-detail/switch-lead-store";
import { useVideoPlayback } from "@/lib/match-detail/use-video-playback";
import { __resetNetworkStoreForTests } from "@/lib/video/quality/network-store";

const URLS: Record<string, string> = { "vid-1": "https://s/a.mp4", "vid-2": "https://s/b.mp4" };
const idx = (i: 0 | 1) => mockPlayers.length - 2 + i;

let handlers: Array<(s: string) => void> = [];
beforeEach(() => {
  jest.clearAllMocks();
  resetFakeVideo();
  __resetSwitchLeadStoreForTests();
  __resetNetworkStoreForTests({ type: "wifi", isConnected: true, details: null });
  mockSign.mockImplementation((_c: unknown, vid: string) =>
    Promise.resolve({ ok: true, data: { url: URLS[vid], posterUrl: null, status: "ready", playability: "playable", matchId: "m", durationSeconds: 400 } }),
  );
  handlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, fn) => {
    handlers.push(fn as (s: string) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

/** Open vid-1 playing at 10 s and tap vid-2 (its load never settles: the switch stays pending). */
async function openAndTap() {
  const hook = renderHook(() => useVideoPlayback("vid-1"));
  await waitFor(() => expect(mockPlayers[idx(0)].replaceAsync).toHaveBeenCalledTimes(1));
  await act(async () => undefined);
  act(() => readyPlayer(idx(0)));
  act(() => hook.result.current.onSlotFirstFrame(0));
  act(() => tick(idx(0), 10));
  deferReplace(idx(1));
  act(() => hook.result.current.switchAngle("vid-2", 10, { offsets: { fromMs: 0, toMs: 0 } }));
  await act(async () => undefined);
  await act(async () => undefined);
  expect(hook.result.current.switchState).toMatchObject({ phase: "pending", mode: "keep_watching" });
  return hook;
}

function lastEvent() {
  const call = mockCaptureMessage.mock.calls.at(-1);
  expect(call?.[0]).toBe("Video playback session");
  return call![1].extra;
}

describe("keep-watching abandons reach the flushed session event (review L2)", () => {
  it("background", async () => {
    const hook = await openAndTap();
    act(() => handlers.forEach((h) => h("background")));
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(lastEvent()).toMatchObject({ switchKeepWatchingCount: 1, switchAbandonedCount: 1, switchAbandonReasons: ["background"] });
    hook.unmount();
  });

  it("unmount", async () => {
    const hook = await openAndTap();
    hook.unmount();
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(lastEvent()).toMatchObject({ switchKeepWatchingCount: 1, switchAbandonedCount: 1, switchAbandonReasons: ["unmount"] });
  });
});
