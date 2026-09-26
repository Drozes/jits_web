/**
 * Ready check: the DB is the authority when a broadcast is missed.
 *  - Losing the start_match race is not an error: re-read and advance.
 *  - timer_started from the opponent advances even while our own start call
 *    is still in flight.
 *  - A cancel that happened before this step joined (during weight verify)
 *    is picked up from the DB and leaves for the exit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));

const toasts = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const api = vi.hoisted(() => ({
  startMatch: vi.fn(),
  cancelSessionMatch: vi.fn(),
  getMatchDetails: vi.fn(),
}));
vi.mock("@jits/shared/api/mutations", () => ({
  startMatch: api.startMatch,
  cancelSessionMatch: api.cancelSessionMatch,
}));
vi.mock("@jits/shared/api/queries", () => ({ getMatchDetails: api.getMatchDetails }));

type SyncOpts = {
  onReadySignal?: (id: string) => void;
  onTimerStarted?: (startedAt: string) => void;
  onMatchCancelled?: () => void;
};
const sync = vi.hoisted(() => ({
  opts: null as null | SyncOpts,
  broadcastReady: vi.fn(),
  broadcastTimerStarted: vi.fn(),
  broadcastMatchCancelled: vi.fn(),
}));
vi.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (opts: SyncOpts) => {
    sync.opts = opts;
    return {
      broadcastReady: sync.broadcastReady,
      broadcastTimerStarted: sync.broadcastTimerStarted,
      broadcastMatchCancelled: sync.broadcastMatchCancelled,
    };
  },
}));

import { ReadyCheckStep } from "./ready-check-step";

const STARTED = "2026-09-26T10:00:00.000Z";

function renderStep() {
  const onNext = vi.fn();
  const view = render(
    <ReadyCheckStep
      onNext={onNext}
      exitHref="/arena"
      matchId="M1"
      currentAthleteId="me"
      opponentId="op"
      timekeeperEnabled={false}
      hasTimekeeper={false}
      isTimekeeper={false}
    />,
  );
  return Object.assign(onNext, { unmount: view.unmount });
}

async function bothReady() {
  fireEvent.click(screen.getByRole("button", { name: "Ready" }));
  await act(async () => sync.opts?.onReadySignal?.("op"));
}

beforeEach(() => {
  vi.clearAllMocks();
  sync.opts = null;
  api.getMatchDetails.mockResolvedValue({ status: "pending", started_at: null });
});

describe("ReadyCheckStep", () => {
  it("advances with the DB started_at when it loses the start_match race", async () => {
    const onNext = renderStep();
    await waitFor(() => expect(api.getMatchDetails).toHaveBeenCalled());
    api.startMatch.mockResolvedValue({ ok: false, error: { message: "already started" } });
    api.getMatchDetails.mockResolvedValue({ status: "in_progress", started_at: STARTED });

    await bothReady();

    await waitFor(() => expect(onNext).toHaveBeenCalledWith({ startedAt: STARTED }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("toasts and stays when start fails and the match did not start", async () => {
    const onNext = renderStep();
    api.startMatch.mockResolvedValue({ ok: false, error: { message: "boom" } });

    await bothReady();

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("boom"));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("honours timer_started while its own start call is in flight", async () => {
    const onNext = renderStep();
    let resolveStart: (v: unknown) => void = () => {};
    api.startMatch.mockReturnValue(new Promise((r) => (resolveStart = r)));

    await bothReady();
    expect(api.startMatch).toHaveBeenCalledTimes(1);

    await act(async () => sync.opts?.onTimerStarted?.(STARTED));
    expect(onNext).toHaveBeenCalledWith({ startedAt: STARTED });

    // The late success must not advance a second time.
    await act(async () => resolveStart({ ok: true, data: { started_at: STARTED } }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("leaves for the exit when the DB says the match was cancelled", async () => {
    api.getMatchDetails.mockResolvedValue({ status: "cancelled", started_at: null });
    const onNext = renderStep();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/arena"));
    expect(toasts.info).toHaveBeenCalledWith("This match was cancelled.");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("advances when the DB shows the match already running", async () => {
    api.getMatchDetails.mockResolvedValue({ status: "in_progress", started_at: STARTED });
    const onNext = renderStep();
    await waitFor(() => expect(onNext).toHaveBeenCalledWith({ startedAt: STARTED }));
  });

  it("does not poll while its own start call is in flight", async () => {
    vi.useFakeTimers();
    try {
      const onNext = renderStep();
      await act(async () => {});
      let resolveStart: (v: unknown) => void = () => {};
      api.startMatch.mockReturnValue(new Promise((r) => (resolveStart = r)));
      await bothReady();
      const polls = api.getMatchDetails.mock.calls.length;
      api.getMatchDetails.mockResolvedValue({ status: "in_progress", started_at: STARTED });

      await act(async () => {
        vi.advanceTimersByTime(9_000);
      });
      expect(api.getMatchDetails.mock.calls.length).toBe(polls);
      expect(onNext).not.toHaveBeenCalled();

      // Our own start wins: timer_started goes out before we advance.
      await act(async () => resolveStart({ ok: true, data: { started_at: STARTED } }));
      expect(sync.broadcastTimerStarted).toHaveBeenCalledWith(STARTED);
      expect(onNext).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing after unmount when a late start answer lands", async () => {
    const onNext = renderStep();
    let resolveStart: (v: unknown) => void = () => {};
    api.startMatch.mockReturnValue(new Promise((r) => (resolveStart = r)));
    await bothReady();
    onNext.unmount();
    await act(async () => resolveStart({ ok: false, error: { message: "late" } }));
    expect(toasts.error).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(api.getMatchDetails).toHaveBeenCalledTimes(1);
  });

  describe("under React Strict Mode (next dev mounts, cleans up, remounts)", () => {
    function renderStrict() {
      const onNext = vi.fn();
      render(
        <StrictMode>
          <ReadyCheckStep
            onNext={onNext}
            exitHref="/arena"
            matchId="M1"
            currentAthleteId="me"
            opponentId="op"
            timekeeperEnabled={false}
            hasTimekeeper={false}
            isTimekeeper={false}
          />
        </StrictMode>,
      );
      return onNext;
    }

    it("advances on the opponent's timer_started", async () => {
      const onNext = renderStrict();
      await act(async () => sync.opts?.onTimerStarted?.(STARTED));
      expect(onNext).toHaveBeenCalledWith({ startedAt: STARTED });
    });

    it("starts, broadcasts and advances when both are ready", async () => {
      api.startMatch.mockResolvedValue({ ok: true, data: { started_at: STARTED } });
      const onNext = renderStrict();
      await bothReady();
      await waitFor(() => expect(onNext).toHaveBeenCalledWith({ startedAt: STARTED }));
      expect(sync.broadcastTimerStarted).toHaveBeenCalledWith(STARTED);
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it("still exits on a cancelled match read from the DB", async () => {
      api.getMatchDetails.mockResolvedValue({ status: "cancelled", started_at: null });
      renderStrict();
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/arena"));
    });
  });

  it("exits once on an opponent cancel broadcast", async () => {
    renderStep();
    await act(async () => sync.opts?.onMatchCancelled?.());
    await act(async () => sync.opts?.onMatchCancelled?.());
    expect(nav.replace).toHaveBeenCalledTimes(1);
  });
});
