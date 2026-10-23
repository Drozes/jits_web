/**
 * The wizard's three ways of moving its step (`lib/match-flow/use-wizard-sync.ts`,
 * timekeeper mode spec 6.2, ARCHITECTURE 2.2), each pinned on its own:
 *
 *  - `setStep`, the steps' setter: forward only, plus exactly the two
 *    timekeeper-mode exceptions (`isAllowedBackward`), each proven by the
 *    last snapshot the reconciler handed over: `weight` or `ready` back to
 *    `crew` after a pre-start drop-out (A5), and `summary` back to `confirm`
 *    after a result edit that reset this athlete's confirmation (A8, against
 *    the baseline fixed on entering `summary`). Never for a two-athlete match,
 *    never for the timekeeper;
 *  - the first timekeeper-mode state read, which may refine the mount step
 *    once: forward only, and never once the athlete moved the wizard (an
 *    athlete who taps ready before the read lands is not bounced back to the
 *    weigh-in; nothing would move them forward again, the reconciler never
 *    targets `ready`);
 *  - the reconciler's snapshots (their routing is `reconcile.test.ts` and
 *    `wizard-timekeeper-routing.test.tsx`); here, that the A8 baseline is the
 *    count the athlete's verdict stands on (a re-confirm after an edit, or a
 *    mount on the verdict after one), and that a step the reconciler moves
 *    in timekeeper mode re-reads the timekeeper-mode state at once.
 *
 * The reconciler and the timekeeper-mode state hook are stubbed: a test hands
 * the hook its snapshots and its state read. Where a test must show the
 * setter deciding alone, the reconciler's plan is held: the snapshot is still
 * recorded (it is the proof the setter reads), but the reconciler does not
 * move the step with it.
 */
import { act, renderHook } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";

jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));
jest.mock("@/components/ui/toast", () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }));

// The reconciler: the hook's snapshot handler, captured so a test can deliver a snapshot.
type OnSnapshot = (s: { match: MatchDetails; confirmedAthleteIds: string[] | null }) => void;
const mockReconciler: { onSnapshot: OnSnapshot | null; doneSettled: boolean | undefined } = { onSnapshot: null, doneSettled: undefined };
jest.mock("@/lib/match-flow/use-match-reconciler", () => ({
  useMatchReconciler: (p: { onSnapshot: OnSnapshot; doneSettled?: boolean }) => {
    mockReconciler.onSnapshot = p.onSnapshot;
    mockReconciler.doneSettled = p.doneSettled;
    return { reconcileNow: () => undefined, onChannelStatus: () => undefined };
  },
}));

// The timekeeper-mode state: null until a test lands a read.
const mockTk: { state: { ready: { athleteId: string; readyAt: string }[] } | null } = { state: null };
const mockTkRefresh = jest.fn();
/** The last `doneSettled` the wizard passed to the state poll. */
const mockTkPoll: { doneSettled: boolean | undefined } = { doneSettled: undefined };
jest.mock("@/lib/match-flow/use-timekeeper-state", () => ({
  timekeeperStatePollMs: (_step: unknown, _viewer: unknown, doneSettled?: boolean) => {
    mockTkPoll.doneSettled = doneSettled;
    return null;
  },
  useTimekeeperState: () => ({ state: mockTk.state, lostAccess: false, refresh: mockTkRefresh }),
}));

// The reconciler's plan, held on demand (see the header).
const mockPlan = { hold: false };
jest.mock("@/lib/match-flow/reconcile", () => {
  const actual = jest.requireActual("@/lib/match-flow/reconcile");
  return {
    ...actual,
    planReconcile: (p: unknown) => (mockPlan.hold ? { type: "none" } : actual.planReconcile(p)),
  };
});

import { useWizardSync } from "@/lib/match-flow/use-wizard-sync";
import type { MatchStep } from "@/lib/match-flow/step-router";

const ME = "me-1";
const OPP = "opp-1";
const TK = "tk-1";

function participant(id: string, name: string, outcome: string | null) {
  return {
    athlete_id: id,
    display_name: name,
    current_elo: 1200,
    current_weight: 170,
    profile_photo_url: null,
    role: "competitor",
    outcome,
    elo_before: null,
    elo_after: null,
    elo_delta: null,
    weight_division_gap: 0,
  };
}

interface RowOpts {
  /** Timekeeper mode (default) or the two-athlete flow. */
  timekeeperMode?: boolean;
  /** The seated timekeeper; null while the athletes pick. */
  timekeeperId?: string | null;
  resultEditCount?: number;
}

function row(status: string, o: RowOpts = {}): MatchDetails {
  const tkMode = o.timekeeperMode ?? true;
  const tkId = o.timekeeperId === undefined ? (tkMode ? TK : null) : o.timekeeperId;
  const done = status === "completed";
  return {
    id: "M1",
    challenge_id: null,
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status,
    result: done ? "submission" : null,
    started_at: status === "pending" ? null : "2026-10-20T12:00:00.000Z",
    completed_at: done ? "2026-10-20T12:06:00.000Z" : null,
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: tkId,
    participants: [participant(ME, "Mina Park", done ? "win" : null), participant(OPP, "Demo Okafor", done ? "loss" : null)],
    requires_timekeeper: tkMode,
    tk_weight_check_required: true,
    challenger_id: ME,
    ended_at: null,
    final_elapsed_s: null,
    timekeeper_deadline_at: null,
    cancel_reason: null,
    result_edit_count: o.resultEditCount ?? 0,
    result_edited_at: null,
    result_recorded_by_admin: false,
    timekeeper: tkId ? { id: tkId, display_name: "Jo Cruz", profile_photo_url: null } : null,
  } as unknown as MatchDetails;
}

function mount(viewerId: string, match: MatchDetails) {
  const hook = renderHook(
    ({ m }: { m: MatchDetails }) =>
      useWizardSync({
        matchId: "M1",
        currentAthleteId: viewerId,
        exitHref: "/arena",
        match: m,
        ready: true,
        // The match in hand is the test's prop: a snapshot does not replace it.
        applyMatch: () => undefined,
        refresh: () => undefined,
      }),
    { initialProps: { m: match } },
  );
  return hook;
}

function snapshot(match: MatchDetails, confirmedAthleteIds: string[] | null = []) {
  act(() => mockReconciler.onSnapshot?.({ match, confirmedAthleteIds }));
}

function setStep(hook: ReturnType<typeof mount>, next: MatchStep) {
  act(() => hook.result.current.setStep(next));
}

beforeEach(() => {
  mockReconciler.onSnapshot = null;
  mockReconciler.doneSettled = undefined;
  mockTkPoll.doneSettled = undefined;
  mockTk.state = null;
  mockPlan.hold = false;
  mockTkRefresh.mockClear();
});

describe("setStep: weight or ready back to crew (A5)", () => {
  it.each<MatchStep>(["weight", "ready"])("from %s, once the last snapshot proves a pre-start drop-out", (from) => {
    const hook = mount(ME, row("pending", { timekeeperId: null }));
    expect(hook.result.current.step).toBe("crew");
    // The last snapshot: still pending, nobody seated.
    snapshot(row("pending", { timekeeperId: null }));
    setStep(hook, "weight");
    if (from === "ready") setStep(hook, "ready");
    expect(hook.result.current.step).toBe(from);
    setStep(hook, "crew");
    expect(hook.result.current.step).toBe("crew");
  });

  it.each<MatchStep>(["weight", "ready"])("not from %s once the last snapshot has someone seated", (from) => {
    const hook = mount(ME, row("pending", { timekeeperId: null }));
    snapshot(row("pending"));
    expect(hook.result.current.step).toBe("weight");
    if (from === "ready") setStep(hook, "ready");
    setStep(hook, "crew");
    expect(hook.result.current.step).toBe(from);
  });

  it("reads the LAST snapshot: a seat after the drop-out refuses the move", () => {
    const hook = mount(ME, row("pending", { timekeeperId: null }));
    snapshot(row("pending", { timekeeperId: null }));
    setStep(hook, "weight");
    snapshot(row("pending"));
    setStep(hook, "crew");
    expect(hook.result.current.step).toBe("weight");
  });

  it("not before any snapshot has proven anything", () => {
    const hook = mount(ME, row("pending"));
    expect(hook.result.current.step).toBe("weight");
    setStep(hook, "crew");
    expect(hook.result.current.step).toBe("weight");
  });

  it("never in a two-athlete match", () => {
    const hook = mount(ME, row("pending", { timekeeperMode: false }));
    snapshot(row("pending", { timekeeperMode: false }));
    for (const from of ["weight", "ready"] as const) {
      setStep(hook, from);
      setStep(hook, "crew");
      expect(hook.result.current.step).toBe(from);
    }
  });

  it("never for the timekeeper", () => {
    const hook = mount(TK, row("pending"));
    expect(hook.result.current.step).toBe("weight");
    // Their seat gone: the snapshot is recorded, and proves nothing for them.
    snapshot(row("pending", { timekeeperId: null }));
    setStep(hook, "crew");
    expect(hook.result.current.step).toBe("weight");
  });
});

describe("setStep: summary back to confirm (A8)", () => {
  /** An athlete on their verdict at edit count 0 (the baseline), the reconciler's plan held. */
  function onVerdict(viewerId = ME, timekeeperMode = true) {
    const hook = mount(viewerId, row("completed", { timekeeperMode }));
    expect(hook.result.current.step).toBe("summary");
    mockPlan.hold = true;
    return hook;
  }

  it("once the result was edited past the baseline and their confirmation is gone", () => {
    const hook = onVerdict();
    snapshot(row("completed", { resultEditCount: 1 }), []);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("confirm");
  });

  it("not while the edit count is still the baseline", () => {
    const hook = onVerdict();
    snapshot(row("completed"), []);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
  });

  it("not while their confirmation is still listed, and the baseline is not used up by that read", () => {
    const hook = onVerdict();
    // The confirmations read straddles the edit: it still lists them.
    snapshot(row("completed", { resultEditCount: 1 }), [ME]);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
    // The next consistent read still proves it.
    snapshot(row("completed", { resultEditCount: 1 }), []);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("confirm");
  });

  it("not while the confirmations are unknown", () => {
    const hook = onVerdict();
    snapshot(row("completed", { resultEditCount: 1 }), null);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
  });

  it("never for the timekeeper (their summary is the done screen)", () => {
    const hook = onVerdict(TK);
    snapshot(row("completed", { resultEditCount: 1 }), []);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
  });

  it("never in a two-athlete match", () => {
    const hook = onVerdict(ME, false);
    snapshot(row("completed", { timekeeperMode: false, resultEditCount: 1 }), []);
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
  });
});

describe("setStep: nothing else moves back", () => {
  it.each<[MatchStep, MatchStep]>([
    ["ready", "weight"],
    ["live", "ready"],
    ["result", "live"],
    ["summary", "result"],
  ])("%s to %s is refused, whatever the snapshot", (from, to) => {
    const hook = mount(ME, row("pending", { timekeeperId: null }));
    snapshot(row("pending", { timekeeperId: null }));
    for (const s of ["weight", "ready", "live", "end", "result", "confirm", "summary"] as const) {
      setStep(hook, s);
      if (s === from) break;
    }
    expect(hook.result.current.step).toBe(from);
    setStep(hook, to);
    expect(hook.result.current.step).toBe(from);
  });
});

describe("the first timekeeper-mode state read refines the mount step", () => {
  it("moves an athlete the server already has ready from the weigh-in to ready", () => {
    const hook = mount(ME, row("pending"));
    expect(hook.result.current.step).toBe("weight");
    mockTk.state = { ready: [{ athleteId: ME, readyAt: "R" }] };
    hook.rerender({ m: row("pending") });
    expect(hook.result.current.step).toBe("ready");
  });

  it("keeps an athlete who tapped ready before the read landed on ready, though it shows them not ready", () => {
    const hook = mount(ME, row("pending"));
    setStep(hook, "ready");
    // The read was taken before their tap reached the server.
    mockTk.state = { ready: [] };
    hook.rerender({ m: row("pending") });
    expect(hook.result.current.step).toBe("ready");
  });

  it("never moves an athlete who already moved the wizard, even forward (their own move wins)", () => {
    const hook = mount(ME, row("pending"));
    // A step's own call keeps them on the weigh-in (say a re-weigh, which
    // clears their ready on the server) before the first read lands.
    setStep(hook, "weight");
    // The read was taken before that, while the server still had them ready.
    mockTk.state = { ready: [{ athleteId: ME, readyAt: "R" }] };
    hook.rerender({ m: row("pending") });
    expect(hook.result.current.step).toBe("weight");
  });

  it("never moves back: the reconciler moved on before the read landed", () => {
    const pending = row("pending");
    const hook = mount(ME, pending);
    // The start reached this phone through a snapshot (the match in hand is
    // still the pending one for this render), before any state read.
    snapshot(row("in_progress"));
    expect(hook.result.current.step).toBe("live");
    mockTk.state = { ready: [{ athleteId: ME, readyAt: "R" }] };
    hook.rerender({ m: pending });
    expect(hook.result.current.step).toBe("live");
  });

  it("refines once only: a later read never moves the step", () => {
    const hook = mount(ME, row("pending"));
    mockTk.state = { ready: [] };
    hook.rerender({ m: row("pending") });
    expect(hook.result.current.step).toBe("weight");
    mockTk.state = { ready: [{ athleteId: ME, readyAt: "R" }] };
    hook.rerender({ m: row("pending") });
    expect(hook.result.current.step).toBe("weight");
  });
});

describe("the A8 baseline: the edit count the athlete's verdict stands on", () => {
  it("re-confirming after an edit enters the verdict at that count: a stale read at it never sends them back", () => {
    const hook = mount(ME, row("completed"));
    expect(hook.result.current.step).toBe("summary");
    // The timekeeper edits (count 1), resetting both confirmations: back to confirm.
    snapshot(row("completed", { resultEditCount: 1 }), []);
    expect(hook.result.current.step).toBe("confirm");
    // They confirm again at count 1: the confirm step completes into the verdict.
    setStep(hook, "summary");
    expect(hook.result.current.step).toBe("summary");
    // A read issued before that re-confirm committed: count 1, their confirmation not listed yet.
    snapshot(row("completed", { resultEditCount: 1 }), []);
    expect(hook.result.current.step).toBe("summary");
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
    // Only a second edit sends them back.
    snapshot(row("completed", { resultEditCount: 2 }), []);
    expect(hook.result.current.step).toBe("confirm");
  });

  it("mounting on the verdict after an edit, already re-confirmed, stands on that count too", () => {
    const hook = mount(ME, row("completed", { resultEditCount: 1 }));
    expect(hook.result.current.step).toBe("summary");
    snapshot(row("completed", { resultEditCount: 1 }), [ME]);
    expect(hook.result.current.step).toBe("summary");
    // A stale read at the same count that misses their confirmation.
    snapshot(row("completed", { resultEditCount: 1 }), []);
    expect(hook.result.current.step).toBe("summary");
    setStep(hook, "confirm");
    expect(hook.result.current.step).toBe("summary");
    snapshot(row("completed", { resultEditCount: 2 }), []);
    expect(hook.result.current.step).toBe("confirm");
  });
});

describe("a step the reconciler moves re-reads the timekeeper-mode state at once", () => {
  it("in timekeeper mode, on each move (a seat, the start, the end), not at the next poll", () => {
    const hook = mount(ME, row("pending", { timekeeperId: null }));
    expect(hook.result.current.step).toBe("crew");
    mockTkRefresh.mockClear();
    snapshot(row("pending"));
    expect(hook.result.current.step).toBe("weight");
    expect(mockTkRefresh).toHaveBeenCalledTimes(1);
    snapshot(row("in_progress"));
    expect(hook.result.current.step).toBe("live");
    expect(mockTkRefresh).toHaveBeenCalledTimes(2);
    snapshot({ ...row("in_progress"), ended_at: "2026-10-20T12:05:00.000Z" } as MatchDetails);
    expect(hook.result.current.step).toBe("result");
    expect(mockTkRefresh).toHaveBeenCalledTimes(3);
  });

  it("not for a snapshot that leaves the step where it is", () => {
    mount(ME, row("pending"));
    mockTkRefresh.mockClear();
    snapshot(row("pending"));
    expect(mockTkRefresh).not.toHaveBeenCalled();
  });

  it("never in a two-athlete match", () => {
    const hook = mount(ME, row("pending", { timekeeperMode: false }));
    mockTkRefresh.mockClear();
    snapshot(row("in_progress", { timekeeperMode: false }));
    expect(hook.result.current.step).toBe("live");
    expect(mockTkRefresh).not.toHaveBeenCalled();
  });
});

describe("the timekeeper's done screen stops both polls once nothing on it can change (jits-o47s.44)", () => {
  const settled = () => [mockReconciler.doneSettled, mockTkPoll.doneSettled];

  it("polls while a confirmation is owed, and stops on the snapshot that lists both", () => {
    mount(TK, row("completed"));
    expect(settled()).toEqual([false, false]);
    snapshot(row("completed"), [ME]);
    expect(settled()).toEqual([false, false]);
    snapshot(row("completed"), [ME, OPP]);
    expect(settled()).toEqual([true, true]);
  });

  it("keeps the last known confirmations through a read that could not list them", () => {
    mount(TK, row("completed"));
    snapshot(row("completed"), [ME, OPP]);
    snapshot(row("completed"), null);
    expect(settled()).toEqual([true, true]);
  });

  it("stops on a voided match and keeps polling a disputed one", () => {
    const hook = mount(TK, row("disputed"));
    snapshot(row("disputed"), [ME, OPP]);
    expect(settled()).toEqual([false, false]);
    hook.rerender({ m: row("voided") });
    expect(settled()).toEqual([true, true]);
  });
});
