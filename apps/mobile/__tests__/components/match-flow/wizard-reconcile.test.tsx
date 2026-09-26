/**
 * The wizard re-syncs from the DB when a broadcast is missed (Team A, match
 * sync reliability). Real wizard, real useMatchDetails, real reconciler and
 * real steps; only the data layer, the realtime hook and the recorder are
 * stubbed. Each case is one of the harness failures:
 *
 *  - jits-vh7m / E6: backgrounded during live, opponent ended + recorded;
 *    foreground lands on confirm and stops the recorder first.
 *  - jits-mzfu / C2: result_submitted lost; the result step's poll moves on.
 *  - jits-bmei / E8: result_confirmed lost; the confirm poll reaches summary.
 *  - jits-wfpo / C6: dispute reaches the other side, by broadcast or DB.
 *  - jits-bh2v / E3B: cancel while on the weight step, by broadcast or DB.
 *  - monotonic: a stale read never moves the wizard back.
 */
import * as React from "react";
import { AppState } from "react-native";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";

// ---- environment ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub),
    },
  );
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textSecondary: "#aaa", statePositive: "#0f0" }),
}));

// The reconciler's `matches` row listener (now live: the backend published
// the table). Captured so the tests can deliver a row UPDATE.
const mockRow: { handler: ((p: { new: { status?: string } }) => void) | null } = { handler: null };
jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => {
      const chan: Record<string, unknown> = {};
      chan.on = (_e: string, _f: unknown, h: (p: { new: { status?: string } }) => void) => {
        mockRow.handler = h;
        return chan;
      };
      chan.subscribe = () => chan;
      return chan;
    },
    removeChannel: async () => undefined,
  },
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));

jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: {
    size: () => 0,
    subscribe: () => () => {},
    enqueue: (_key: string, fn: () => unknown) => fn(),
  },
  isQueuedResult: () => false,
}));

jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = (props: { children?: React.ReactNode }) =>
    R.createElement(RN.View, null, props?.children ?? null);
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("@/lib/error-tracking/sentry", () => ({ captureException: jest.fn() }));
jest.mock("@/lib/match-flow/use-keep-awake", () => ({ useMatchKeepAwake: () => {} }));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: {
    matchStart: () => Promise.resolve(),
    matchEnd: () => Promise.resolve(),
    timeWarning: () => Promise.resolve(),
  },
}));
const mockTimerSync = jest.fn();
jest.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    formatted: "05:00",
    remaining: 300,
    paused: false,
    running: true,
    syncFromBroadcast: (...a: unknown[]) => mockTimerSync(...a),
  }),
}));

// One recorder for the wizard; only `stop` matters here.
const mockRecorder = {
  permission: { granted: false },
  state: "recording",
  start: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
};
jest.mock("@/components/match-flow/match-recorder-context", () => ({
  MatchRecorderProvider: ({ children }: { children: React.ReactNode }) => children,
  useMatchRecorder: () => mockRecorder,
}));
jest.mock("@/components/match-flow/match-recorder-surface", () => ({
  MatchRecorderCamera: () => null,
  MatchRecorderStatus: () => null,
}));

// ---- data layer ----

const mockGetMatchDetails = jest.fn();
const mockGetMatchConfirmations = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetails: (...a: unknown[]) => mockGetMatchDetails(...a),
  getMatchConfirmations: (...a: unknown[]) => mockGetMatchConfirmations(...a),
  getSubmissionTypes: async () => [],
}));

const mockDispute = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  confirmMatchResult: async () => ({ ok: true, data: {} }),
  disputeMatchResult: (...a: unknown[]) => mockDispute(...a),
  recordMatchResult: async () => ({ ok: true, data: {} }),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
}));

// ---- realtime: capture each step's handlers ----

type Handlers = Record<string, ((...a: unknown[]) => void) | undefined>;
const mockSyncCalls: Handlers[] = [];
const mockBroadcast = {
  broadcastTimerStarted: jest.fn(() => Promise.resolve("ok")),
  broadcastReady: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchCancelled: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchEnded: jest.fn(() => Promise.resolve("ok")),
  broadcastTimerPaused: jest.fn(() => Promise.resolve("ok")),
  broadcastTimerResumed: jest.fn(() => Promise.resolve("ok")),
  broadcastResultSubmitted: jest.fn(() => Promise.resolve("ok")),
  broadcastResultConfirmed: jest.fn(() => Promise.resolve("ok")),
  broadcastMatchDisputed: jest.fn((_id: string): Promise<unknown> => Promise.resolve("ok")),
};
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: Handlers) => {
    mockSyncCalls.push(params);
    return mockBroadcast;
  },
}));

/** The latest step channel that binds `handler`. */
function handlerOf(name: string) {
  for (let i = mockSyncCalls.length - 1; i >= 0; i--) {
    const h = mockSyncCalls[i][name];
    if (h) return h;
  }
  throw new Error(`no step bound ${name}`);
}

import { MatchFlowWizard } from "@/components/match-flow/match-flow-wizard";
import { toast } from "@/components/ui/toast";

// ---- fixtures ----

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 170,
    profile_photo_url: null,
    role: "competitor",
    outcome,
    elo_before: outcome ? 1200 : null,
    elo_after: outcome === "win" ? 1216 : outcome === "loss" ? 1184 : null,
    elo_delta: outcome === "win" ? 16 : outcome === "loss" ? -16 : 0,
    weight_division_gap: 0,
  };
}

function row(status: string, opts: { outcome?: "win" | "loss" | null } = {}) {
  const mine = opts.outcome ?? null;
  const theirs = mine === "win" ? "loss" : mine === "loss" ? "win" : null;
  return {
    id: "M1",
    challenge_id: null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 600,
    status,
    result: mine ? "submission" : null,
    started_at: status === "pending" ? null : "2026-09-25T12:00:00.000Z",
    completed_at: null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: null,
    participants: [participant("me-1", "Me", mine), participant("opp-1", "Opponent", theirs)],
  };
}

const EXIT = "/(app)/(tabs)/arena";

function renderWizard() {
  return render(
    <MatchFlowWizard exitHref={EXIT} exitLabel="Back to Arena" matchId="M1" currentAthleteId="me-1" />,
  );
}

let appStateHandler: ((s: string) => void) | null = null;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSyncCalls.length = 0;
  mockRow.handler = null;
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockGetMatchConfirmations.mockResolvedValue([]);
  mockDispute.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function mountAt(status: string, opts: { outcome?: "win" | "loss" | null } = {}) {
  mockGetMatchDetails.mockResolvedValue(row(status, opts));
  const screen = renderWizard();
  await flush();
  await flush();
  return screen;
}

describe("foreground re-sync (jits-vh7m, E6)", () => {
  it("moves a backgrounded live athlete to confirm, stopping the recorder first", async () => {
    const screen = await mountAt("in_progress");
    screen.getByTestId("match-step-live");

    // Opponent ended + recorded while this athlete was away.
    mockGetMatchDetails.mockResolvedValue(row("completed", { outcome: "loss" }));
    act(() => appStateHandler?.("background"));
    act(() => appStateHandler?.("active"));
    await flush();

    screen.getByTestId("match-step-confirm");
    expect(mockRecorder.stop).toHaveBeenCalled();
    // The verdict is rebuilt from the DB, because result_submitted was missed.
    expect(screen.getByTestId("confirm-verdict").props.children).toBe("YOU LOST");
  });
});

describe("missed result_submitted (jits-mzfu, C2)", () => {
  it("the result step's poll moves the athlete to confirm", async () => {
    const screen = await mountAt("in_progress");
    act(() => handlerOf("onMatchEnded")());
    await tick(800); // EndStep beat
    screen.getByTestId("match-step-result");

    mockGetMatchDetails.mockResolvedValue(row("completed", { outcome: "win" }));
    await tick(4_000);

    screen.getByTestId("match-step-confirm");
    expect(screen.getByTestId("confirm-verdict").props.children).toBe("YOU WON");
  });
});

describe("missed result_confirmed (jits-bmei, E8)", () => {
  it("first snapshot sends an unconfirmed athlete from summary back to confirm", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    screen.getByTestId("match-step-confirm");
  });

  it("the confirm poll reaches summary once both confirmations are in the DB", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-result"));
    });
    await flush();
    screen.getByText("Waiting for opponent to confirm...");

    mockGetMatchConfirmations.mockResolvedValue(["me-1", "opp-1"]);
    await tick(4_000);

    screen.getByTestId("match-step-summary");
    expect(screen.getByTestId("summary-verdict").props.children).toBe("YOU WON");
  });

  it("a rejoined channel (SUBSCRIBED) re-syncs immediately, no poll needed", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-result"));
    });
    mockGetMatchConfirmations.mockResolvedValue(["me-1", "opp-1"]);
    // The confirm step's own channel reports the rejoin.
    const confirmStepSync = mockSyncCalls[mockSyncCalls.length - 1];
    act(() => (confirmStepSync.onStatus as (s: string) => void)("SUBSCRIBED"));
    await flush();
    screen.getByTestId("match-step-summary");
  });

  it("offers a way out after a long wait on an opponent who never confirms", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-result"));
    });
    expect(screen.queryByTestId("confirm-leave")).toBeNull();
    await tick(20_000);
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-leave"));
    });
    await flush();
    screen.getByTestId("match-step-summary");
  });
});

describe("dispute reaches the other athlete (jits-wfpo, C6)", () => {
  it("by broadcast: match_disputed from the opponent moves this side to summary", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    mockGetMatchDetails.mockResolvedValue(row("disputed", { outcome: "win" }));
    act(() => handlerOf("onMatchDisputed")("opp-1"));
    await flush();
    await flush();

    screen.getByTestId("match-step-summary");
    expect(toast.info).toHaveBeenCalledWith(
      expect.objectContaining({ text1: "Result disputed" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("summary-verdict").props.children).toBe("DISPUTED"),
    );
    screen.getByTestId("summary-disputed-note");
  });

  it("by DB: a missed match_disputed is caught by the confirm poll", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    mockGetMatchDetails.mockResolvedValue(row("disputed", { outcome: "win" }));
    await tick(4_000);
    screen.getByTestId("match-step-summary");
    expect(screen.getByTestId("summary-verdict").props.children).toBe("DISPUTED");
  });

  it("the disputer broadcasts match_disputed and waits for it before leaving the step", async () => {
    let settle: (v: unknown) => void = () => {};
    mockBroadcast.broadcastMatchDisputed.mockImplementationOnce(
      () => new Promise((res) => {
        settle = res;
      }),
    );
    const screen = await mountAt("completed", { outcome: "loss" });
    await act(async () => {
      fireEvent.press(screen.getByTestId("confirm-dispute"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("dispute-submit"));
    });
    await flush();

    expect(mockBroadcast.broadcastMatchDisputed).toHaveBeenCalledWith("me-1");
    // Still on the confirm step (the dispute form) until the send settles.
    screen.getByTestId("match-step-confirm");
    await act(async () => settle("ok"));
    await flush();
    screen.getByTestId("match-step-summary");
  });

  it("ignores its own match_disputed echo", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    act(() => handlerOf("onMatchDisputed")("me-1"));
    await flush();
    screen.getByTestId("match-step-confirm");
  });
});

describe("cancel during the weight step (jits-bh2v, E3B)", () => {
  it("by broadcast: the weight step now listens and exits", async () => {
    const screen = await mountAt("pending");
    screen.getByTestId("match-step-weight");
    act(() => handlerOf("onMatchCancelled")());
    expect(mockRouterReplace).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledWith(expect.objectContaining({ text1: "Match cancelled" }));
  });

  it("by DB: a cancel missed on the weight step is caught when the ready step mounts", async () => {
    const screen = await mountAt("pending");
    mockGetMatchDetails.mockResolvedValue(row("cancelled"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("weight-confirm"));
    });
    await flush();
    expect(mockRouterReplace).toHaveBeenCalledWith(EXIT);
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
  });
});

describe("live pause re-sync is fed every snapshot", () => {
  it("a lost zero-length resume is recovered by the next (identical) poll", async () => {
    await mountAt("in_progress");
    // The opponent pauses (broadcast arrives) and resumes 0.3 s later; that
    // broadcast is lost and resume_match added 0 s, so every read is
    // identical to the mount-time row: no prop ever changes.
    act(() => handlerOf("onTimerPaused")("2026-09-25T12:01:00.000Z"));
    mockTimerSync.mockClear();
    await tick(10_000);
    expect(mockTimerSync).toHaveBeenCalledWith({ type: "resumed", totalPausedDuration: 0 });
  });
});

describe("cancel during the ready step leaves exactly once", () => {
  it("a remote cancel, then the reconciler seeing status=cancelled: one toast, one navigation", async () => {
    const screen = await mountAt("pending");
    await act(async () => {
      fireEvent.press(screen.getByTestId("weight-confirm"));
    });
    await flush();
    screen.getByTestId("match-step-ready");

    act(() => handlerOf("onMatchCancelled")());
    // The ready step's own poll (and any rejoin) now reads the cancelled row.
    mockGetMatchDetails.mockResolvedValue(row("cancelled"));
    await tick(4_000);
    await tick(4_000);

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith({
      text1: "Match cancelled",
      description: "Your opponent left the ready check.",
    });
  });
});

describe("a voided match exits the wizard", () => {
  const VOIDED_TOAST = expect.objectContaining({ text1: "Match voided" });

  it("opening a voided match exits once with a clear toast", async () => {
    await mountAt("voided", { outcome: "win" });
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(VOIDED_TOAST);
  });

  it("a dispute voided while this athlete sits on the summary exits once", async () => {
    const screen = await mountAt("disputed", { outcome: "win" });
    screen.getByTestId("match-step-summary");
    expect(mockRouterReplace).not.toHaveBeenCalled();

    mockGetMatchDetails.mockResolvedValue(row("voided", { outcome: "win" }));
    await act(async () => mockRow.handler?.({ new: { status: "voided" } }));
    await flush();
    await act(async () => mockRow.handler?.({ new: { status: "voided" } }));
    await flush();

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(EXIT);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(VOIDED_TOAST);
  });
});

describe("monotonic: a stale read never moves the wizard back", () => {
  it("an in_progress snapshot arriving on the confirm step changes nothing", async () => {
    const screen = await mountAt("completed", { outcome: "win" });
    screen.getByTestId("match-step-confirm");
    mockGetMatchDetails.mockResolvedValue(row("in_progress"));
    await tick(4_000);
    screen.getByTestId("match-step-confirm");
    // And the confirm verdict is still there (the stale row did not replace
    // the completed one in hand).
    expect(screen.getByTestId("confirm-verdict").props.children).toBe("YOU WON");
  });

  it("a pending snapshot on the live step changes nothing", async () => {
    const screen = await mountAt("in_progress");
    mockGetMatchDetails.mockResolvedValue(row("pending"));
    await tick(10_000);
    screen.getByTestId("match-step-live");
    expect(mockRecorder.stop).not.toHaveBeenCalled();
  });
});

/**
 * `matches` is now in the realtime publication (jr_be 20260925120100), and
 * record_match_result sets `completed` at RECORD time. The old
 * use-match-completion.ts took that UPDATE as "both confirmed" and skipped
 * every athlete past confirm and dispute. The row event may only trigger a
 * re-read; the decision is confirmations (or disputed).
 */
describe("a realtime matches UPDATE never skips confirmation", () => {
  async function onConfirmStep() {
    const screen = await mountAt("completed", { outcome: "win" });
    screen.getByTestId("match-step-confirm");
    return screen;
  }

  it("'completed' with zero confirmations does not advance", async () => {
    const screen = await onConfirmStep();
    mockGetMatchConfirmations.mockResolvedValue([]);
    await act(async () => mockRow.handler?.({ new: { status: "completed" } }));
    await flush();
    screen.getByTestId("match-step-confirm");
    screen.getByTestId("confirm-result");
    screen.getByTestId("confirm-dispute");
  });

  it("'completed' with only the opponent's confirmation does not advance", async () => {
    const screen = await onConfirmStep();
    mockGetMatchConfirmations.mockResolvedValue(["opp-1"]);
    await act(async () => mockRow.handler?.({ new: { status: "completed" } }));
    await flush();
    screen.getByTestId("match-step-confirm");
    // The opponent's panel shows their confirmation from the DB.
    screen.getByTestId("confirm-result");
  });

  it("'completed' with only this athlete's confirmation does not advance", async () => {
    const screen = await onConfirmStep();
    mockGetMatchConfirmations.mockResolvedValue(["me-1"]);
    await act(async () => mockRow.handler?.({ new: { status: "completed" } }));
    await flush();
    screen.getByTestId("match-step-confirm");
    screen.getByText("Waiting for opponent to confirm...");
  });

  it("advances once both confirmations exist", async () => {
    const screen = await onConfirmStep();
    mockGetMatchConfirmations.mockResolvedValue(["me-1", "opp-1"]);
    await act(async () => mockRow.handler?.({ new: { status: "completed" } }));
    await flush();
    screen.getByTestId("match-step-summary");
  });

  it("advances on 'disputed'", async () => {
    const screen = await onConfirmStep();
    mockGetMatchDetails.mockResolvedValue(row("disputed", { outcome: "win" }));
    await act(async () => mockRow.handler?.({ new: { status: "disputed" } }));
    await flush();
    screen.getByTestId("match-step-summary");
  });

  it("the recorder's own 'completed' (record -> confirm) does not skip its confirm step", async () => {
    const screen = await mountAt("in_progress");
    act(() => handlerOf("onMatchEnded")());
    await tick(800);
    screen.getByTestId("match-step-result");
    // This athlete records; the row flips to completed with no confirmations.
    mockGetMatchDetails.mockResolvedValue(row("completed", { outcome: "win" }));
    await act(async () => {
      fireEvent.press(screen.getByTestId("result-outcome-draw"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("result-record"));
    });
    await flush();
    await act(async () => mockRow.handler?.({ new: { status: "completed" } }));
    await flush();
    await tick(5_000);
    screen.getByTestId("match-step-confirm");
    screen.getByTestId("confirm-result");
  });
});
