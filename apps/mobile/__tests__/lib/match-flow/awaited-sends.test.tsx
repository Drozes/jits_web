/**
 * Send-before-unmount (jits-mzfu). A step that is about to unmount (and so
 * remove its `session-match` channel) must give its broadcast a bounded
 * chance to leave the device first:
 *  - result_submitted before onRecorded (use-record-result.ts),
 *  - match_ended before onEnded (use-live-controls.ts),
 *  - ready_signal repeats until the opponent's arrives (ready-step.tsx).
 * And a failed record re-syncs from the DB right away.
 */
import * as React from "react";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#aaa", statePositive: "#0f0" }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

const mockRecord = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  recordMatchResult: (...a: unknown[]) => mockRecord(...a),
  pauseMatch: jest.fn(),
  resumeMatch: jest.fn(),
  startMatch: jest.fn(),
  cancelSessionMatch: jest.fn(),
}));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
}));

type Handlers = Record<string, unknown>;
let mockLastParams: Handlers | null = null;
const mockSend = {
  broadcastResultSubmitted: jest.fn(),
  broadcastMatchEnded: jest.fn(),
  broadcastReady: jest.fn(),
  broadcastTimerStarted: jest.fn(),
  broadcastMatchCancelled: jest.fn(),
};
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: Handlers) => {
    mockLastParams = p;
    return mockSend;
  },
}));

import { useRecordResult } from "@/lib/match-flow/use-record-result";
import { useLiveControls } from "@/lib/match-flow/use-live-controls";
import { MatchSyncProvider, SEND_GRACE_MS } from "@/lib/match-flow/match-sync-context";
import { ReadyStep } from "@/components/match-flow/steps/ready-step";
import { startMatch } from "@jits/shared/api/mutations";

function deferred() {
  let resolve: (v: unknown) => void = () => {};
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockLastParams = null;
  mockRecord.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useRecordResult awaits result_submitted before onRecorded", () => {
  it("does not advance until the broadcast settles", async () => {
    const d = deferred();
    mockSend.broadcastResultSubmitted.mockReturnValue(d.promise);
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));

    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    await flush();
    expect(mockSend.broadcastResultSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ result: "draw" }),
    );
    expect(onRecorded).not.toHaveBeenCalled();

    await act(async () => d.resolve("ok"));
    await flush();
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ result: "draw" }));
  });

  it("advances anyway once the grace period runs out (a dead socket never blocks)", async () => {
    mockSend.broadcastResultSubmitted.mockReturnValue(new Promise(() => {}));
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));

    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    await flush();
    expect(onRecorded).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(SEND_GRACE_MS);
    });
    await flush();
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("ignores the opponent's result_submitted while its own send is settling (no double advance)", async () => {
    const d = deferred();
    mockSend.broadcastResultSubmitted.mockReturnValue(d.promise);
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }));
    await act(async () => {
      void result.current.submit({ outcome: "draw" });
    });
    await flush();
    act(() => (mockLastParams?.onResultSubmitted as (r: unknown) => void)({ result: "draw" }));
    await act(async () => d.resolve("ok"));
    await flush();
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("re-syncs from the DB when the record fails (the opponent probably recorded first)", async () => {
    mockRecord.mockResolvedValue({ ok: false, error: { message: "Match is not in progress" } });
    const reconcileNow = jest.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatchSyncProvider
        value={{ onChannelStatus: jest.fn(), reconcileNow, markExiting: jest.fn(), subscribeSnapshot: () => () => {} }}
      >
        {children}
      </MatchSyncProvider>
    );
    const onRecorded = jest.fn();
    const { result } = renderHook(() => useRecordResult({ matchId: "M1", onRecorded }), {
      wrapper,
    });
    await act(async () => {
      await result.current.submit({ outcome: "draw" });
    });
    expect(reconcileNow).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("forwards its channel's status to the wizard's reconciler", () => {
    const onChannelStatus = jest.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatchSyncProvider
        value={{ onChannelStatus, reconcileNow: jest.fn(), markExiting: jest.fn(), subscribeSnapshot: () => () => {} }}
      >
        {children}
      </MatchSyncProvider>
    );
    renderHook(() => useRecordResult({ matchId: "M1", onRecorded: jest.fn() }), { wrapper });
    (mockLastParams?.onStatus as (s: string) => void)("SUBSCRIBED");
    expect(onChannelStatus).toHaveBeenCalledWith("SUBSCRIBED");
  });
});

describe("useLiveControls awaits match_ended before onEnded", () => {
  function setup() {
    const onEnded = jest.fn();
    const endedRef = { current: false };
    const timer = { paused: false, syncFromBroadcast: jest.fn() } as never;
    const hook = renderHook(() =>
      useLiveControls({
        matchId: "M1",
        timer,
        sync: mockSend as never,
        endedRef,
        onEnded,
      }),
    );
    return { onEnded, endedRef, ...hook };
  }

  it("holds the step (busy) until the broadcast settles, then advances once", async () => {
    const d = deferred();
    mockSend.broadcastMatchEnded.mockReturnValue(d.promise);
    const { result, onEnded } = setup();
    act(() => result.current.handleEnd());
    expect(mockSend.broadcastMatchEnded).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe("end");
    expect(onEnded).not.toHaveBeenCalled();
    // A second tap is a no-op.
    act(() => result.current.handleEnd());
    expect(mockSend.broadcastMatchEnded).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve("ok"));
    await flush();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("advances after the grace period when the socket is dead", async () => {
    mockSend.broadcastMatchEnded.mockReturnValue(new Promise(() => {}));
    const { result, onEnded } = setup();
    act(() => result.current.handleEnd());
    await act(async () => {
      jest.advanceTimersByTime(SEND_GRACE_MS);
    });
    await flush();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});

describe("ReadyStep repeats ready_signal until the opponent's arrives", () => {
  it("re-sends while waiting and stops once the opponent is ready", async () => {
    mockSend.broadcastReady.mockResolvedValue("ok");
    // The start race that follows both-ready is not under test: hold it.
    (startMatch as jest.Mock).mockReturnValue(new Promise(() => {}));
    const screen = render(
      <ReadyStep
        exitHref="/(app)/(tabs)/arena"
        onCancelledRemotely={jest.fn()}
        matchId="M1"
        currentAthleteId="me-1"
        opponentId="opp-1"
        onStarted={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText("Ready"));
    expect(mockSend.broadcastReady).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(6_000);
    });
    expect(mockSend.broadcastReady).toHaveBeenCalledTimes(3);
    expect(mockSend.broadcastReady).toHaveBeenLastCalledWith("me-1");

    // The opponent's ready lands: repeating stops (the start race begins).
    act(() => (mockLastParams?.onReadySignal as (id: string) => void)("opp-1"));
    const before = mockSend.broadcastReady.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(mockSend.broadcastReady.mock.calls.length).toBe(before);
    screen.unmount();
  });
});
