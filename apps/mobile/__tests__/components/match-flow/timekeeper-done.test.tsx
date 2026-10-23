/**
 * The timekeeper's done screen (timekeeper mode spec 4.2 Confirm, 11;
 * TEST-PLAN 3.2 `timekeeper-done`): the matchup, TK-R2 and TK-R3, the result
 * as recorded (the match in hand's, so an edit shows), each athlete's
 * confirm progress, the upload line, `Edit result` (TK-ED1) only while the
 * 30-minute window is open (mirroring `edit_match_result`, A24), why it
 * closed (TK-ED5, TK-ED6, TK-ED8), nothing for an admin's record (PM19), and
 * `Done` (TK-R4) to Home through `exitMatchTo`.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14", textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }));
const mockReconcile = jest.fn();
const mockSync: { onMatchDisputed?: (athleteId: string) => void } = {};
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: mockReconcile }),
  useStepMatchSync: (p: { onMatchDisputed?: (id: string) => void }) => {
    mockSync.onMatchDisputed = p.onMatchDisputed;
    return {};
  },
}));
jest.mock("@/components/match-flow/match-upload-line", () => {
  const RN = require("react-native");
  const R = require("react");
  return { MatchUploadLine: () => R.createElement(RN.View, { testID: "match-upload-line" }) };
});
const mockUpload: { entry: { status: string } | null } = { entry: null };
jest.mock("@/lib/video/match-upload-store", () => ({ useMatchUpload: () => mockUpload.entry }));
jest.mock("@/lib/video/upload-capabilities", () => ({ isBackgroundUploadSupported: () => false }));
jest.mock("@jits/shared/api/timekeeper", () => ({
  editMatchResult: jest.fn(),
  ratedWeightOf: jest.requireActual("@jits/shared/api/timekeeper").ratedWeightOf,
}));

import { TimekeeperDone, doneResultView } from "@/components/match-flow/steps/timekeeper-done";
import { editEntryFor, type EditEntryInput } from "@/components/match-flow/steps/result-edit-entry";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { readMatchExtras } from "@/lib/match-flow/match-extras";
import { paletteFor } from "@/lib/theme/palette";

/** The DISPUTED tag is an attention state: amber, never the plate's default text2. */
const DARK = paletteFor("dark");
const colorOf = (node: { props: { style: StyleProp<TextStyle> } }) => StyleSheet.flatten(node.props.style)?.color;

const NOW = Date.parse("2026-10-20T12:10:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const participant = (id: string, name: string, outcome: string | null) => ({
  athlete_id: id,
  display_name: name,
  current_elo: 1500,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome,
  elo_before: 1500,
  elo_after: outcome === "win" ? 1514 : 1486,
  elo_delta: outcome === "win" ? 14 : -14,
  weight_division_gap: 0,
});

/** A completed timekeeper-mode match, as `get_match_details` reads it for the timekeeper; OP is listed first, CH challenged. */
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
    tk_weight_check_required: true,
    challenger_id: "ch",
    ended_at: "2026-10-20T12:04:30Z",
    final_elapsed_s: 228,
    result_edit_count: 0,
    result_recorded_by_admin: false,
    timekeeper: { id: "tk", display_name: "Jamal Cruz", profile_photo_url: null },
    winner_id: "ch",
    submission_type_code: "armbar",
    submission_name: "Armbar",
    finish_time_seconds: 95,
    ...overrides,
  } as unknown as MatchDetails;
}

function tkStateOf(overrides: Partial<TimekeeperMatchState> = {}): TimekeeperMatchState {
  return {
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
    editClosesAt: iso(25 * 60_000),
    startBlockers: [],
    ...overrides,
  };
}

function screenFor(match: MatchDetails, tkState: TimekeeperMatchState | null, confirmedAthleteIds: string[] = []) {
  const roles = deriveMatchRoles(match, "tk")!;
  return (
    <MatchFlowProvider match={match} roles={roles} tkState={tkState}>
      <TimekeeperDone
        matchId="M1"
        exitHref="/"
        durationSeconds={300}
        submissionTypes={[]}
        confirmedAthleteIds={confirmedAthleteIds}
        resultData={null}
        extras={readMatchExtras(match)}
      />
    </MatchFlowProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.entry = null;
  mockSync.onMatchDisputed = undefined;
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => jest.useRealTimers());

describe("the done screen", () => {
  it("the matchup challenger first, TK-R2, TK-R3, the recorded result, Done to Home", () => {
    const s = render(screenFor(matchOf(), tkStateOf()));
    s.getByText("M. Reyes vs D. Okafor");
    s.getByText("Result recorded");
    s.getByText("M. Reyes and D. Okafor confirm it next. Your rating isn't affected.");
    s.getByText("M. Reyes won");
    expect(s.getByTestId("result-how-it-ended")).toHaveTextContent("Armbar");
    expect(s.getByTestId("result-match-length")).toHaveTextContent("01:35");
    // The timekeeper is neither athlete: no YOU WON / YOU LOST, and no rating anywhere.
    expect(s.queryByText(/YOU (WON|LOST)/)).toBeNull();
    expect(s.queryByText(/1514|1486|14/)).toBeNull();
    fireEvent.press(s.getByText("Done"));
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });

  it("each athlete's confirm progress, challenger first", () => {
    const s = render(screenFor(matchOf(), tkStateOf(), ["op"]));
    s.getByTestId("timekeeper-done-athlete-ch-waiting");
    s.getByTestId("timekeeper-done-athlete-op-confirmed");
    s.getByText("WAITING");
    s.getByText("D. OKAFOR CONFIRMED ✓");
  });

  it("the upload line, and keep the app open while the film uploads (D12)", () => {
    const s = render(screenFor(matchOf(), tkStateOf()));
    s.getByTestId("match-upload-line");
    expect(s.queryByTestId("timekeeper-done-keep-open")).toBeNull();
    mockUpload.entry = { status: "uploading" };
    s.rerender(screenFor(matchOf(), tkStateOf()));
    expect(s.getByTestId("timekeeper-done-keep-open")).toHaveTextContent("Keep ELO RATED open until your film uploads.");
  });

  it("an edit's result shows from the match in hand, not this phone's first copy", () => {
    const edited = matchOf({
      result: "draw",
      result_edit_count: 1,
      winner_id: null,
      submission_name: null,
      submission_type_code: null,
      finish_time_seconds: null,
      participants: [participant("op", "Dayo Okafor", "draw"), participant("ch", "Marco Reyes", "draw")],
    });
    const s = render(screenFor(edited, tkStateOf()));
    s.getByText("Draw");
    expect(s.getByTestId("result-how-it-ended")).toHaveTextContent("DRAW");
    // A draw's length is the final clock.
    expect(s.getByTestId("result-match-length")).toHaveTextContent("03:48");
  });
});

describe("Edit result (A8, A24)", () => {
  it("is offered while the window is open", () => {
    const s = render(screenFor(matchOf(), tkStateOf()));
    s.getByText("Edit result");
    expect(s.queryByTestId("result-edit-closed")).toBeNull();
  });

  it("closes the moment the server's window passes (TK-ED8), before any read says so", () => {
    const s = render(screenFor(matchOf(), tkStateOf({ editClosesAt: iso(60_000) })));
    s.getByTestId("result-edit-open");
    act(() => {
      jest.advanceTimersByTime(61_000);
    });
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.getByTestId("result-edit-closed")).toHaveTextContent("Editing closed 30 minutes after the result. Athletes can still dispute.");
    // The next read (closed, no edit_closes_at any more) agrees.
    s.rerender(screenFor(matchOf(), tkStateOf({ editOpen: false, editClosesAt: null })));
    expect(s.getByTestId("result-edit-closed")).toHaveTextContent(/^Editing closed 30 minutes after the result\./);
  });

  it("closed by both confirmations (TK-ED6)", () => {
    const s = render(screenFor(matchOf(), tkStateOf(), ["ch", "op"]));
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.getByTestId("result-edit-closed")).toHaveTextContent("Editing is closed. Both athletes confirmed.");
  });

  it("closed by a dispute: DISPUTED, then TK-ED5 once the broadcast names the athlete", () => {
    const s = render(screenFor(matchOf({ status: "disputed" }), tkStateOf({ editOpen: false, editClosesAt: null })));
    expect(s.getByTestId("timekeeper-done-status")).toHaveTextContent("DISPUTED");
    expect(colorOf(s.getByTestId("timekeeper-done-status"))).toBe(DARK.amber);
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.queryByTestId("result-edit-closed")).toBeNull();
    act(() => mockSync.onMatchDisputed?.("op"));
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(s.getByTestId("result-edit-closed")).toHaveTextContent("Editing is closed. D. Okafor disputed the result.");
  });

  it("a voided match (M1 keeps the timekeeper here): never Edit result, even on a stale open state", () => {
    const s = render(screenFor(matchOf({ status: "voided" }), tkStateOf()));
    s.getByTestId("timekeeper-done");
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.queryByTestId("result-edit-closed")).toBeNull();
  });

  it("a disputed match: no TK-R3 and no confirm progress, since an admin reviews it and nobody confirms next", () => {
    const s = render(screenFor(matchOf({ status: "disputed" }), tkStateOf({ editOpen: false, editClosesAt: null }), ["op"]));
    s.getByText("Result recorded");
    expect(s.getByTestId("timekeeper-done-status")).toHaveTextContent("DISPUTED");
    expect(colorOf(s.getByTestId("timekeeper-done-status"))).toBe(DARK.amber);
    expect(s.queryByText("M. Reyes and D. Okafor confirm it next. Your rating isn't affected.")).toBeNull();
    expect(s.queryByTestId("timekeeper-done-athlete-ch-waiting")).toBeNull();
    expect(s.queryByTestId("timekeeper-done-athlete-op-confirmed")).toBeNull();
    expect(s.queryByText("WAITING")).toBeNull();
    s.getByTestId("timekeeper-done-exit");
  });

  it("a voided match: no TK-R3 and no confirm progress, since nobody confirms a voided result", () => {
    const s = render(screenFor(matchOf({ status: "voided" }), tkStateOf(), ["op"]));
    s.getByText("Result recorded");
    expect(s.queryByText("M. Reyes and D. Okafor confirm it next. Your rating isn't affected.")).toBeNull();
    expect(s.queryByTestId("timekeeper-done-athlete-ch-waiting")).toBeNull();
    expect(s.queryByTestId("timekeeper-done-athlete-op-confirmed")).toBeNull();
    expect(s.queryByText("WAITING")).toBeNull();
    s.getByTestId("timekeeper-done-exit");
  });

  it("an admin's record: no Edit result and no closed line (PM19, edit_closed_admin)", () => {
    const s = render(screenFor(matchOf({ result_recorded_by_admin: true }), tkStateOf({ editOpen: false, editClosesAt: null })));
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.queryByTestId("result-edit-closed")).toBeNull();
  });

  it("nothing until the timekeeper-mode state is read", () => {
    const s = render(screenFor(matchOf(), null));
    expect(s.queryByTestId("result-edit-open")).toBeNull();
    expect(s.queryByTestId("result-edit-closed")).toBeNull();
  });
});

describe("editEntryFor (the server's refusal order)", () => {
  const base: EditEntryInput = {
    canEdit: true,
    status: "completed",
    recordedByAdmin: false,
    editOpen: true,
    closesAt: iso(60_000),
    bothConfirmed: false,
    disputerName: null,
    now: NOW,
  };
  it.each<[string, Partial<EditEntryInput>, ReturnType<typeof editEntryFor>]>([
    ["open", {}, { kind: "open" }],
    ["a viewer who may not edit (caps.canEditResult false), whatever the state", { canEdit: false }, { kind: "hidden" }],
    ["a viewer who may not edit, on a disputed match", { canEdit: false, status: "disputed", disputerName: "D. Okafor" }, { kind: "hidden" }],
    ["disputed, named", { status: "disputed", disputerName: "D. Okafor" }, { kind: "closed", line: "Editing is closed. D. Okafor disputed the result." }],
    ["disputed, not named yet", { status: "disputed" }, { kind: "closed", line: null }],
    ["a dispute wins over the window", { status: "disputed", disputerName: "D. Okafor", now: NOW + 120_000 }, { kind: "closed", line: "Editing is closed. D. Okafor disputed the result." }],
    ["not a completed result (voided)", { status: "voided" }, { kind: "hidden" }],
    ["still in progress", { status: "in_progress" }, { kind: "hidden" }],
    ["an admin's record", { recordedByAdmin: true }, { kind: "hidden" }],
    ["the state not read yet", { editOpen: null }, { kind: "hidden" }],
    ["the window passed", { now: NOW + 61_000 }, { kind: "closed", line: "Editing closed 30 minutes after the result. Athletes can still dispute." }],
    ["the window before both confirmations", { now: NOW + 61_000, bothConfirmed: true }, { kind: "closed", line: "Editing closed 30 minutes after the result. Athletes can still dispute." }],
    ["both confirmed", { bothConfirmed: true }, { kind: "closed", line: "Editing is closed. Both athletes confirmed." }],
    ["both confirmed, the state not yet re-read", { bothConfirmed: true, editOpen: true }, { kind: "closed", line: "Editing is closed. Both athletes confirmed." }],
    ["closed with no reason in sight", { editOpen: false, closesAt: null }, { kind: "closed", line: "Editing closed 30 minutes after the result. Athletes can still dispute." }],
    ["closed inside a window still running, its reason not read yet: no line, never the window's", { editOpen: false }, { kind: "closed", line: null }],
    ["closed inside the window, then both confirmations read", { editOpen: false, bothConfirmed: true }, { kind: "closed", line: "Editing is closed. Both athletes confirmed." }],
    ["open with no close time known", { closesAt: null }, { kind: "open" }],
  ])("%s", (_name, overrides, expected) => {
    expect(editEntryFor({ ...base, ...overrides })).toEqual(expected);
  });
});

describe("doneResultView", () => {
  const roles = deriveMatchRoles(matchOf(), "tk")!;
  const extras = { submissionName: "Armbar", finishTimeSeconds: 95 };
  it("the match in hand's result first", () => {
    expect(doneResultView(roles, { result: "draw" }, extras, 228, [])).toEqual({
      winnerName: "Marco Reyes",
      isDraw: false,
      submissionName: "Armbar",
      lengthSeconds: 95,
      tap: true,
    });
  });
  it("this phone's copy before the result is read, named from the catalogue", () => {
    const unread = deriveMatchRoles(matchOf({ participants: [participant("op", "Dayo Okafor", null), participant("ch", "Marco Reyes", null)] }), "tk")!;
    const types = [{ code: "armbar", display_name: "Armbar" }] as never[];
    expect(
      doneResultView(unread, { result: "submission", winnerId: "op", submissionCode: "armbar", finishTimeSeconds: 61 }, { submissionName: null, finishTimeSeconds: null }, 228, types),
    ).toEqual({ winnerName: "Dayo Okafor", isDraw: false, submissionName: "Armbar", lengthSeconds: 61, tap: true });
  });
});
