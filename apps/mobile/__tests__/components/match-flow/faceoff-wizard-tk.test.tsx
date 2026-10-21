/**
 * The wizard wires the face-off for both modes (slice M3): the real wizard,
 * reconciler, step renderer and face-off; only the data layer, the realtime
 * hook and the recorder are stubbed.
 *  - a timekeeper-mode athlete's face-off takes the match flow (the
 *    timekeeper's row, the face-off timeout, the merged ready) and never
 *    starts the match; their Leave names the opponent and the timekeeper
 *    (TK-E4);
 *  - the timekeeper's header (TK-K0, TK-D9, their Leave: TK-K14) sits above
 *    the camera, where an athlete's face-off header goes, and their rows and
 *    Start below it;
 *  - a two-athlete face-off shows none of it, and its Leave is the shipped one;
 *  - while the server reads the seated timekeeper offline before the start,
 *    an athlete's face-off shows TK-D7 under its TK-D9 (one chip on screen);
 *    the timekeeper's own face-off never does (spec 4.3, jits-o47s.29 item 3).
 */
import * as React from "react";
import { Alert, AppState } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textSecondary: "#aaa", statePositive: "#0f0" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = () => chan;
      chan.subscribe = () => chan;
      return chan;
    },
    getChannels: () => [],
    removeChannel: async () => undefined,
  },
}));
jest.mock("@/lib/video/use-film-status", () => require("../../support/film-status-mock").unavailableFilmStatusModule());
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({ useMatchVideosRealtime: () => ({ subscribed: true }) }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { size: () => 0, subscribe: () => () => {}, enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
}));
jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => undefined }));
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  MatchRecorderProvider: ({ children }: { children: React.ReactNode }) => children,
  useMatchRecorder: () => ({ permission: { granted: true, canAskAgain: true }, state: "idle", stop: jest.fn(() => Promise.resolve()) }),
}));
jest.mock("@/components/match-flow/match-recorder-surface", () => {
  const R = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  return { MatchRecorderCamera: () => R.createElement(RN.View, { testID: "camera-slot" }) };
});
jest.mock("@jits/shared/api/match-video-upload", () => ({ setMatchRecordingIntent: async () => ({ ok: true, data: null }) }));
jest.mock("@/lib/invites/location", () => ({
  ...jest.requireActual("@/lib/invites/location"),
  readLocationOnce: jest.fn(async () => ({ status: "denied", canAskAgain: true })),
}));
jest.mock("@/lib/arena/location-telemetry", () => ({ logMatchStartLocation: jest.fn() }));

const mockGetMatchDetails = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: async () => [],
  getMatchDetailsWithConfirmations: async (...a: unknown[]) => {
    const match = await mockGetMatchDetails(...a);
    return match ? { match, confirmations: [] } : null;
  },
  getSubmissionTypes: async () => [],
  getRatingStakes: async () => null,
}));
const mockGetTkState = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperMatchState: (...a: unknown[]) => mockGetTkState(...a),
}));
const mockStart = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({ startMatch: (...a: unknown[]) => mockStart(...a), cancelSessionMatch: jest.fn() }));
jest.mock("@jits/shared/api/match-weights", () => ({
  ...jest.requireActual("@jits/shared/api/match-weights"),
  getMatchChallengeWeights: async () => ({ challengerId: "ch-1", opponentId: "op-1", challengerWeight: 168, opponentWeight: 170.2 }),
}));
jest.mock("@jits/shared/api/match-weight-checks", () => ({
  ...jest.requireActual("@jits/shared/api/match-weight-checks"),
  getMatchWeightChecks: async () => ({ ok: false, error: { code: "UNKNOWN", message: "n/a" } }),
}));
// A plain object, like the hook's own return (timekeeper mode spreads it, `useStepMatchSync`).
const mockBroadcast = Object.fromEntries(
  [
    "broadcastTimerStarted",
    "broadcastTimerPaused",
    "broadcastTimerResumed",
    "broadcastMatchEnded",
    "broadcastReady",
    "broadcastResultSubmitted",
    "broadcastResultConfirmed",
    "broadcastMatchCancelled",
    "broadcastMatchDisputed",
    "broadcastWeighedIn",
    "broadcastRecordingOptIn",
    "broadcastResultClaimed",
  ].map((name) => [name, jest.fn((..._a: unknown[]) => Promise.resolve("ok"))]),
);
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({ useSessionMatchSync: () => mockBroadcast }));

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";
import { __resetRecordingOptInForTests } from "@/lib/match-flow/recording-optin";
import { CH, OP, TK, tkMatch, tkState } from "../../support/timekeeper-faceoff";

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount(viewerId: string, match: unknown) {
  mockGetMatchDetails.mockResolvedValue(match);
  const screen = render(<MatchFlowWizard exitHref="/arena" exitLabel="Back to Arena" matchId="M1" currentAthleteId={viewerId} />);
  await flush();
  return screen;
}

/** The testIDs in render order (a depth-first walk of the host tree). */
function testIdOrder(screen: ReturnType<typeof render>): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { props?: { testID?: string }; children?: unknown };
    if (n.props?.testID) out.push(n.props.testID);
    walk(n.children);
  };
  walk(screen.toJSON());
  return out;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-21T12:05:00.000Z"));
  jest.clearAllMocks();
  jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  __resetRecordingOptInForTests(false);
  mockGetTkState.mockResolvedValue({ ok: true, data: tkState({ ready: [CH] }) });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("a timekeeper-mode athlete", () => {
  it("weighs in with the timekeeper's row and the face-off timeout, then gets the merged ready, and never starts the match", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    const screen = await mount(OP, tkMatch());
    screen.getByTestId("match-step-weight");
    expect(screen.getByTestId("faceoff-timekeeper-row").props.accessibilityLabel).toBe(`${C["TK-F1"]}, J. Cruz, ${C["TK-F2"]}`);
    expect(screen.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 5:00");
    fireEvent.press(screen.getByTestId("weight-confirm"));
    await flush();
    screen.getByTestId("match-step-ready");
    expect(screen.getByTestId("ready-button").props.accessibilityLabel).toBe(C["TK-F4"]);
    expect(screen.getByTestId("ready-panel-opponent").props.accessibilityLabel).toBe("Opponent, ready");
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    await flush();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("Leave names the opponent and the timekeeper (TK-E4)", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = await mount(OP, tkMatch());
    fireEvent.press(screen.getByLabelText("Cancel match"));
    const want = C["TK-E4"]("M. Reyes");
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([want.title, want.body]);
    expect(want.body).toBe("M. Reyes and your timekeeper go back to the Arena.");
  });
});

describe("the timekeeper", () => {
  it("has their header above the camera and their rows and Start below it", async () => {
    __resetAiConsentForTests({ athleteId: TK, consentAt: "2026-10-14T12:00:00Z", known: true });
    const screen = await mount(TK, tkMatch());
    const order = testIdOrder(screen);
    const header = order.indexOf("faceoff-timekeeper-top-label");
    const camera = order.indexOf("camera-slot");
    const body = order.indexOf("faceoff-timekeeper");
    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(camera);
    expect(camera).toBeLessThan(body);
    expect(screen.getByTestId("faceoff-timekeeper-top-label").props.children).toBe(C["TK-K0"]);
    screen.getByTestId(`faceoff-athlete-row-${CH}`);
    screen.getByTestId("faceoff-start");
    // The athletes' header is not theirs. Their Leave is in their own
    // header: the seat's drop-out (A5, R21), asked with TK-K14.
    expect(screen.queryByTestId("faceoff-top-label")).toBeNull();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const leave = screen.getByTestId("faceoff-leave");
    expect(order.indexOf("faceoff-leave")).toBeLessThan(camera);
    expect(leave.props.accessibilityLabel).toBe("Leave");
    fireEvent.press(leave);
    const want = C["TK-K14"]({ a: "M. Reyes", b: "D. Okafor" });
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([want.title, want.body]);
  });
});

describe("the timekeeper offline before the start (TK-D7, spec 4.3)", () => {
  const offline = () => ({ ok: true, data: tkState({ ready: [CH], presence: "offline" }) });

  it("an athlete's face-off shows TK-D7 with the face-off's one TK-D9 chip", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    mockGetTkState.mockResolvedValue(offline());
    const screen = await mount(OP, tkMatch());
    screen.getByTestId("match-step-weight");
    expect(screen.getByTestId("live-timekeeper-offline")).toBeTruthy();
    screen.getByText("J. CRUZ IS OFFLINE");
    expect(screen.getAllByTestId("timeout-chip")).toHaveLength(1);
    expect(screen.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 5:00");
    // Above the camera, under the chip: the face-off header's order.
    const order = testIdOrder(screen);
    expect(order.indexOf("timeout-chip")).toBeLessThan(order.indexOf("live-timekeeper-offline"));
    expect(order.indexOf("live-timekeeper-offline")).toBeLessThan(order.indexOf("camera-slot"));
  });

  it("the timekeeper's own face-off never shows them offline", async () => {
    __resetAiConsentForTests({ athleteId: TK, consentAt: "2026-10-14T12:00:00Z", known: true });
    mockGetTkState.mockResolvedValue(offline());
    const screen = await mount(TK, tkMatch());
    screen.getByTestId("faceoff-timekeeper");
    // The state that reads them offline has landed (its timeout counts down).
    expect(screen.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 5:00");
    expect(screen.queryByTestId("live-timekeeper-offline")).toBeNull();
    expect(screen.queryByText("J. CRUZ IS OFFLINE")).toBeNull();
  });

  it("a two-athlete match never shows it", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    mockGetTkState.mockResolvedValue(offline());
    const match = { ...(tkMatch() as object), requires_timekeeper: false, tk_weight_check_required: false, timekeeper_id: null, timekeeper: null };
    const screen = await mount(OP, match);
    screen.getByTestId("match-step-weight");
    expect(screen.queryByTestId("live-timekeeper-offline")).toBeNull();
  });
});

describe("a two-athlete match", () => {
  it("shows no timekeeper row, no timeout chip and the shipped ready", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    const match = { ...(tkMatch() as object), requires_timekeeper: false, tk_weight_check_required: false, timekeeper_id: null, timekeeper: null };
    const screen = await mount(OP, match);
    screen.getByTestId("match-step-weight");
    expect(screen.queryByTestId("faceoff-timekeeper-row")).toBeNull();
    expect(screen.queryByTestId("timeout-chip")).toBeNull();
    expect(mockGetTkState).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("weight-confirm"));
    await flush();
    expect(screen.getByTestId("ready-button").props.accessibilityLabel).toBe("I'm ready");
  });

  it("keeps the shipped Leave alert", async () => {
    __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const match = { ...(tkMatch() as object), requires_timekeeper: false, tk_weight_check_required: false, timekeeper_id: null, timekeeper: null };
    const screen = await mount(OP, match);
    fireEvent.press(screen.getByLabelText("Cancel match"));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual(["Cancel match?", "Your opponent will be returned to the lobby."]);
    expect((alert.mock.calls[0][2] ?? []).map((b) => b.text)).toEqual(["Keep Waiting", "Cancel Match"]);
  });
});
