/**
 * `useStepMatchSync` (lib/match-flow/match-sync-context.tsx), the one hook
 * every wizard step opens the match channel through:
 *
 *  - a two-athlete match gets the hook exactly as it was: the step's own
 *    handlers reach the channel, the handle is `useSessionMatchSync`'s own,
 *    and a cancel is sent without `actor_id`;
 *  - timekeeper mode (the wizard provides `timekeeperModeSelfId`): a
 *    received `match_cancelled` never reaches the step's handler (M-R8); it
 *    records who cancelled (`noteCancelActor`, TK-E1) and re-reads, and the
 *    cancel this phone sends names this phone's athlete.
 */
import * as React from "react";
import { renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

type Params = Record<string, unknown> & { onMatchCancelled?: (actorId?: string) => void };
let mockParams: Params | null = null;
const mockSendCancel = jest.fn((_actorId?: string | null) => Promise.resolve("ok"));
const mockHandle = { broadcastMatchCancelled: mockSendCancel, broadcastReady: jest.fn() };
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (p: Params) => {
    mockParams = p;
    return mockHandle;
  },
}));

import { MatchSyncProvider, useStepMatchSync } from "@/lib/match-flow/match-sync-context";

const reconcileNow = jest.fn();
const noteCancelActor = jest.fn();
const onChannelStatus = jest.fn();
const BASE = {
  onChannelStatus,
  reconcileNow,
  markExiting: jest.fn(),
  subscribeSnapshot: () => () => {},
  noteCancelActor,
};

function mount(value: React.ComponentProps<typeof MatchSyncProvider>["value"] | null) {
  const onMatchCancelled = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    value ? <MatchSyncProvider value={value}>{children}</MatchSyncProvider> : <>{children}</>;
  const hook = renderHook(() => useStepMatchSync({ matchId: "M1", onMatchCancelled }), { wrapper });
  return { hook, onMatchCancelled };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = null;
});

describe("a two-athlete match", () => {
  it("passes the step's handlers through and returns the channel's own handle", () => {
    const { hook, onMatchCancelled } = mount(BASE);
    expect(mockParams?.onMatchCancelled).toBe(onMatchCancelled);
    expect(mockParams).toMatchObject({ matchId: "M1", supabase: { tag: "client" }, onStatus: onChannelStatus });
    expect(hook.result.current).toBe(mockHandle);
    mockParams?.onMatchCancelled?.();
    expect(onMatchCancelled).toHaveBeenCalledTimes(1);
    expect(reconcileNow).not.toHaveBeenCalled();
  });

  it("sends a cancel without an actor", async () => {
    const { hook } = mount(BASE);
    await hook.result.current.broadcastMatchCancelled();
    expect(mockSendCancel).toHaveBeenCalledWith();
  });

  it("is the same outside a wizard (no provider)", () => {
    const { hook, onMatchCancelled } = mount(null);
    expect(mockParams?.onMatchCancelled).toBe(onMatchCancelled);
    expect(hook.result.current).toBe(mockHandle);
  });
});

describe("timekeeper mode", () => {
  const TK_MODE = { ...BASE, timekeeperModeSelfId: "me-1" };

  it("a received cancel records who cancelled and re-reads, never the step's own exit (M-R8, TK-E1)", () => {
    const { onMatchCancelled } = mount(TK_MODE);
    mockParams?.onMatchCancelled?.("opp-1");
    expect(noteCancelActor).toHaveBeenCalledWith("opp-1");
    expect(reconcileNow).toHaveBeenCalledTimes(1);
    expect(onMatchCancelled).not.toHaveBeenCalled();
  });

  it("a received cancel that names nobody only re-reads", () => {
    mount(TK_MODE);
    mockParams?.onMatchCancelled?.();
    expect(noteCancelActor).not.toHaveBeenCalled();
    expect(reconcileNow).toHaveBeenCalledTimes(1);
  });

  it("the cancel this phone sends names this phone's athlete, unless the caller names someone", async () => {
    const { hook } = mount(TK_MODE);
    await hook.result.current.broadcastMatchCancelled();
    expect(mockSendCancel).toHaveBeenLastCalledWith("me-1");
    await hook.result.current.broadcastMatchCancelled("tk-1");
    expect(mockSendCancel).toHaveBeenLastCalledWith("tk-1");
    // Every other send is the channel's own.
    expect(hook.result.current.broadcastReady).toBe(mockHandle.broadcastReady);
  });

  it("keeps the status forwarding to the reconciler", () => {
    mount(TK_MODE);
    expect(mockParams?.onStatus).toBe(onChannelStatus);
  });
});
