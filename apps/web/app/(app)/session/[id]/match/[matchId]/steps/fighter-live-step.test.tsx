/**
 * Fighter live step: the DB is the authority when a pause, resume or end
 * broadcast was missed. It re-reads on tab visible and every
 * LIVE_RECONCILE_MS: re-applies the pause state, moves on once a result is
 * recorded, leaves a cancelled / voided match, and advances exactly once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { act, render } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));

const toasts = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const api = vi.hoisted(() => ({ getMatchDetails: vi.fn() }));
vi.mock("@jits/shared/api/queries", () => ({ getMatchDetails: api.getMatchDetails }));

const timer = vi.hoisted(() => ({ syncFromBroadcast: vi.fn() }));
vi.mock("@jits/shared/hooks/use-session-match-timer", () => ({
  useSessionMatchTimer: () => ({
    remaining: 120,
    running: true,
    paused: false,
    formatted: "02:00",
    syncFromBroadcast: timer.syncFromBroadcast,
  }),
}));

type SyncOpts = { onMatchEnded?: () => void };
const sync = vi.hoisted(() => ({ opts: null as null | SyncOpts, broadcastMatchEnded: vi.fn() }));
vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (opts: SyncOpts) => {
    sync.opts = opts;
    return { broadcastMatchEnded: sync.broadcastMatchEnded };
  },
}));

import { FighterLiveStep, LIVE_RECONCILE_MS } from "./fighter-live-step";

function renderStep(strict = false) {
  const onNext = vi.fn();
  const step = (
    <FighterLiveStep
      onNext={onNext}
      exitHref="/arena"
      matchId="M1"
      durationSeconds={300}
      startedAt="2026-09-26T10:00:00.000Z"
      pausedAt={null}
      totalPausedDuration={0}
      matchType="ranked"
      timekeeperEnabled={false}
      hasTimekeeper={false}
    />
  );
  const view = render(strict ? <StrictMode>{step}</StrictMode> : step);
  return Object.assign(onNext, { unmount: view.unmount });
}

const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
  });
const becomeVisible = () =>
  act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });

const row = (over: Record<string, unknown> = {}) => ({
  status: "in_progress",
  paused_at: null,
  total_paused_duration: 0,
  participants: [],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  api.getMatchDetails.mockResolvedValue(row());
});
afterEach(() => {
  vi.useRealTimers();
});

describe("FighterLiveStep reconciliation", () => {
  it("re-reads on the interval and re-applies a missed pause", async () => {
    renderStep();
    expect(api.getMatchDetails).not.toHaveBeenCalled();
    api.getMatchDetails.mockResolvedValue(row({ paused_at: "2026-09-26T10:01:00.000Z" }));
    await tick();
    expect(api.getMatchDetails).toHaveBeenCalledWith({}, "M1");
    expect(timer.syncFromBroadcast).toHaveBeenCalledWith({
      type: "paused",
      pausedAt: "2026-09-26T10:01:00.000Z",
    });
  });

  it("re-applies a missed resume with the DB's paused total", async () => {
    renderStep();
    api.getMatchDetails.mockResolvedValue(row({ total_paused_duration: 42 }));
    await becomeVisible();
    expect(timer.syncFromBroadcast).toHaveBeenCalledWith({
      type: "resumed",
      totalPausedDuration: 42,
    });
  });

  it.each(["completed", "disputed"])("moves on once the result is %s", async (status) => {
    const onNext = renderStep();
    api.getMatchDetails.mockResolvedValue(row({ status }));
    await becomeVisible();
    expect(onNext).toHaveBeenCalledTimes(1);
    await tick();
    await becomeVisible();
    // The late end broadcast does not advance a second time either.
    act(() => sync.opts?.onMatchEnded?.());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["cancelled", "This match was cancelled."],
    ["voided", "This result was voided on review. Any rating change was reversed."],
  ])("leaves a %s match for the exit", async (status, copy) => {
    const onNext = renderStep();
    api.getMatchDetails.mockResolvedValue(row({ status }));
    await tick();
    expect(toasts.info).toHaveBeenCalledWith(copy);
    expect(nav.replace).toHaveBeenCalledWith("/arena");
    expect(onNext).not.toHaveBeenCalled();
    await tick();
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });

  it("does not re-advance after the end broadcast already moved on", async () => {
    const onNext = renderStep();
    act(() => sync.opts?.onMatchEnded?.());
    api.getMatchDetails.mockResolvedValue(row({ status: "completed" }));
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("ignores a read that fails", async () => {
    const onNext = renderStep();
    api.getMatchDetails.mockResolvedValue(null);
    await tick();
    expect(onNext).not.toHaveBeenCalled();
    expect(timer.syncFromBroadcast).not.toHaveBeenCalled();
  });

  it("a read that lands after unmount does nothing", async () => {
    let release!: (v: unknown) => void;
    api.getMatchDetails.mockReturnValue(new Promise((r) => (release = r)));
    const onNext = renderStep();
    await becomeVisible();
    onNext.unmount();
    await act(async () => {
      release(row({ status: "completed" }));
    });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("still reconciles under Strict Mode (refs reset on remount)", async () => {
    const onNext = renderStep(true);
    api.getMatchDetails.mockResolvedValue(row({ status: "completed" }));
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("stops polling once unmounted", async () => {
    const onNext = renderStep();
    onNext.unmount();
    await tick();
    expect(api.getMatchDetails).not.toHaveBeenCalled();
  });
});
