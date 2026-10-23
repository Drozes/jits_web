/**
 * Timekeeper-mode wrappers (api/timekeeper.ts; jits_web ARCHITECTURE 2.4,
 * jr_be 024 sections 4 and 5): each wrapper calls its RPC with the contract's
 * argument names, shapes the payload, and maps both kinds of refusal (a
 * RAISEd HINT, an `{ok:false, code}` business outcome) to one DomainError
 * code each.
 */
import { describe, it, expect, vi } from "vitest";
import {
  adminListTimekeeperReviews,
  adminResolveTimekeeperReview,
  cancelTimekeeperRequest,
  checkAthleteWeightAsTimekeeper,
  editMatchResult,
  endMatchClock,
  getMyTimekeepingMatch,
  getTimekeeperCandidates,
  getTimekeeperMatchState,
  getTimekeeperRequest,
  leaveMatchAsTimekeeper,
  mapTimekeeperError,
  markMatchReady,
  parseTimekeeperMatchState,
  ratedWeightOf,
  requestMatchTimekeeper,
  respondTimekeeperRequest,
  startMatchAsTimekeeper,
  touchMatchTimekeeper,
  TIMEKEEPER_DECK_MESSAGES,
} from "./timekeeper";

/** The em dash, built so this file never contains one. */
const EM_DASH = String.fromCharCode(0x2014);

function rpcClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { client: { rpc } as never, rpc };
}

const raised = (hint: string, code = "P0001") => ({ code, hint, message: `raised ${hint}`, details: "" });

/** `get_timekeeper_match_state`'s payload as BE-A builds it. */
const STATE = {
  ok: true,
  ready: [{ athlete_id: "a", ready_at: "2026-10-20T10:00:00Z" }],
  athlete_checks: [
    { checker_id: "a", subject_id: "b", status: "confirmed" },
    { checker_id: "b", subject_id: "a", status: "pending" },
  ],
  timekeeper_checks: [{ subject_id: "a", status: "flagged" }],
  open_request: {
    id: "q1",
    invitee: { id: "c", display_name: "Jo Cruz" },
    requested_by: "a",
    expires_at: "2026-10-20T10:02:00Z",
  },
  last_request_outcome: { status: "declined", invitee_name: "Sam Lee", at: "2026-10-20T09:59:00Z" },
  presence: "offline",
  offline_since: "2026-10-20T10:01:00Z",
  no_contest_at: null,
  review_pending: false,
  timeout_at: "2026-10-20T10:10:00Z",
  // BE-G3 (PM26): numeric(5,2) arrives as a JSON number; a side with no weight is null.
  weights: [
    { athlete_id: "a", weight: 181.5 },
    { athlete_id: "b", weight: null },
  ],
  edit_open: false,
  edit_closes_at: null,
  start_blockers: ["athletes_not_ready", "weight_flagged", "a_new_blocker"],
};

describe("parseTimekeeperMatchState", () => {
  it("shapes every field", () => {
    expect(parseTimekeeperMatchState(STATE)).toEqual({
      ready: [{ athleteId: "a", readyAt: "2026-10-20T10:00:00Z" }],
      athleteChecks: [
        { checkerId: "a", subjectId: "b", status: "confirmed" },
        { checkerId: "b", subjectId: "a", status: "pending" },
      ],
      timekeeperChecks: [{ subjectId: "a", status: "flagged" }],
      openRequest: {
        id: "q1",
        invitee: { id: "c", displayName: "Jo Cruz" },
        requestedBy: "a",
        expiresAt: "2026-10-20T10:02:00Z",
      },
      lastRequestOutcome: { status: "declined", inviteeName: "Sam Lee", at: "2026-10-20T09:59:00Z" },
      presence: "offline",
      offlineSince: "2026-10-20T10:01:00Z",
      noContestAt: null,
      reviewPending: false,
      timeoutAt: "2026-10-20T10:10:00Z",
      weights: [
        { athleteId: "a", weight: 181.5 },
        { athleteId: "b", weight: null },
      ],
      editOpen: false,
      editClosesAt: null,
      // An unknown blocker still blocks.
      startBlockers: ["athletes_not_ready", "weight_flagged", "other"],
    });
  });

  it("reads missing and malformed parts as empty or null", () => {
    expect(
      parseTimekeeperMatchState({
        ok: true,
        ready: [{ ready_at: "x" }, "junk"],
        athlete_checks: [{ checker_id: "a", subject_id: "b", status: "weird" }],
        timekeeper_checks: [{ subject_id: "a", status: "pending" }],
        open_request: { id: "q1", invitee: null },
        last_request_outcome: { status: "accepted" },
        presence: "maybe",
        weights: [{ weight: 170 }, { athlete_id: "a", weight: "heavy" }, "junk"],
      }),
    ).toEqual({
      ready: [],
      athleteChecks: [{ checkerId: "a", subjectId: "b", status: "pending" }],
      timekeeperChecks: [],
      openRequest: null,
      lastRequestOutcome: null,
      presence: null,
      offlineSince: null,
      noContestAt: null,
      reviewPending: false,
      timeoutAt: null,
      // No athlete id: dropped; an unreadable weight: null, never a guess.
      weights: [{ athleteId: "a", weight: null }],
      editOpen: false,
      editClosesAt: null,
      startBlockers: [],
    });
  });

  it("reads a backend without BE-G3 (no weights key) as no weights", () => {
    const { weights: _w, ...older } = STATE;
    expect(parseTimekeeperMatchState(older)?.weights).toEqual([]);
  });

  it("reads a weight sent as a numeric string (PostgREST numeric)", () => {
    expect(parseTimekeeperMatchState({ ...STATE, weights: [{ athlete_id: "a", weight: "185.25" }] })?.weights).toEqual([
      { athleteId: "a", weight: 185.25 },
    ]);
  });

  it("is null for anything that is not an ok payload", () => {
    for (const d of [null, "x", [], { ok: false, code: "not_timekeeper_mode" }]) {
      expect(parseTimekeeperMatchState(d)).toBeNull();
    }
  });
});

describe("ratedWeightOf (PM26)", () => {
  const state = parseTimekeeperMatchState(STATE);

  it("is the athlete's rated weight from the state", () => {
    expect(ratedWeightOf(state, "a")).toBe(181.5);
  });

  it("is null, never a stand-in, for a side with no weight, an unknown athlete, or no state yet", () => {
    expect(ratedWeightOf(state, "b")).toBeNull();
    expect(ratedWeightOf(state, "zz")).toBeNull();
    expect(ratedWeightOf(null, "a")).toBeNull();
    expect(ratedWeightOf(undefined, "a")).toBeNull();
    expect(ratedWeightOf({ weights: [] }, "a")).toBeNull();
  });
});

describe("getTimekeeperMatchState", () => {
  it("calls the RPC and shapes the state", async () => {
    const { client, rpc } = rpcClient({ data: STATE });
    const res = await getTimekeeperMatchState(client, "M1");
    expect(rpc).toHaveBeenCalledWith("get_timekeeper_match_state", { p_match_id: "M1" });
    expect(res.ok && res.data?.openRequest?.id).toBe("q1");
  });

  it("a two-athlete match (not_timekeeper_mode) is ok with null", async () => {
    const { client } = rpcClient({ data: { ok: false, code: "not_timekeeper_mode" } });
    expect(await getTimekeeperMatchState(client, "M1")).toEqual({ ok: true, data: null });
  });

  it("a former timekeeper (42501 not_participant) is NOT_PARTICIPANT", async () => {
    const { client } = rpcClient({ error: raised("not_participant", "42501") });
    const res = await getTimekeeperMatchState(client, "M1");
    expect(!res.ok && res.error.code).toBe("NOT_PARTICIPANT");
  });
});

describe("error mapping", () => {
  it.each([
    ["not_timekeeper_mode", "NOT_TIMEKEEPER_MODE"],
    ["not_timekeeper", "NOT_TIMEKEEPER"],
    ["timekeeper_required", "TIMEKEEPER_REQUIRED"],
    ["athletes_not_ready", "ATHLETES_NOT_READY"],
    ["timekeeper_not_recording", "TIMEKEEPER_NOT_RECORDING"],
    ["timekeeper_must_record", "TIMEKEEPER_MUST_RECORD"],
    ["match_not_live", "MATCH_NOT_LIVE"],
    ["result_owed", "RESULT_OWED"],
    ["result_changed", "RESULT_CHANGED"],
    ["edit_window_closed", "EDIT_WINDOW_CLOSED"],
    ["edit_closed_disputed", "EDIT_CLOSED_DISPUTED"],
    ["edit_closed_confirmed", "EDIT_CLOSED_CONFIRMED"],
    ["edit_closed_admin", "EDIT_CLOSED_ADMIN"],
    ["weight_check_not_required", "WEIGHT_CHECK_NOT_REQUIRED"],
    ["not_available_in_timekeeper_mode", "NOT_AVAILABLE_IN_TIMEKEEPER_MODE"],
    ["use_end_match_clock", "USE_END_MATCH_CLOCK"],
    ["no_open_review", "NO_OPEN_REVIEW"],
    ["timekeeper_busy", "TIMEKEEPER_BUSY"],
    ["athlete_in_timekeeper_match", "ATHLETE_IN_TIMEKEEPER_MATCH"],
    ["not_requested", "NOT_REQUESTED"],
    ["match_not_pending", "MATCH_NOT_PENDING"],
    ["match_not_in_progress", "MATCH_NOT_IN_PROGRESS"],
  ])("HINT %s -> %s, whatever the SQLSTATE", (hint, code) => {
    expect(mapTimekeeperError(raised(hint) as never).code).toBe(code);
    expect(mapTimekeeperError(raised(hint, "42501") as never).code).toBe(code);
  });

  it("falls back to the shared hint table, then the shared mapping", () => {
    expect(mapTimekeeperError(raised("weight_flagged") as never).code).toBe("WEIGHT_FLAGGED");
    expect(mapTimekeeperError(raised("not_participant", "42501") as never).code).toBe("NOT_PARTICIPANT");
    expect(mapTimekeeperError(raised("invalid_status") as never).code).toBe("MATCH_NOT_PENDING");
    expect(mapTimekeeperError({ code: "42501", hint: null, message: "rls" } as never).code).toBe("RLS_VIOLATION");
    const unknown = mapTimekeeperError(raised("something_new") as never);
    expect(unknown.code).toBe("UNKNOWN");
    expect(unknown.message).toBe("raised something_new");
  });

  it("keeps the raw error", () => {
    const err = raised("result_changed");
    expect(mapTimekeeperError(err as never).raw).toBe(err);
  });

  it("a refusal the deck has its own words for carries them (spec 14.9 X1)", () => {
    expect(mapTimekeeperError(raised("request_closed") as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.requestClosed);
    expect(mapTimekeeperError(raised("consent_required") as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.consentRequired);
    expect(mapTimekeeperError(raised("timekeeper_must_record") as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.mustRecord);
    expect(mapTimekeeperError(raised("result_changed") as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.resultChanged);
    for (const hint of ["edit_window_closed", "edit_closed_disputed", "edit_closed_confirmed", "edit_closed_admin"]) {
      expect(mapTimekeeperError(raised(hint) as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.editRefused);
    }
    expect(mapTimekeeperError(raised("timekeeper_busy") as never).message).toBe(TIMEKEEPER_DECK_MESSAGES.busyTimekeeping);
    expect(mapTimekeeperError(raised("athlete_in_timekeeper_match") as never).message).toBe(
      TIMEKEEPER_DECK_MESSAGES.busyCompeting,
    );
  });

  it("a busy refusal reads the picker row's words for what the person is busy as (TK-P8, TK-P9)", async () => {
    for (const [busyAs, message] of [
      ["timekeeper", TIMEKEEPER_DECK_MESSAGES.busyTimekeeping],
      ["competitor", TIMEKEEPER_DECK_MESSAGES.busyCompeting],
    ] as const) {
      const { client } = rpcClient({ data: { ok: false, code: "timekeeper_busy", busy_as: busyAs } });
      const res = await requestMatchTimekeeper(client, "M1", "c");
      expect(!res.ok && [res.error.code, res.error.busyAs, res.error.message]).toEqual(["TIMEKEEPER_BUSY", busyAs, message]);
    }
  });

  it("no fallback message has an em dash or an exclamation mark", () => {
    for (const hint of ["not_timekeeper_mode", "request_closed", "edit_closed_admin", "result_owed", "consent_required"]) {
      const message = mapTimekeeperError(raised(hint) as never).message;
      expect(message.includes(EM_DASH) || message.includes("!")).toBe(false);
    }
  });
});

describe("picker and seat (BE-B)", () => {
  it("getTimekeeperCandidates shapes friends and nearby (bands, never distances)", async () => {
    const row = {
      athlete_id: "c",
      display_name: "Jo Cruz",
      avatar_url: null,
      current_elo: 1500,
      is_live: true,
      friend_of: "both",
      distance_band: "on_the_mat",
    };
    const { client, rpc } = rpcClient({ data: { ok: true, friends: [row, { display_name: "no id" }], nearby: [{ ...row, friend_of: null }] } });
    const res = await getTimekeeperCandidates(client, "M1");
    expect(rpc).toHaveBeenCalledWith("get_timekeeper_candidates", { p_match_id: "M1" });
    expect(res).toEqual({
      ok: true,
      data: {
        friends: [
          { athleteId: "c", displayName: "Jo Cruz", avatarUrl: null, currentElo: 1500, isLive: true, friendOf: "both", distanceBand: "on_the_mat" },
        ],
        nearby: [
          { athleteId: "c", displayName: "Jo Cruz", avatarUrl: null, currentElo: 1500, isLive: true, friendOf: null, distanceBand: "on_the_mat" },
        ],
      },
    });
  });

  it("getTimekeeperCandidates maps a business refusal", async () => {
    const { client } = rpcClient({ data: { ok: false, code: "timekeeper_already_seated" } });
    const res = await getTimekeeperCandidates(client, "M1");
    expect(!res.ok && res.error.code).toBe("TIMEKEEPER_ALREADY_SEATED");
  });

  it("requestMatchTimekeeper returns the request and its lapse time", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, request_id: "q1", expires_at: "E" } });
    expect(await requestMatchTimekeeper(client, "M1", "c")).toEqual({ ok: true, data: { requestId: "q1", expiresAt: "E" } });
    expect(rpc).toHaveBeenCalledWith("request_match_timekeeper", { p_match_id: "M1", p_invitee_id: "c" });
  });

  it.each([
    [{ ok: false, code: "timekeeper_busy", busy_as: "competitor" }, "TIMEKEEPER_BUSY", { busyAs: "competitor" }],
    [{ ok: false, code: "timekeeper_busy", busy_as: "timekeeper" }, "TIMEKEEPER_BUSY", { busyAs: "timekeeper" }],
    [{ ok: false, code: "request_already_open", request_id: "q0" }, "REQUEST_ALREADY_OPEN", { requestId: "q0" }],
    [{ ok: false, code: "match_cancelled" }, "MATCH_CANCELLED", {}],
    [{ ok: false, code: "timekeeper_unavailable" }, "TIMEKEEPER_UNAVAILABLE", {}],
    [{ ok: false, code: "timekeeper_is_competitor" }, "TIMEKEEPER_IS_COMPETITOR", {}],
  ])("requestMatchTimekeeper refusal %j", async (data, code, extra) => {
    const { client } = rpcClient({ data });
    const res = await requestMatchTimekeeper(client, "M1", "c");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatchObject({ code, ...extra });
  });

  it("cancelTimekeeperRequest", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, request_id: "q1", status: "cancelled" } });
    expect(await cancelTimekeeperRequest(client, "q1")).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("cancel_timekeeper_request", { p_request_id: "q1" });
    const closed = await cancelTimekeeperRequest(rpcClient({ data: { ok: false, code: "request_closed", status: "expired" } }).client, "q1");
    expect(!closed.ok && closed.error.code).toBe("REQUEST_CLOSED");
  });

  it("respondTimekeeperRequest accepts and declines; consent and busy refusals map", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, match_id: "M1" } });
    expect(await respondTimekeeperRequest(client, "q1", true)).toEqual({ ok: true, data: { matchId: "M1" } });
    expect(rpc).toHaveBeenCalledWith("respond_timekeeper_request", { p_request_id: "q1", p_accept: true });
    for (const [code, mapped] of [
      ["consent_required", "CONSENT_REQUIRED"],
      ["request_closed", "REQUEST_CLOSED"],
      ["timekeeper_busy", "TIMEKEEPER_BUSY"],
    ]) {
      const res = await respondTimekeeperRequest(rpcClient({ data: { ok: false, code } }).client, "q1", true);
      expect(!res.ok && res.error.code).toBe(mapped);
    }
    const notMine = await respondTimekeeperRequest(rpcClient({ error: raised("not_requested", "42501") }).client, "q1", false);
    expect(!notMine.ok && notMine.error.code).toBe("NOT_REQUESTED");
  });

  it("getTimekeeperRequest shapes the invitee's read", async () => {
    const { client, rpc } = rpcClient({
      data: {
        ok: true,
        request_id: "q1",
        match_id: "M1",
        status: "expired",
        expires_at: "E",
        requested_by: { id: "a", display_name: "Mina Park" },
        athletes: [
          { id: "a", display_name: "Mina Park" },
          { id: "b", display_name: "Demo Okafor" },
        ],
        duration_seconds: 300,
      },
    });
    expect(await getTimekeeperRequest(client, "q1")).toEqual({
      ok: true,
      data: {
        requestId: "q1",
        matchId: "M1",
        status: "expired",
        expiresAt: "E",
        requestedBy: { id: "a", displayName: "Mina Park" },
        athletes: [
          { id: "a", displayName: "Mina Park" },
          { id: "b", displayName: "Demo Okafor" },
        ],
        durationSeconds: 300,
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_timekeeper_request", { p_request_id: "q1" });
  });

  it("leaveMatchAsTimekeeper: back to the picker, a no contest, or a result owed", async () => {
    const back = await leaveMatchAsTimekeeper(rpcClient({ data: { match_id: "M1", left: true, status: "pending" } }).client, "M1");
    expect(back).toEqual({ ok: true, data: { status: "pending" } });
    const nc = await leaveMatchAsTimekeeper(rpcClient({ data: { match_id: "M1", left: true, status: "cancelled" } }).client, "M1");
    expect(nc).toEqual({ ok: true, data: { status: "cancelled" } });
    const owed = await leaveMatchAsTimekeeper(rpcClient({ error: raised("result_owed") }).client, "M1");
    expect(!owed.ok && owed.error.code).toBe("RESULT_OWED");
  });
});

describe("face-off and start (BE-C)", () => {
  it("markMatchReady confirms the opponent's weight by default and returns the state", async () => {
    const { client, rpc } = rpcClient({ data: STATE });
    const res = await markMatchReady(client, "M1");
    expect(rpc).toHaveBeenCalledWith("mark_match_ready", { p_match_id: "M1", p_confirm_opponent_weight: true });
    expect(res.ok && res.data.ready).toEqual([{ athleteId: "a", readyAt: "2026-10-20T10:00:00Z" }]);
    await markMatchReady(client, "M1", false);
    expect(rpc).toHaveBeenLastCalledWith("mark_match_ready", { p_match_id: "M1", p_confirm_opponent_weight: false });
  });

  it("checkAthleteWeightAsTimekeeper sends the weight seen only when given", async () => {
    const { client, rpc } = rpcClient({ data: STATE });
    await checkAthleteWeightAsTimekeeper(client, { matchId: "M1", subjectId: "a", verdict: "confirm", weightSeen: 170.2 });
    expect(rpc).toHaveBeenLastCalledWith("check_athlete_weight_as_timekeeper", {
      p_match_id: "M1",
      p_subject_id: "a",
      p_verdict: "confirm",
      p_weight_seen: 170.2,
    });
    await checkAthleteWeightAsTimekeeper(client, { matchId: "M1", subjectId: "a", verdict: "withdraw" });
    expect(rpc).toHaveBeenLastCalledWith("check_athlete_weight_as_timekeeper", {
      p_match_id: "M1",
      p_subject_id: "a",
      p_verdict: "withdraw",
    });
  });

  it("startMatchAsTimekeeper calls start_match and names the first blocker on refusal", async () => {
    const { client, rpc } = rpcClient({ data: { success: true, match_id: "M1", started_at: "S" } });
    expect(await startMatchAsTimekeeper(client, "M1")).toEqual({ ok: true, data: { startedAt: "S" } });
    expect(rpc).toHaveBeenCalledWith("start_match", { p_match_id: "M1" });
    const blocked = await startMatchAsTimekeeper(rpcClient({ error: raised("athletes_not_ready") }).client, "M1");
    expect(!blocked.ok && blocked.error.code).toBe("ATHLETES_NOT_READY");
  });
});

describe("live, end, edit, presence (BE-D, BE-E)", () => {
  it("endMatchClock sends a whole, non-negative clock reading", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, ended_at: "E", final_elapsed_s: 299 } });
    expect(await endMatchClock(client, "M1", 298.6)).toEqual({ ok: true, data: { endedAt: "E", finalElapsedS: 299 } });
    expect(rpc).toHaveBeenCalledWith("end_match_clock", { p_match_id: "M1", p_final_elapsed_s: 299 });
    await endMatchClock(client, "M1", -3);
    expect(rpc).toHaveBeenLastCalledWith("end_match_clock", { p_match_id: "M1", p_final_elapsed_s: 0 });
  });

  it("touchMatchTimekeeper", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, seen_at: "T" } });
    expect(await touchMatchTimekeeper(client, "M1")).toEqual({ ok: true, data: { seenAt: "T" } });
    expect(rpc).toHaveBeenCalledWith("touch_match_timekeeper", { p_match_id: "M1" });
  });

  it("editMatchResult always sends the expected edit count, and only the result fields given", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, result_edit_count: 1 } });
    expect(
      await editMatchResult(client, {
        matchId: "M1",
        result: "submission",
        winnerId: "a",
        submissionTypeCode: "rnc",
        finishTimeSeconds: 120,
        expectedEditCount: 0,
      }),
    ).toEqual({ ok: true, data: { resultEditCount: 1 } });
    expect(rpc).toHaveBeenCalledWith("edit_match_result", {
      p_match_id: "M1",
      p_result: "submission",
      p_winner_id: "a",
      p_submission_type_code: "rnc",
      p_finish_time_seconds: 120,
      p_expected_edit_count: 0,
    });
    await editMatchResult(client, { matchId: "M1", result: "draw", expectedEditCount: 1 });
    expect(rpc).toHaveBeenLastCalledWith("edit_match_result", { p_match_id: "M1", p_result: "draw", p_expected_edit_count: 1 });
  });

  it.each([
    ["edit_window_closed", "EDIT_WINDOW_CLOSED"],
    ["edit_closed_admin", "EDIT_CLOSED_ADMIN"],
    ["result_changed", "RESULT_CHANGED"],
  ])("editMatchResult refusal %s", async (hint, code) => {
    const res = await editMatchResult(rpcClient({ error: raised(hint) }).client, { matchId: "M1", result: "draw", expectedEditCount: 0 });
    expect(!res.ok && res.error.code).toBe(code);
  });
});

describe("the timekeeper's own match (BE-G)", () => {
  it("getMyTimekeepingMatch shapes the match, or null", async () => {
    const { client, rpc } = rpcClient({
      data: {
        match_id: "M1",
        status: "completed",
        started_at: "S",
        ended_at: "E",
        athletes: [
          { athlete_id: "a", display_name: "Mina Park" },
          { athlete_id: "b", display_name: "Demo Okafor" },
        ],
        review_pending: false,
        edit_open: true,
        edit_closes_at: "C",
      },
    });
    expect(await getMyTimekeepingMatch(client)).toEqual({
      ok: true,
      data: {
        matchId: "M1",
        status: "completed",
        startedAt: "S",
        endedAt: "E",
        athletes: [
          { athleteId: "a", displayName: "Mina Park" },
          { athleteId: "b", displayName: "Demo Okafor" },
        ],
        reviewPending: false,
        editOpen: true,
        editClosesAt: "C",
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_timekeeping_match");
    expect(await getMyTimekeepingMatch(rpcClient({ data: null }).client)).toEqual({ ok: true, data: null });
    const bad = await getMyTimekeepingMatch(rpcClient({ data: { match_id: "M1", status: "weird" } }).client);
    expect(!bad.ok && bad.error.code).toBe("UNKNOWN");
  });
});

describe("admin reviews (BE-E, A27)", () => {
  it("adminListTimekeeperReviews shapes the queue", async () => {
    const { client } = rpcClient({
      data: [
        {
          match_id: "M1",
          flagged_at: "F",
          athletes: [{ id: "a", display_name: "Mina Park" }],
          timekeeper: { id: "c", display_name: "Jo Cruz" },
          ended_at: "E",
          final_elapsed_s: 290,
          duration_seconds: 300,
        },
      ],
    });
    expect(await adminListTimekeeperReviews(client)).toEqual({
      ok: true,
      data: [
        {
          matchId: "M1",
          flaggedAt: "F",
          athletes: [{ id: "a", displayName: "Mina Park" }],
          timekeeper: { id: "c", displayName: "Jo Cruz" },
          endedAt: "E",
          finalElapsedS: 290,
          durationSeconds: 300,
        },
      ],
    });
    const notAdmin = await adminListTimekeeperReviews(rpcClient({ error: raised("not_admin") }).client);
    expect(!notAdmin.ok && notAdmin.error.code).toBe("NOT_ADMIN");
  });

  it("adminResolveTimekeeperReview records or voids", async () => {
    const { client, rpc } = rpcClient({ data: { ok: true, action: "record", match_id: "M1" } });
    expect(
      await adminResolveTimekeeperReview(client, {
        matchId: "M1",
        action: "record",
        result: "submission",
        winnerId: "a",
        submissionTypeCode: "rnc",
        finishTimeSeconds: 60,
      }),
    ).toEqual({ ok: true, data: { action: "record", matchId: "M1" } });
    expect(rpc).toHaveBeenCalledWith("admin_resolve_timekeeper_review", {
      p_match_id: "M1",
      p_action: "record",
      p_result: "submission",
      p_winner_id: "a",
      p_submission_type_code: "rnc",
      p_finish_time_seconds: 60,
    });
    const voided = rpcClient({ data: { ok: true, action: "void", match_id: "M1" } });
    expect(await adminResolveTimekeeperReview(voided.client, { matchId: "M1", action: "void", note: "no film" })).toEqual({
      ok: true,
      data: { action: "void", matchId: "M1" },
    });
    expect(voided.rpc).toHaveBeenCalledWith("admin_resolve_timekeeper_review", { p_match_id: "M1", p_action: "void", p_note: "no film" });
    const closed = await adminResolveTimekeeperReview(rpcClient({ error: raised("no_open_review") }).client, { matchId: "M1", action: "void" });
    expect(!closed.ok && closed.error.code).toBe("NO_OPEN_REVIEW");
  });
});
