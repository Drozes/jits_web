/**
 * The timekeeper's result edit (timekeeper mode A8, A24; spec 4.2 Result
 * edit, 11; TEST-PLAN 3.2 `result-edit`): `Edit result` (TK-ED1) opens the
 * result form prefilled with the result on record, TK-ED2 under it, on the
 * full list (A12), saved with `Save changes` (TK-ED3) through
 * `edit_match_result` at the edit count it opened on. Saved: TK-ED4, back to
 * the done screen and a re-read. Refused: TK-ED7, back to the done screen
 * when the edit can no longer succeed (and never a DomainError message,
 * M-R4), the form kept for a retry otherwise. `Save changes` stays off
 * while the form still holds the result on record (an unchanged save would
 * still be an edit on the server). `Back` leaves without saving; the form
 * closes when the window does.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { SubmissionType } from "@jits/shared/types/submission-type";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
    info: (...a: unknown[]) => mockToast.info(...a),
  },
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14", textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));
const mockReconcile = jest.fn();
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: mockReconcile }),
  useStepMatchSync: () => ({}),
}));
jest.mock("@/components/match-flow/match-upload-line", () => ({ MatchUploadLine: () => null }));
jest.mock("@/lib/video/match-upload-store", () => ({ useMatchUpload: () => null }));
jest.mock("@/lib/video/upload-capabilities", () => ({ isBackgroundUploadSupported: () => false }));
const mockEdit = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  editMatchResult: (...a: unknown[]) => mockEdit(...a),
  ratedWeightOf: jest.requireActual("@jits/shared/api/timekeeper").ratedWeightOf,
}));

import { TimekeeperDone } from "@/components/match-flow/steps/timekeeper-done";
import { recordedResultOf } from "@/components/match-flow/steps/result-edit-entry";
import { ResultForm } from "@/components/match-flow/steps/result-form";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { readMatchExtras } from "@/lib/match-flow/match-extras";

const NOW = Date.parse("2026-10-20T12:10:00Z");

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [type("rear_naked_choke", "Rear Naked Choke", 1), type("armbar", "Armbar", 2), type("toe_hold", "Toe Hold", 3), type("other", "Other Submission", 4)];

const participant = (id: string, name: string, outcome: string | null) => ({
  athlete_id: id,
  display_name: name,
  current_elo: 1500,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome,
  elo_before: null,
  elo_after: null,
  elo_delta: null,
  weight_division_gap: null,
});

function matchOf(overrides: Record<string, unknown> = {}): MatchDetails {
  return {
    id: "M1",
    challenge_id: "C1",
    session_id: null,
    match_type: "ranked",
    duration_seconds: 300,
    status: "completed",
    result: "submission",
    started_at: "2026-10-20T12:00:00Z",
    completed_at: "2026-10-20T12:05:00Z",
    paused_at: null,
    total_paused_duration: 0,
    timekeeper_id: "tk",
    participants: [participant("op", "Dayo Okafor", "loss"), participant("ch", "Marco Reyes", "win")],
    requires_timekeeper: true,
    tk_weight_check_required: false,
    challenger_id: "ch",
    final_elapsed_s: 228,
    result_edit_count: 2,
    result_recorded_by_admin: false,
    timekeeper: { id: "tk", display_name: "Jamal Cruz", profile_photo_url: null },
    winner_id: "ch",
    submission_type_code: "armbar",
    submission_name: "Armbar",
    finish_time_seconds: 95,
    ...overrides,
  } as unknown as MatchDetails;
}

const STATE = {
  ready: [],
  athleteChecks: [],
  timekeeperChecks: [],
  openRequest: null,
  lastRequestOutcome: null,
  presence: "online",
  offlineSince: null,
  noContestAt: null,
  reviewPending: false,
  timeoutAt: null,
  weights: [],
  editOpen: true,
  editClosesAt: new Date(NOW + 60_000).toISOString(),
  startBlockers: [],
} as TimekeeperMatchState;

function screenFor(match: MatchDetails, tkState: TimekeeperMatchState = STATE) {
  const roles = deriveMatchRoles(match, "tk")!;
  return (
    <MatchFlowProvider match={match} roles={roles} tkState={tkState}>
      <TimekeeperDone
        matchId="M1"
        exitHref="/"
        durationSeconds={300}
        submissionTypes={TYPES}
        confirmedAthleteIds={[]}
        resultData={null}
        extras={readMatchExtras(match)}
      />
    </MatchFlowProvider>
  );
}

function openEdit() {
  const s = render(screenFor(matchOf()));
  fireEvent.press(s.getByText("Edit result"));
  return s;
}

/** Change the finish from the recorded Armbar: an unchanged form cannot be saved. */
function changeFinish(s: ReturnType<typeof render>) {
  fireEvent.press(s.getByTestId("result-submission-toe_hold"));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  mockEdit.mockResolvedValue({ ok: true, data: { resultEditCount: 3 } });
});
afterEach(() => jest.useRealTimers());

describe("the edit form", () => {
  it("opens prefilled with the result on record, on the full list, TK-ED2 under it", () => {
    const s = openEdit();
    s.getByTestId("timekeeper-done-edit");
    s.getByText("Edit result");
    s.getByText("Fix the result. M. Reyes and D. Okafor confirm it again.");
    expect(s.getByTestId("result-winner-chip")).toHaveTextContent(/M\. Reyes/);
    s.getByTestId("result-submission-list");
    expect(s.getByTestId("result-submission-armbar").props.accessibilityState).toEqual({ selected: true });
    expect(s.getByTestId("result-finish-time").props.value).toBe("01:35");
    s.getByText("Save changes");
    s.getByText("ENDED AT 03:48");
  });

  it("the tiles show the athletes' rated weights from the timekeeper-mode state, never the profile weight (PM26)", () => {
    // Profile weights (current_weight) are 170 for both; the face-off re-weighed them.
    const rated = { ...STATE, weights: [{ athleteId: "ch", weight: 181.5 }, { athleteId: "op", weight: 176.2 }] };
    const s = render(screenFor(matchOf(), rated));
    fireEvent.press(s.getByText("Edit result"));
    fireEvent.press(s.getByTestId("result-change"));
    expect(s.getByTestId("result-winner-ch")).toHaveTextContent(/1500 · 181\.5 LBS/);
    expect(s.getByTestId("result-winner-op")).toHaveTextContent(/1500 · 176\.2 LBS/);
    expect(s.queryByText(/170 LBS/)).toBeNull();
  });

  it("before the state's weights land, the tiles show no weight rather than the profile weight (PM26)", () => {
    const s = openEdit();
    fireEvent.press(s.getByTestId("result-change"));
    expect(s.getByTestId("result-winner-ch")).toHaveTextContent(/1500/);
    expect(s.queryByText(/LBS/)).toBeNull();
  });

  it("saves the corrected result at the edit count it opened on: TK-ED4, back, and a re-read", async () => {
    const s = openEdit();
    fireEvent.press(s.getByTestId("result-submission-toe_hold"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockEdit).toHaveBeenCalledWith(
      { tag: "client" },
      { matchId: "M1", result: "submission", winnerId: "ch", submissionTypeCode: "toe_hold", finishTimeSeconds: 95, expectedEditCount: 2 },
    );
    expect(mockToast.success).toHaveBeenCalledWith({ text1: "Result updated", description: "M. Reyes and D. Okafor confirm it again." });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    s.getByTestId("timekeeper-done");
  });

  it("after a save, Edit result waits for the saved result's read: no stale prefill, no stale count", async () => {
    const s = openEdit();
    fireEvent.press(s.getByTestId("result-submission-toe_hold"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    s.getByTestId("timekeeper-done");
    // The re-read has not landed: the match in hand is still the result before the save, at count 2.
    expect(s.getByTestId("result-edit-open").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(s.getByTestId("result-edit-open"));
    expect(s.queryByTestId("timekeeper-done-edit")).toBeNull();
    // The read lands: count 3, the saved finish.
    s.rerender(screenFor(matchOf({ result_edit_count: 3, submission_type_code: "toe_hold", submission_name: "Toe Hold" })));
    expect(s.getByTestId("result-edit-open").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(s.getByTestId("result-edit-open"));
    expect(s.getByTestId("result-submission-toe_hold").props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(s.getByTestId("result-submission-rear_naked_choke"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockEdit).toHaveBeenLastCalledWith({ tag: "client" }, expect.objectContaining({ submissionTypeCode: "rear_naked_choke", expectedEditCount: 3 }));
  });

  it("a failed save leaves Edit result as it was", async () => {
    mockEdit.mockResolvedValue({ ok: false, error: { code: "EDIT_WINDOW_CLOSED", message: "server words" } });
    const s = render(screenFor(matchOf(), { ...STATE, editClosesAt: new Date(NOW + 60_000).toISOString() }));
    fireEvent.press(s.getByText("Edit result"));
    changeFinish(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    s.getByTestId("timekeeper-done");
    expect(s.getByTestId("result-edit-open").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("a change to a draw sends no winner, finish or time", async () => {
    const s = openEdit();
    fireEvent.press(s.getByTestId("result-change"));
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockEdit).toHaveBeenCalledWith(
      { tag: "client" },
      { matchId: "M1", result: "draw", winnerId: null, submissionTypeCode: null, finishTimeSeconds: null, expectedEditCount: 2 },
    );
  });

  it("keeps the edit count it opened on when a newer one is read while it is open (R17, A8)", async () => {
    mockEdit.mockResolvedValue({ ok: false, error: { code: "RESULT_CHANGED", message: "server words" } });
    const s = openEdit();
    // A newer result is read while the form is open (the timekeeper's own earlier save, or a second device).
    s.rerender(screenFor(matchOf({ result_edit_count: 3, submission_type_code: "rear_naked_choke", submission_name: "Rear Naked Choke" })));
    s.getByTestId("timekeeper-done-edit");
    // The form still shows what it opened with.
    expect(s.getByTestId("result-submission-armbar").props.accessibilityState).toEqual({ selected: true });
    changeFinish(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockEdit).toHaveBeenCalledWith(
      { tag: "client" },
      { matchId: "M1", result: "submission", winnerId: "ch", submissionTypeCode: "toe_hold", finishTimeSeconds: 95, expectedEditCount: 2 },
    );
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't change the result" });
    s.getByTestId("timekeeper-done");
  });

  it.each([
    "EDIT_WINDOW_CLOSED",
    "EDIT_CLOSED_DISPUTED",
    "EDIT_CLOSED_CONFIRMED",
    "EDIT_CLOSED_ADMIN",
    "RESULT_CHANGED",
    // `invalid_status`: the match is no longer a completed result (an edit racing a dispute, A27).
    "MATCH_NOT_PENDING",
    "NOT_TIMEKEEPER",
    "NOT_TIMEKEEPER_MODE",
  ])(
    "refused %s: TK-ED7 and back to the done screen, never the error's message",
    async (code) => {
      mockEdit.mockResolvedValue({ ok: false, error: { code, message: "server words" } });
      const s = openEdit();
      changeFinish(s);
      await act(async () => {
        fireEvent.press(s.getByTestId("result-record"));
      });
      expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't change the result" });
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockReconcile).toHaveBeenCalledTimes(1);
      s.getByTestId("timekeeper-done");
    },
  );

  it("a refusal the timekeeper can fix (INVALID_RESULT, invalid_finish_time): TK-ED7 and the form stays", async () => {
    mockEdit.mockResolvedValue({ ok: false, error: { code: "INVALID_RESULT", message: "server words" } });
    const s = openEdit();
    changeFinish(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't change the result" });
    s.getByTestId("timekeeper-done-edit");
    expect(s.queryByText("server words")).toBeNull();
  });

  it("a failure that a retry can fix (offline): TK-ED7 and the form stays", async () => {
    mockEdit.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "Network request failed" } });
    const s = openEdit();
    changeFinish(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    expect(mockToast.error).toHaveBeenCalledWith({ text1: "Couldn't change the result" });
    s.getByTestId("timekeeper-done-edit");
    expect(s.queryByText("Network request failed")).toBeNull();
  });

  it("a second save while the first is in flight sends nothing more", async () => {
    let reply: (v: unknown) => void = () => {};
    mockEdit.mockReturnValue(new Promise((r) => (reply = r)));
    const s = openEdit();
    changeFinish(s);
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    // The edit form's busy label (TK-ED3), never the record form's default.
    s.getByText("Saving...");
    expect(s.queryByText("Recording...")).toBeNull();
    expect(s.queryByText("Save changes")).toBeNull();
    // The form is busy; a submit that reaches it anyway (the form's own button is disabled) is ignored.
    await act(async () => {
      s.UNSAFE_getByType(ResultForm).props.onSubmit({ outcome: "draw", winnerId: "", submissionCode: "", finishTimeStr: "" });
    });
    expect(mockEdit).toHaveBeenCalledTimes(1);
    await act(async () => {
      reply({ ok: true, data: { resultEditCount: 3 } });
    });
    s.getByTestId("timekeeper-done");
  });

  it("an unchanged form cannot be saved: Save changes stays off and edit_match_result is never called", async () => {
    const s = openEdit();
    const save = () => s.getByTestId("result-record");
    expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => {
      fireEvent.press(save());
    });
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    s.getByTestId("timekeeper-done-edit");
    // A change and its undo leave nothing to save.
    changeFinish(s);
    expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(s.getByTestId("result-submission-armbar"));
    expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => {
      fireEvent.press(save());
    });
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it("Back leaves without saving", () => {
    const s = openEdit();
    fireEvent.press(s.getByTestId("result-edit-back"));
    s.getByTestId("timekeeper-done");
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it("closes when the window does (the server would refuse the save)", () => {
    const s = openEdit();
    s.getByTestId("timekeeper-done-edit");
    act(() => {
      jest.advanceTimersByTime(61_000);
    });
    s.getByTestId("timekeeper-done");
    expect(s.getByTestId("result-edit-closed")).toHaveTextContent(/^Editing closed 30 minutes after the result\./);
  });
});

describe("recordedResultOf", () => {
  const roles = deriveMatchRoles(matchOf(), "tk")!;
  it("a submission: the stamped winner, the finish's code and time", () => {
    expect(recordedResultOf(matchOf(), roles.athletes)).toEqual({ outcome: "submission", winnerId: "ch", submissionCode: "armbar", finishTimeSeconds: 95 });
  });
  it("a draw", () => {
    expect(recordedResultOf(matchOf({ result: "draw" }), roles.athletes)).toEqual({ outcome: "draw", winnerId: "", submissionCode: "", finishTimeSeconds: null });
  });
  it("the winner from winner_id when the outcomes are not stamped yet", () => {
    const unstamped = deriveMatchRoles(matchOf({ participants: [participant("op", "Dayo Okafor", null), participant("ch", "Marco Reyes", null)] }), "tk")!;
    expect(recordedResultOf(matchOf({ winner_id: "op" }), unstamped.athletes)?.winnerId).toBe("op");
  });
  it("no result, or no winner to read: null (an empty form)", () => {
    expect(recordedResultOf(matchOf({ result: null }), roles.athletes)).toBeNull();
    const unstamped = deriveMatchRoles(matchOf({ participants: [participant("op", "Dayo Okafor", null), participant("ch", "Marco Reyes", null)] }), "tk")!;
    expect(recordedResultOf(matchOf({ winner_id: null }), unstamped.athletes)).toBeNull();
  });
});
