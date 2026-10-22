/**
 * Building blocks of the timekeeper-mode scenarios (TEST-PLAN 4.2). The
 * simulator (Blue) is always an ATHLETE; the timekeeper is always a bot
 * (PM18). Each block wraps one beat in a `ctx.step` and records oracles, and
 * every beat that changes the server is asserted in the DATABASE (read as
 * postgres, `oracle/tk-db.ts`), not only on Blue's screen (PLAN 3.2, M7
 * reviewer focus).
 *
 * The shared fixtures (`fixtures/timekeeper.ts`) are scoped by `tkScenario`:
 * friendships between the four accounts for the whole scenario, the
 * test-only sweep windows when asked, the timekeeper bots' AI consent put
 * back afterwards, and `timekeeper_role` ON only around the creation of the
 * match (`withFlags` inside the handshakes).
 */
import type { MobileOpponent } from "../../bot/opponent";
import { TIMEKEEPER_CAP } from "../../bot/opponent";
import type { TimekeeperBot, TimekeeperSide, TkAthleteSide, TkRequestRow } from "../../bot/timekeeper";
import type { BroadcastResult } from "../../bot/protocol";
import {
  CONSENT_COLUMNS,
  ensureFourthAccount,
  readFlags,
  runTimekeeperTick,
  TK_ROLE_FLAG,
  TK_WEIGHT_CHECK_FLAG,
  timekeeperFlagState,
  withAthleteColumns,
  withFlags,
  withFriendships,
  withWindows,
  type TkWindow,
} from "../../fixtures/timekeeper";
import { db } from "../../oracle/db";
import { droppedOut, historyVerdict, recipientsOf, tkDb, type TkMatchDb } from "../../oracle/tk-db";
import { ToastWatch } from "../../oracle/ui";
import { TIMEKEEPER_COPY, type TimekeeperToast } from "../../../../apps/mobile/lib/match-flow/timekeeper-copy";
import { shortName } from "../../../../apps/mobile/lib/match-flow/short-name";
import { countdownSeconds, TimekeeperScreens, TK_UI, YOUR_RATING } from "../../sim/timekeeper-screens";
import { ExpectationTimeout, pace, pollUntil } from "../../lib/util";
import type { ScenarioCtx } from "../context";
import {
  blueChallengesRed,
  checkBlueInLobbyBeforeMatch,
  checkOfflineInMatch,
  checkRatingMoved,
  FIXTURE_ELO,
  prepare,
  redChallengesBlue,
  T,
  type PrepareOptions,
} from "../flows";

export const TK = {
  ...T,
  /** A request reaching the asked bot (realtime or its 2 s poll). */
  request: 20_000,
  /** Both athletes ready, verdicts in, Start allowed. */
  start: 45_000,
  /** A sweep transition once its window has passed (the harness runs the tick itself). */
  sweep: 60_000,
};

export const C = TIMEKEEPER_COPY;

/** The cast of a timekeeper scenario. Red is the other athlete; Green and Gold are timekeeper bots. */
export interface TkCast {
  red: MobileOpponent;
  green: TimekeeperBot;
  /** Only when the scenario asked for it (re-picks, T2 and T5). */
  gold: TimekeeperBot | null;
  ui: TimekeeperScreens;
}

export interface TkMatch {
  challengeId: string;
  matchId: string;
  /** Challenger first. */
  athletes: [string, string];
  /** Blue's role in this match. */
  simRole: "challenger" | "opponent";
  /** Red's side (a bot athlete). */
  red: TkAthleteSide;
}

export interface TkScenarioOptions extends PrepareOptions {
  /** Shortened sweep windows (seconds) for the whole scenario (jr_be 024 6.4). */
  windows?: Partial<Record<TkWindow, number>>;
  /** Provision the fourth account and its timekeeper bot. */
  gold?: boolean;
}

/** Short display name, as the deck writes `{name}`. */
export const short = shortName;

/**
 * Prepare a timekeeper scenario and run `body` with its fixtures in place:
 * the usual reset and idle app (Blue live on the Arena unless asked
 * otherwise), the fourth account, friendships between the four accounts
 * (the picker lists friends), the shortened windows when asked, Red as a
 * capable athlete bot and the timekeeper bots listening. Everything is
 * undone afterwards, including the AI consent the timekeeper bots record
 * before an accept (it gates recording and uploads, so Green must not keep
 * it into a flag-OFF scenario).
 */
export async function tkScenario(ctx: ScenarioCtx, opts: TkScenarioOptions, body: (cast: TkCast) => Promise<void>): Promise<void> {
  const { windows, gold = false, ...prep } = opts;
  await prepare(ctx, prep);
  const fourthId = await ctx.step("the fourth account exists (Demo Gold)", () => ensureFourthAccount(ctx.cfg, ctx.password));
  ctx.fourthId = fourthId;
  const flag = await timekeeperFlagState();
  ctx.eq("env:timekeeper-role-off-before", false, flag.enabled === true && !flag.heldByThisRun, "the shared flag is only ever on around a timekeeper match's creation");
  const friends = [ctx.ids.blue, ctx.ids.red, ctx.ids.green, fourthId];
  const open = await tkDb.openResults(friends);
  if (open.length) ctx.trace.note("harness", "open_timekeeper_results_left_by_earlier_runs", open);
  await withAthleteColumns([ctx.ids.green, fourthId], CONSENT_COLUMNS, () =>
    withFriendships(friends, () =>
      withWindows(windows ?? {}, async () => {
        const red = await ctx.bot("red", { capabilities: [TIMEKEEPER_CAP] });
        const green = await ctx.timekeeperBot("green");
        const goldBot = gold ? await ctx.timekeeperBot("gold") : null;
        await body({ red, green, gold: goldBot, ui: new TimekeeperScreens(ctx.idb, ctx.ui) });
      }, (what, payload) => ctx.trace.note("harness", what, payload)),
    ),
  );
}

/** Both bot athletes reach `step` (the app's own routing, read from the database): T0 and T0B. */
export async function bothRouted(ctx: ScenarioCtx, id: string, step: string, sides: readonly TkAthleteSide[]): Promise<void> {
  await ctx.expect(id, sides.map(() => step), () =>
    Promise.all(sides.map((s) => s.waitTarget((t) => t === step, step, T.db))),
  );
}

/** The flags a timekeeper match is created with (A19: the sub-flag is snapshotted too). */
export function tkCreationFlags(weightCheck = true): Record<string, boolean> {
  return { [TK_ROLE_FLAG]: true, [TK_WEIGHT_CHECK_FLAG]: weightCheck };
}

const note = (ctx: ScenarioCtx) => (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);

/**
 * Blue challenges Red; Red's bot accepts and creates the match with the
 * flag on for that moment only. C1's handshake (`blueChallengesRed`, with
 * its `db:challenge-created` oracle), its accept inside the flag window.
 */
export async function tkBlueChallengesRed(ctx: ScenarioCtx, cast: TkCast, weightCheck = true): Promise<TkMatch> {
  const { red } = cast;
  await ctx.step("Red goes live", () => red.goLive());
  await checkBlueInLobbyBeforeMatch(ctx, red);
  const { challengeId, matchId } = await blueChallengesRed(ctx, red, {
    step: "Red accepts (timekeeper_role on for the match's creation only)",
    wrap: (accept) => withFlags(tkCreationFlags(weightCheck), accept, note(ctx)),
  });
  const m: TkMatch = {
    challengeId,
    matchId,
    athletes: [ctx.ids.blue, ctx.ids.red],
    simRole: "challenger",
    red: ctx.tkAthleteSide(red, matchId, ctx.ids.blue, "opponent"),
  };
  await checkTkCreated(ctx, m, weightCheck, red);
  return m;
}

/** Red challenges Blue; Blue accepts on the prompt and its app creates the match with the flag on for that moment only. */
export async function tkRedChallengesBlue(ctx: ScenarioCtx, cast: TkCast, weightCheck = true): Promise<TkMatch> {
  const { red } = cast;
  await ctx.step("Red goes live", () => red.goLive());
  await checkBlueInLobbyBeforeMatch(ctx, red);
  const challengeId = await redChallengesBlue(ctx, red);
  const matchId = await ctx.step("Blue accepts (timekeeper_role on for the match's creation only)", () =>
    withFlags(
      tkCreationFlags(weightCheck),
      async () => {
        await ctx.ui.acceptPrompt();
        // The mode is read at the match INSERT, which Blue's app makes.
        const ms = await pollUntil("the match Blue's app starts for the challenge", async () => {
          const rows = await db.matchesForChallenge(challengeId);
          return rows.length ? rows : undefined;
        }, { timeoutMs: T.handshake, intervalMs: 300 });
        return ms[0].id;
      },
      note(ctx),
    ),
  );
  const outcome = await ctx.step("Red is told the match started", () => red.waitOutgoingOutcome(T.prompt));
  ctx.eq("bot:challenger-lands-in-the-db-match", matchId, outcome.kind === "match_started" ? outcome.matchId : outcome.kind);
  const m: TkMatch = {
    challengeId,
    matchId,
    athletes: [ctx.ids.red, ctx.ids.blue],
    simRole: "opponent",
    red: ctx.tkAthleteSide(red, matchId, ctx.ids.blue, "challenger"),
  };
  await checkTkCreated(ctx, m, weightCheck, red);
  return m;
}

/**
 * The match is a timekeeper match (both sides stamped capable, the flag on
 * at INSERT), the shared flag is off again, and Blue is on `crew`, offline.
 */
export async function checkTkCreated(ctx: ScenarioCtx, m: TkMatch, weightCheck: boolean, red: MobileOpponent): Promise<void> {
  await checkTkCreatedDb(ctx, m, weightCheck);
  await ctx.step("Blue lands on crew (pick a timekeeper)", () => ctx.ui.waitStep("crew", TK.step));
  await checkOfflineInMatch(ctx, red);
}

/** The database half of `checkTkCreated`: the mode snapshot and both stamps, and the shared flag off again. */
export async function checkTkCreatedDb(ctx: ScenarioCtx, m: Pick<TkMatch, "challengeId" | "matchId">, weightCheck: boolean): Promise<void> {
  const caps = await tkDb.challengeCaps(m.challengeId);
  ctx.eq("db:challenge-both-capable", { challenger_tk_capable: true, opponent_tk_capable: true }, caps);
  const row = await tkDb.match(m.matchId);
  ctx.eq(
    "db:match-is-timekeeper-mode",
    { status: "pending", requires_timekeeper: true, tk_weight_check_required: weightCheck, timekeeper_id: null, deadline_set: true },
    {
      status: row?.status,
      requires_timekeeper: row?.requires_timekeeper,
      tk_weight_check_required: row?.tk_weight_check_required,
      timekeeper_id: row?.timekeeper_id,
      deadline_set: !!row?.timekeeper_deadline_at,
    },
  );
  const flags = await readFlags([TK_ROLE_FLAG]);
  const held = (await timekeeperFlagState()).heldByThisRun;
  ctx.eq("db:timekeeper-role-off-after-creation", held ? true : false, flags[TK_ROLE_FLAG], held ? "held on by --tk-flag-on for this run" : undefined);
}

/** Blue taps Ask on a picker row (TK-P7); the asked bot receives the request; the DB holds it open. */
export async function blueAsks(ctx: ScenarioCtx, cast: TkCast, tk: TimekeeperBot, m: TkMatch): Promise<TkRequestRow> {
  await ctx.step(`Blue asks ${tk.me.displayName} to timekeep`, () => cast.ui.ask(tk.me.displayName));
  const req = await ctx.step(`${tk.me.displayName} receives the request`, () => tk.waitForRequest(TK.request, m.matchId));
  await checkRequestOpen(ctx, m, req, ctx.ids.blue, tk);
  await ctx.expect("ui:asked-card", true, async () => {
    await cast.ui.waitLabel(TK_UI.asked(tk.me.displayName), TK.step);
    return true;
  });
  return req;
}

/**
 * Red's bot asks. With `pickerUi` (a scenario that needs M2) Blue's picker
 * must follow the other athlete's request live (TK-P20); without it only
 * the database is checked, so a scenario that does not drive the picker
 * does not depend on slice M2.
 */
export async function redAsks(ctx: ScenarioCtx, cast: TkCast, tk: TimekeeperBot, m: TkMatch, opts: { pickerUi?: boolean } = {}): Promise<TkRequestRow> {
  const r = await ctx.step(`Red asks ${tk.me.displayName} to timekeep`, () => m.red.requestTimekeeper(tk.me.id));
  ctx.eq("bot:request-ok", true, r.ok, r.ok ? undefined : `${r.error.code} ${r.error.message}`);
  const req = await ctx.step(`${tk.me.displayName} receives the request`, () => tk.waitForRequest(TK.request, m.matchId));
  await checkRequestOpen(ctx, m, req, ctx.ids.red, tk);
  if (opts.pickerUi) {
    await ctx.expect("ui:other-athlete-asked", true, async () => {
      await cast.ui.waitLabel(TK_UI.otherAsked(ctx.cfg.names.red, tk.me.displayName), TK.step);
      return true;
    });
  }
  return req;
}

/** The request is the match's one open request, and the asked person got TK-N1. */
export async function checkRequestOpen(ctx: ScenarioCtx, m: Pick<TkMatch, "matchId">, req: TkRequestRow, by: string, tk: TimekeeperBot): Promise<void> {
  const rows = await tkDb.requests(m.matchId);
  const open = rows.filter((r) => r.status === "pending");
  ctx.eq(
    "db:one-open-request",
    [{ id: req.id, requested_by: by, invitee_id: tk.me.id }],
    open.map((r) => ({ id: r.id, requested_by: r.requested_by, invitee_id: r.invitee_id })),
  );
  const n = await tkDb.notifications(m.matchId);
  ctx.eq("db:asked-person-notified", [tk.me.id], recipientsOf(n, "timekeeper_requested").filter((id) => id === tk.me.id), "TK-N1");
}

/**
 * The asked bot accepts (consent first when missing) and is seated: the DB
 * seat, the open history row, the recording intent, the cleared deadline
 * and TK-N2 to both athletes; Blue leaves `crew` for the face-off.
 */
export async function seat(ctx: ScenarioCtx, tk: TimekeeperBot, req: TkRequestRow, m: TkMatch): Promise<TimekeeperSide> {
  const side = await ctx.step(`${tk.me.displayName} accepts and is seated`, () => tk.acceptAndSeat(req.id, m.athletes));
  await checkSeatedDb(ctx, tk, req, m);
  await ctx.step("Blue leaves crew for the face-off", () => ctx.ui.waitStepIn(["weight", "ready"], TK.step));
  await ctx.expect("bot:red-routed-to-the-face-off", "weight", () => m.red.waitTarget((t) => t === "weight", "the face-off", T.db));
  return side;
}

/**
 * The database half of `seat`: the seat, the open history row, the
 * recording intent, the cleared deadline, the accepted request and TK-N2 to
 * both athletes, and the timekeeper never a participant.
 */
export async function checkSeatedDb(ctx: ScenarioCtx, tk: TimekeeperBot, req: TkRequestRow, m: Pick<TkMatch, "matchId" | "athletes">): Promise<void> {
  const row = await tkDb.waitMatch(m.matchId, "a seated timekeeper", (x) => x.timekeeper_id === tk.me.id, T.db).catch(() => tkDb.match(m.matchId));
  ctx.eq("db:timekeeper-seated", { timekeeper_id: tk.me.id, deadline: null, status: "pending" }, { timekeeper_id: row?.timekeeper_id, deadline: row?.timekeeper_deadline_at ?? null, status: row?.status });
  const hist = await tkDb.history(m.matchId);
  const open = hist.filter((h) => h.left_at === null);
  ctx.eq("db:seat-history-open", [tk.me.id], open.map((h) => h.timekeeper_id));
  const intent = await tkDb.timekeeperIntent(m.matchId, tk.me.id);
  ctx.eq("db:timekeeper-recording-intent-on", { role: "timekeeper", intends_to_record: true }, intent);
  const reqs = await tkDb.requests(m.matchId);
  ctx.eq("db:request-accepted", "accepted", reqs.find((r) => r.id === req.id)?.status);
  const n = await pollUntil("TK-N2 to both athletes", async () => {
    const rows = await tkDb.notifications(m.matchId);
    return recipientsOf(rows, "timekeeper_accepted", tk.me.id).length >= 2 ? rows : undefined;
  }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
  ctx.eq("db:athletes-told-seated", [...m.athletes].sort(), recipientsOf(n, "timekeeper_accepted", tk.me.id), "TK-N2, about this timekeeper");
  ctx.eq("db:timekeeper-never-a-participant", false, (await db.participants(m.matchId)).some((p) => p.athlete_id === tk.me.id));
}

/** Whether the server holds Blue's `match_ready` row: TK-F4 honoured (`weighInAndReady`'s `serverReady`). */
export function blueReadyOnServer(ctx: ScenarioCtx, m: Pick<TkMatch, "matchId">): () => Promise<boolean> {
  return async () => (await tkDb.ready(m.matchId)).includes(ctx.ids.blue);
}

/**
 * The face-off to the live clock: Blue weighs in and taps TK-F4, Red's bot
 * readies, the timekeeper bot confirms the weigh-ins (when the match has
 * the timekeeper check) and starts once the server lists no blocker. Blue
 * sees the live screen with no clock controls (TK-L2). `onBothReady` runs
 * while Blue's face-off waits on the timekeeper (both athletes ready, TK-F5
 * shown), before any verdict or the Start.
 */
export async function tkFaceoffToLive(
  ctx: ScenarioCtx,
  cast: TkCast,
  m: TkMatch,
  tk: TimekeeperBot,
  side: TimekeeperSide,
  weightCheck = true,
  opts: { onBothReady?: () => Promise<void> } = {},
): Promise<void> {
  const redReady = (async () => {
    await pace(ctx.opts.timing === "human" ? 1_500 : 100);
    return m.red.markReady();
  })();
  redReady.catch(() => undefined);
  const weigh = await ctx.step("Blue weighs in and taps Weight looks right, I'm ready (TK-F4)", () =>
    cast.ui.weighInAndReady(TK.step, { serverReady: blueReadyOnServer(ctx, m) }),
  );
  ctx.eq("ui:tk-ready-one-press", 1, weigh.readyPresses, "presses of TK-F4; a second means the app dropped the first");
  const rr = await redReady;
  ctx.eq("bot:red-ready-ok", true, rr.ok, rr.ok ? undefined : `${rr.error.code} ${rr.error.message}`);
  await ctx.expect("db:both-athletes-ready", [...m.athletes].sort(), async () =>
    pollUntil("both match_ready rows", async () => {
      const r = await tkDb.ready(m.matchId);
      return r.length === 2 ? r : undefined;
    }, { timeoutMs: T.db }),
  );
  const checks = await tkDb.athleteChecks(m.matchId);
  ctx.eq(
    "db:athlete-checks-confirmed",
    [...m.athletes].sort().map((checker) => ({ checker, status: "confirmed" })),
    checks.map((c) => ({ checker: c.checker_id, status: c.status })).sort((a, b) => a.checker.localeCompare(b.checker)),
    "TK-F4 confirms the athlete's check of the opponent (mark_match_ready)",
  );
  await ctx.expect("ui:timekeeper-starts-the-match", true, async () => {
    await cast.ui.waitLabel(TK_UI.startsTheMatch(tk.me.displayName), TK.step);
    return true;
  });
  await opts.onBothReady?.();
  const blockers = await ctx.step("the timekeeper confirms the weigh-ins and waits for no Start blocker", () => side.waitStartable(weightCheck, TK.start));
  ctx.trace.note("harness", "start_blockers_seen", blockers);
  const tkChecks = await tkDb.timekeeperChecks(m.matchId);
  ctx.eq(
    "db:timekeeper-checks",
    weightCheck ? [...m.athletes].sort().map((subject_id) => ({ subject_id, status: "confirmed" })) : [],
    tkChecks,
    weightCheck ? "both weigh-ins confirmed by the timekeeper" : "A19: no timekeeper verdicts without the sub-flag",
  );
  const started = await ctx.step("the timekeeper starts the match", () => side.startMatch());
  ctx.eq("bot:timekeeper-start-ok", true, started.ok, started.ok ? undefined : `${started.error.code} ${started.error.message}`);
  const row = await tkDb.match(m.matchId);
  ctx.eq("db:match-in-progress", { status: "in_progress", started: true, ended: false }, { status: row?.status, started: !!row?.started_at, ended: !!row?.ended_at });
  await ctx.step("Blue reaches the live screen (TK-L2)", () => cast.ui.waitLabel(TK_UI.runsTheClock(tk.me.displayName), TK.handshake));
  ctx.eq("ui:athlete-has-no-clock-controls", [], await cast.ui.clockControls(), "athletes in timekeeper mode are read-only (TK-L2)");
}

/** The timekeeper pauses and resumes; Blue sees the pause timeout chip (TK-D9) while paused. */
export async function tkPauseResume(ctx: ScenarioCtx, cast: TkCast, m: TkMatch, side: TimekeeperSide): Promise<void> {
  await ctx.step("the timekeeper pauses", () => side.pause());
  const paused = await tkDb.waitMatch(m.matchId, "paused", (x) => !!x.paused_at, T.db).catch(() => tkDb.match(m.matchId));
  ctx.eq("db:paused", true, !!paused?.paused_at);
  await ctx.expect("ui:pause-timeout-chip", true, () =>
    pollUntil("TK-D9 while paused", async () => ((await cast.ui.noContestChip()) ? true : undefined), { timeoutMs: TK.step }),
  );
  await pace(ctx.opts.timing === "human" ? 2_000 : 300);
  await ctx.step("the timekeeper resumes", () => side.resume());
  const resumed = await tkDb.waitMatch(m.matchId, "resumed", (x) => !x.paused_at, T.db).catch(() => tkDb.match(m.matchId));
  ctx.eq("db:resumed", { paused_at: null, paused_some: true }, { paused_at: resumed?.paused_at ?? null, paused_some: (resumed?.total_paused_duration ?? 0) > 0 });
}

/** The timekeeper ends the clock; Blue freezes on the result step; the match stays in progress. */
export async function tkEnd(ctx: ScenarioCtx, m: TkMatch, side: TimekeeperSide): Promise<{ finalElapsedS: number }> {
  await pace(ctx.opts.timing === "human" ? 3_000 : 1_500);
  const end = await ctx.step("the timekeeper ends the clock", () => side.endClock());
  await ctx.step("Blue reaches the result step (waiting on the timekeeper)", () => ctx.ui.waitStep("result", TK.step));
  await ctx.expect("bot:red-routed-to-result", "result", () => m.red.waitTarget((t) => t === "result", "the result step", T.db));
  const row = await tkDb.match(m.matchId);
  ctx.eq(
    "db:clock-ended-still-in-progress",
    { status: "in_progress", ended: true, final_elapsed_s: end.finalElapsedS },
    { status: row?.status, ended: !!row?.ended_at, final_elapsed_s: row?.final_elapsed_s },
  );
  return { finalElapsedS: end.finalElapsedS };
}

/** A finish time the server accepts after this clock (never past `final_elapsed_s`). */
export function finishWithin(finalElapsedS: number, wanted = 60): number {
  return Math.max(1, Math.min(wanted, finalElapsedS));
}

/**
 * The timekeeper records; Blue moves to confirm with TK-R5 and no rating
 * (A25); the match is completed with no confirmation row for anyone.
 */
export async function tkRecord(ctx: ScenarioCtx, cast: TkCast, m: TkMatch, tk: TimekeeperBot, side: TimekeeperSide, result: BroadcastResult): Promise<void> {
  const rec = await ctx.step("the timekeeper records the result", () => side.record(result));
  ctx.eq("bot:timekeeper-record-ok", { ok: true }, rec);
  await ctx.step("Blue is moved to the confirm step", () => ctx.ui.waitStep("confirm", TK.step));
  await ctx.expect("bot:red-routed-to-confirm", "confirm", () => m.red.waitTarget((t) => t === "confirm", "the confirm step", T.db));
  await ctx.expect("ui:result-recorded-by-timekeeper", true, async () => {
    await cast.ui.waitLabel(TK_UI.recordedBy(tk.me.displayName), TK.step);
    return true;
  });
  ctx.eq("ui:no-rating-on-confirm", false, await cast.ui.hasLabel(new RegExp(`^${YOUR_RATING}$`, "i")), "A25");
  const row = await tkDb.match(m.matchId);
  ctx.eq("db:match-completed", { status: "completed", result: result.result }, { status: row?.status, result: row?.result });
  ctx.eq("db:no-confirmation-at-record", 0, (await db.confirmations(m.matchId)).length, "the timekeeper's record confirms nobody");
}

/**
 * Blue presses Confirm once, as PM29 (5) asks of the harness: only once it
 * is offered and enabled, never while it is busy or waiting for a newer
 * result (`TimekeeperScreens.confirmOnce`), and never twice. The verdict
 * wait that follows (`TK.handshake`) covers `TK_CONFIRM_SETTLE_MS`.
 */
export async function blueConfirmsOnce(ctx: ScenarioCtx, title: string): Promise<void> {
  const presses = await ctx.step(title, () => new TimekeeperScreens(ctx.idb, ctx.ui).confirmOnce(TK.step));
  ctx.eq("ui:tk-confirm-one-press", 1, presses, "PM29 (5): Confirm pressed once, enabled, never while busy");
}

/**
 * Both athletes confirm (Blue on screen, Red's bot with the edit count);
 * both reach the verdict: Blue on screen, Red through the app's own routing
 * read from the database (TEST-PLAN 4.2 T1: the verdict on both athletes).
 */
export async function tkBothConfirm(ctx: ScenarioCtx, m: TkMatch): Promise<void> {
  const redRun = (async () => {
    await pace(ctx.opts.timing === "human" ? 1_200 : 100);
    return m.red.confirm();
  })();
  redRun.catch(() => undefined);
  await blueConfirmsOnce(ctx, "Blue confirms");
  const r = await redRun;
  ctx.eq("bot:red-confirm-ok", true, r.ok, r.ok ? undefined : `${r.code} ${r.message}`);
  await ctx.step("Blue reaches the verdict", () => ctx.ui.waitStep("summary", TK.handshake));
  const conf = await pollUntil("2 confirmations", async () => {
    const c = await db.confirmations(m.matchId);
    return c.length >= 2 ? c : undefined;
  }, { timeoutMs: 8_000 }).catch(() => db.confirmations(m.matchId));
  ctx.eq("db:confirmations-athletes-only", [...m.athletes].sort(), conf.map((c) => c.athlete_id).sort());
  await ctx.expect("bot:red-routed-to-the-verdict", "summary", () => m.red.waitTarget((t) => t === "summary", "the verdict", T.db));
}

/**
 * The finished match in the database: rated once, the timekeeper never a
 * participant, a single seat with no drop-out, TK-N7 to both athletes, and
 * the timekeeper's done state (Home no longer offers THIS match once both
 * confirmed, and its edit window is closed). `get_my_timekeeping_match` may
 * still return another match: one an earlier scenario left completed with
 * fewer than two confirmations stays in its edit window for 30 minutes.
 */
export async function checkTkDone(
  ctx: ScenarioCtx,
  m: Pick<TkMatch, "challengeId" | "matchId" | "athletes">,
  tk: TimekeeperBot,
  side: TimekeeperSide,
  x: { winner: string; loser: string; code: string; finish: number } | { draw: true },
): Promise<void> {
  ctx.eq("db:one-match-per-challenge", 1, (await db.matchesForChallenge(m.challengeId)).length);
  if ("draw" in x) {
    const parts = await db.participants(m.matchId);
    ctx.eq("db:draw-participants", ["draw", "draw"], parts.map((p) => p.outcome));
    ctx.eq("db:elo-history-rows", 2, (await db.eloHistory(m.matchId)).length);
  } else {
    ctx.eq("db:submission-row", { winner_id: x.winner, loser_id: x.loser, code: x.code, finish_time_seconds: x.finish }, await db.submission(m.matchId));
    await checkRatingMoved(ctx, { matchId: m.matchId, winner: x.winner, loser: x.loser, winnerDelta: null, loserDelta: null });
  }
  const parts = await db.participants(m.matchId);
  ctx.eq("db:participants-are-the-athletes", [...m.athletes].sort(), parts.map((p) => p.athlete_id).sort());
  const hist = await tkDb.history(m.matchId);
  ctx.eq("db:one-seat-no-drop-out", { seats: 1, droppedOut: false }, { seats: hist.filter((h) => h.timekeeper_id === tk.me.id).length, droppedOut: droppedOut(hist, tk.me.id) });
  const n = await tkDb.notifications(m.matchId);
  ctx.eq("db:athletes-told-recorded", [...m.athletes].sort(), recipientsOf(n, "timekeeper_result_recorded"), "TK-N7");
  const row = await tkDb.match(m.matchId);
  ctx.eq("db:recorded-by-the-timekeeper", { result_recorded_by_admin: false }, { result_recorded_by_admin: row?.result_recorded_by_admin });
  const mine = await tk.myTimekeepingMatch();
  ctx.eq(
    "bot:timekeeper-done-off-home",
    { ok: true, offersThisMatch: false },
    mine.ok ? { ok: true, offersThisMatch: mine.data?.matchId === m.matchId } : { ok: false, code: mine.error.code },
    mine.ok && mine.data ? `Home offers another match: ${mine.data.matchId} (${mine.data.status}), left by an earlier run` : "both confirmed: the edit window is closed, Home no longer offers the match (A24)",
  );
  const st = await side.state();
  ctx.eq("bot:timekeeper-edit-closed", false, st?.editOpen ?? null);
}

/**
 * A no contest in the database (A4, A7, A26): cancelled with the reason, no
 * rating anywhere, the seat history's reason and whether it is a drop-out,
 * the pushes, ELO untouched and the match absent from history (a history
 * read anchored on the database, `historyVerdict`, so a failed read fails).
 */
export async function checkNoContest(
  ctx: ScenarioCtx,
  m: TkMatch,
  x: { reason: string; timekeeperId: string | null; historyReason: string | null; dropOut: boolean; notified: { kind: string; recipients: string[] }[] },
  red: MobileOpponent,
): Promise<TkMatchDb | null> {
  const row = await tkDb.waitMatch(m.matchId, `cancelled ${x.reason}`, (r) => r.status === "cancelled", T.db).catch(() => tkDb.match(m.matchId));
  await ctx.expect("bot:red-routed-out", "exit", () => m.red.waitTarget((t) => t === "exit", "the exit", T.db));
  ctx.eq("db:no-contest", { status: "cancelled", cancel_reason: x.reason, result: null, rating_seq: null }, { status: row?.status, cancel_reason: row?.cancel_reason, result: row?.result, rating_seq: row?.rating_seq });
  ctx.eq("db:no-elo-history", 0, (await db.eloHistory(m.matchId)).length);
  const parts = await db.participants(m.matchId);
  ctx.eq("db:no-rating-snapshot", parts.map(() => ({ outcome: null, elo_after: null })), parts.map((p) => ({ outcome: p.outcome, elo_after: p.elo_after })));
  const [b, r] = await Promise.all([db.athlete(ctx.ids.blue), db.athlete(ctx.ids.red)]);
  ctx.eq("db:elo-unchanged", [FIXTURE_ELO, FIXTURE_ELO], [b?.current_elo, r?.current_elo]);
  if (x.timekeeperId) {
    const hist = await tkDb.history(m.matchId);
    const last = hist.filter((h) => h.timekeeper_id === x.timekeeperId).pop() ?? null;
    ctx.eq("db:seat-closed-with-reason", { left: true, left_reason: x.historyReason }, { left: !!last?.left_at, left_reason: last?.left_reason ?? null });
    ctx.eq("db:drop-out-recorded", x.dropOut, droppedOut(hist, x.timekeeperId), "A26: only left_prestart, offline_prestart, left_live and offline_live count");
  }
  const n = await pollUntil("the no-contest pushes", async () => {
    const rows = await tkDb.notifications(m.matchId);
    return x.notified.every((k) => recipientsOf(rows, k.kind).length >= k.recipients.length) ? rows : undefined;
  }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
  for (const k of x.notified) ctx.eq(`db:notified-${k.kind}`, [...k.recipients].sort(), recipientsOf(n, k.kind));
  // Red's own history, read as Red. Not through the shared getMatchHistory:
  // it returns [] on an error, which would read as "absent" (a pass). The
  // newest completed match is read first, so a match completed between the
  // two reads can only add to the RPC's rows.
  const newest = await tkDb.newestCompletedMatch(red.me.id);
  const read = await red.client.rpc("get_match_history", { p_athlete_id: red.me.id });
  const history = historyVerdict(read, newest, m.matchId);
  ctx.eq("db:history-read-anchored", "ok", history.anchor, `get_match_history as Red worked and lists Red's newest completed match (${newest ?? "none in the database"}), so the absence below is real`);
  ctx.eq("db:not-in-history", false, history.inHistory);
  return row;
}

/**
 * The TK-D9 chip is on Blue's screen and counting down (TEST-PLAN 4.2 T7
 * and T16): two reads `gapMs` apart, the second showing less time left.
 */
export async function expectChipCountsDown(ctx: ScenarioCtx, cast: TkCast, id: string, gapMs = 2_500): Promise<void> {
  await ctx.expect(id, true, async () => {
    const first = await pollUntil("TK-D9 on Blue's screen", async () => (await cast.ui.noContestChip()) ?? undefined, { timeoutMs: TK.step });
    await pace(gapMs);
    const second = await cast.ui.noContestChip();
    const [a, b] = [countdownSeconds(first), countdownSeconds(second)];
    if (a === null || b === null || !(b < a)) {
      throw new ExpectationTimeout("TK-D9 to count down", gapMs, { first, second, secondsLeft: [a, b] });
    }
    return true;
  });
}

/**
 * Start watching for toasts BEFORE the action that should raise one
 * (toasts last about 4 s), then `expectExitToast` once it happened.
 */
export function watchToasts(ctx: ScenarioCtx): ToastWatch {
  return new ToastWatch(ctx.idb);
}

/** Blue left the match for the Arena with the deck toast for this exit. */
export async function expectExitToast(ctx: ScenarioCtx, watch: ToastWatch, id: string, toast: TimekeeperToast): Promise<void> {
  try {
    await ctx.step("Blue is back on the Arena", () =>
      ctx.idb.waitAny([{ label: "Go live", type: "Button" }, { label: "Go offline", type: "Button" }], TK.step),
    );
    const want = toast.description.toLowerCase();
    const seen = await pollUntil(`the "${toast.description}" toast`, () => watch.toasts().find((t) => (t.label ?? "").toLowerCase().includes(want)), {
      timeoutMs: 8_000,
      intervalMs: 250,
      lastSeen: () => watch.toasts(),
    }).catch(() => null);
    ctx.oracle(`ui:${id}`, !!seen, { toast: toast.description }, seen ?? { seen: watch.toasts() });
  } finally {
    await watch.stop();
  }
}

/**
 * Run the sweep until `pred` holds for the match (the cron runs it every
 * minute too; this only saves the wait). Returns the row.
 */
export async function sweepUntil(ctx: ScenarioCtx, m: TkMatch, what: string, pred: (row: TkMatchDb) => boolean, timeoutMs = TK.sweep): Promise<TkMatchDb> {
  let last: TkMatchDb | null = null;
  const row = await pollUntil(
    `the sweep: ${what}`,
    async () => {
      await runTimekeeperTick();
      last = await tkDb.match(m.matchId);
      return last && pred(last) ? last : undefined;
    },
    { timeoutMs, intervalMs: 2_000, lastSeen: () => last && { status: last.status, cancel_reason: last.cancel_reason, ended_at: last.ended_at } },
  );
  ctx.trace.note("harness", "sweep_done", { what, status: row.status, cancel_reason: row.cancel_reason });
  return row;
}

/** Wait until a window measured from `fromIso` has passed (plus a margin), for a sweep. */
export async function waitPast(fromIso: string | null, seconds: number, marginMs = 1_500): Promise<void> {
  if (!fromIso) return;
  const wait = Date.parse(fromIso) + seconds * 1000 + marginMs - Date.now();
  if (wait > 0) await pace(wait);
}

/**
 * Pick a timekeeper and seat them. `blue`: Blue asks on the picker (needs
 * M2). `red`: Red's bot asks; `pickerUi` also checks Blue's picker follows it
 * (TK-P20, needs M2).
 */
export async function pickAndSeat(
  ctx: ScenarioCtx,
  cast: TkCast,
  m: TkMatch,
  tk: TimekeeperBot,
  by: "blue" | "red",
  opts: { pickerUi?: boolean } = {},
): Promise<TimekeeperSide> {
  const req = by === "blue" ? await blueAsks(ctx, cast, tk, m) : await redAsks(ctx, cast, tk, m, opts);
  return seat(ctx, tk, req, m);
}

/** Leave from the face-off or the picker (the shipped alert), for scenarios that must clean up. */
export async function blueLeavesFromCrew(ctx: ScenarioCtx): Promise<void> {
  await ctx.step("Blue leaves from crew", async () => {
    await ctx.idb.tapQ(TK_UI.crewLeave, 10_000);
    await ctx.ui.tapAlertButton("Cancel Match", "Keep Waiting");
  });
}
