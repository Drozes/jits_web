import type { Scenario } from "../context";
import { startDecision } from "../../bot/timekeeper";
import { db } from "../../oracle/db";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { pace, pollUntil } from "../../lib/util";
import { T } from "../flows";
import {
  bothRouted,
  checkRequestOpen,
  checkSeatedDb,
  checkTkCreatedDb,
  checkTkDone,
  finishWithin,
  tkCreationFlags,
  tkScenario,
  TK,
} from "./tk-flows";
import { withFlags } from "../../fixtures/timekeeper";

/**
 * T0 (an M7 addition to TEST-PLAN 4.2, like E3B to the extended tier): the
 * whole timekeeper bot protocol with bots only, so every timekeeper-tier
 * run exercises `bot/timekeeper.ts` and the backend contract it drives, on
 * any build (it needs no mobile slice: the simulator, Blue, stays an idle
 * athlete offline on the Arena and is never in the match, PM18).
 *
 * Red and Green are the athletes (both send the capability header, so the
 * match snapshots timekeeper mode with the flag on for its creation only);
 * Gold is the timekeeper (asked by Red, records the AI consent before the
 * accept). The run covers the request, the seat, a flag probe (Gold flags
 * Green: the flag is one of the Start blockers and Start is refused; Gold
 * withdraws it), the verdicts quoting the rated weight, Start, pause,
 * resume, the clock end, the record (no confirmation row), Red's confirm,
 * the edit (Red's confirmation deleted, the rating replayed once, TK-N9),
 * both confirms and the done state. Each beat is asserted in the database
 * and through each athlete's routing (`targetFor`); the protocol oracles
 * check every broadcast's shape, `actor_id` included.
 *
 * If the edit is refused (a backend defect), the scenario records it and
 * finishes on the recorded result instead, so the rest of the protocol is
 * still checked and no open result is left behind.
 */
const scenario: Scenario = {
  id: "T0",
  tier: "timekeeper",
  title: "Bots-only timekeeper protocol: request, seat, flag probe, start, pause, end, record, confirm, edit, done",
  needs: [],
  async run(ctx) {
    await tkScenario(ctx, { gold: true, blueLive: false }, async (cast) => {
      const red = cast.red;
      const green = cast.green.bot; // an athlete here; Green's timekeeper listener stays idle
      const tk = cast.gold!;
      const note = (what: string, payload: unknown) => ctx.trace.note("harness", what, payload);

      await ctx.step("Red and Green go live", async () => {
        await red.goLive();
        await green.goLive();
      });
      const challengeId = await ctx.step("Red challenges Green", () => red.challenge(green.me.id));
      const incoming = await ctx.step("Green receives the challenge", () => green.waitForIncoming(T.prompt, red.me.id));
      ctx.eq("bot:incoming-is-the-challenge", challengeId, incoming.id);
      const matchId = await ctx.step("Green accepts (timekeeper_role on for the match's creation only)", () =>
        withFlags(tkCreationFlags(true), () => green.accept(incoming.id), note),
      );
      const m = { challengeId, matchId, athletes: [red.me.id, green.me.id] as [string, string] };
      await checkTkCreatedDb(ctx, m, true);
      const redSide = ctx.tkAthleteSide(red, matchId, green.me.id, "challenger");
      const greenSide = ctx.tkAthleteSide(green, matchId, red.me.id, "opponent");
      const sides = [redSide, greenSide];
      await bothRouted(ctx, "bot:athletes-on-crew", "crew", sides);

      // Pick and seat.
      const asked = await ctx.step("Red asks Gold to timekeep", () => redSide.requestTimekeeper(tk.me.id));
      ctx.eq("bot:request-ok", true, asked.ok, asked.ok ? undefined : `${asked.error.code} ${asked.error.message}`);
      const req = await ctx.step("Gold receives the request", () => tk.waitForRequest(TK.request, matchId));
      await checkRequestOpen(ctx, m, req, red.me.id, tk);
      const side = await ctx.step("Gold accepts (consent first when missing) and is seated", () => tk.acceptAndSeat(req.id, m.athletes));
      await checkSeatedDb(ctx, tk, req, m);
      ctx.eq("db:timekeeper-consented", true, await tkDb.consented(tk.me.id), "TK-T7, TK-T8: accept needs the AI consent");
      await bothRouted(ctx, "bot:athletes-on-the-face-off", "weight", sides);

      // Flag probe: the flag holds Start (as one blocker among others), then is withdrawn.
      const rr = await ctx.step("Red readies (TK-F4)", () => redSide.markReady());
      ctx.eq("bot:red-ready-ok", true, rr.ok, rr.ok ? undefined : `${rr.error.code} ${rr.error.message}`);
      const confirmRed = await ctx.step("Gold confirms Red's weigh-in", () => side.verdict(red.me.id, "confirm"));
      ctx.eq("bot:confirm-red-ok", true, confirmRed.ok, confirmRed.ok ? undefined : confirmRed.error.code);
      const flag = await ctx.step("Gold flags Green's weigh-in", () => side.verdict(green.me.id, "flag"));
      ctx.eq("bot:flag-green-ok", true, flag.ok, flag.ok ? undefined : flag.error.code);
      ctx.eq("db:green-flagged", [{ subject_id: green.me.id, status: "flagged" }], (await tkDb.timekeeperChecks(matchId)).filter((c) => c.subject_id === green.me.id));
      const held = await side.state();
      ctx.eq(
        "bot:start-held-by-the-flag",
        { start: false, flagged: true },
        { start: startDecision(held).start, flagged: held?.startBlockers.includes("weight_flagged") ?? null },
        `Start blockers: ${JSON.stringify(held?.startBlockers ?? null)}`,
      );
      const refused = await ctx.step("Gold tries to start anyway", () => side.startMatch());
      ctx.eq("bot:start-refused-while-held", false, refused.ok, refused.ok ? "started" : refused.error.code);
      const withdrawn = await ctx.step("Gold withdraws the flag", () => side.verdict(green.me.id, "withdraw"));
      ctx.eq("bot:withdraw-ok", true, withdrawn.ok, withdrawn.ok ? undefined : withdrawn.error.code);
      ctx.eq("bot:flag-no-longer-a-blocker", false, (await side.state())?.startBlockers.includes("weight_flagged") ?? null);
      const gr = await ctx.step("Green readies (TK-F4)", () => greenSide.markReady());
      ctx.eq("bot:green-ready-ok", true, gr.ok, gr.ok ? undefined : `${gr.error.code} ${gr.error.message}`);
      await ctx.expect("db:both-athletes-ready", [...m.athletes].sort(), () =>
        pollUntil("both match_ready rows", async () => {
          const r = await tkDb.ready(matchId);
          return r.length === 2 ? r : undefined;
        }, { timeoutMs: T.db }),
      );
      const blockers = await ctx.step("Gold confirms what is owed and waits for no Start blocker", () => side.waitStartable(true, TK.start));
      note("start_blockers_seen", blockers);
      ctx.eq("db:timekeeper-checks", [...m.athletes].sort().map((subject_id) => ({ subject_id, status: "confirmed" })), await tkDb.timekeeperChecks(matchId));

      // The clock.
      const started = await ctx.step("Gold starts the match", () => side.startMatch());
      ctx.eq("bot:timekeeper-start-ok", true, started.ok, started.ok ? undefined : `${started.error.code} ${started.error.message}`);
      const live = await tkDb.match(matchId);
      ctx.eq("db:match-in-progress", { status: "in_progress", started: true, ended: false }, { status: live?.status, started: !!live?.started_at, ended: !!live?.ended_at });
      await bothRouted(ctx, "bot:athletes-live", "live", sides);
      await ctx.step("Gold pauses", () => side.pause());
      const paused = await tkDb.waitMatch(matchId, "paused", (x) => !!x.paused_at, T.db).catch(() => tkDb.match(matchId));
      ctx.eq("db:paused", true, !!paused?.paused_at);
      await pace(1_500);
      await ctx.step("Gold resumes", () => side.resume());
      const resumed = await tkDb.waitMatch(matchId, "resumed", (x) => !x.paused_at, T.db).catch(() => tkDb.match(matchId));
      ctx.eq("db:resumed", { paused_at: null, paused_some: true }, { paused_at: resumed?.paused_at ?? null, paused_some: (resumed?.total_paused_duration ?? 0) > 0 });
      await pace(1_500);
      const end = await ctx.step("Gold ends the clock", () => side.endClock());
      const ended = await tkDb.match(matchId);
      ctx.eq(
        "db:clock-ended-still-in-progress",
        { status: "in_progress", ended: true, final_elapsed_s: end.finalElapsedS },
        { status: ended?.status, ended: !!ended?.ended_at, final_elapsed_s: ended?.final_elapsed_s },
      );
      await bothRouted(ctx, "bot:athletes-on-result", "result", sides);

      // The result: recorded for Red, confirmed by Red, then corrected to Green.
      const finish = finishWithin(end.finalElapsedS, 30);
      const rec = await ctx.step("Gold records Red's submission", () =>
        side.record({ result: "submission", winnerId: red.me.id, submissionCode: "armbar", finishTimeSeconds: finish }),
      );
      ctx.eq("bot:timekeeper-record-ok", { ok: true }, rec);
      const done = await tkDb.match(matchId);
      ctx.eq("db:match-completed", { status: "completed", result: "submission" }, { status: done?.status, result: done?.result });
      ctx.eq("db:no-confirmation-at-record", 0, (await db.confirmations(matchId)).length, "the timekeeper's record confirms nobody");
      await bothRouted(ctx, "bot:athletes-on-confirm", "confirm", sides);
      const redFirst = await ctx.step("Red confirms the recorded result", () => redSide.confirm());
      ctx.eq("bot:red-confirm-ok", true, redFirst.ok, redFirst.ok ? undefined : `${redFirst.code} ${redFirst.message}`);
      const edit = await ctx.step("Gold corrects the winner to Green", () =>
        side.edit({ result: "submission", winnerId: green.me.id, submissionCode: "armbar", finishTimeSeconds: finish }, 0),
      );
      const edited = ctx.eq(
        "bot:edit-ok",
        { ok: true, resultEditCount: 1 },
        edit.ok ? { ok: true, resultEditCount: edit.data.resultEditCount } : { ok: false, code: edit.error.code, message: edit.error.message },
      );
      if (edited) {
        const row = await tkDb.match(matchId);
        ctx.eq("db:edited", { result_edit_count: 1, edited: true, status: "completed" }, { result_edit_count: row?.result_edit_count, edited: !!row?.result_edited_at, status: row?.status });
        ctx.eq("db:early-confirmation-gone", [], (await db.confirmations(matchId)).map((c) => c.athlete_id));
        ctx.eq("db:corrected-winner", { winner_id: green.me.id, loser_id: red.me.id }, await db.submission(matchId).then((x) => x && { winner_id: x.winner_id, loser_id: x.loser_id }));
        ctx.eq("db:rating-replayed-once", 2, (await db.eloHistory(matchId)).length, "replay rewrites the match's two rows, never adds two more");
        const n = await pollUntil("TK-N9 to both athletes", async () => {
          const rows = await tkDb.notifications(matchId);
          return recipientsOf(rows, "timekeeper_result_edited").length >= 2 ? rows : undefined;
        }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(matchId));
        ctx.eq("db:athletes-told-edited", [...m.athletes].sort(), recipientsOf(n, "timekeeper_result_edited"), "TK-N9");
        await bothRouted(ctx, "bot:athletes-back-on-confirm", "confirm", sides);
        const redAgain = await ctx.step("Red confirms the corrected result", () => redSide.confirm());
        ctx.eq("bot:red-reconfirm-ok", true, redAgain.ok, redAgain.ok ? undefined : `${redAgain.code} ${redAgain.message}`);
      } else {
        note("edit_refused_finishing_on_the_recorded_result", edit.ok ? null : edit.error);
      }
      const greenConfirm = await ctx.step("Green confirms", () => greenSide.confirm());
      ctx.eq("bot:green-confirm-ok", true, greenConfirm.ok, greenConfirm.ok ? undefined : `${greenConfirm.code} ${greenConfirm.message}`);
      const conf = await pollUntil("2 confirmations", async () => {
        const c = await db.confirmations(matchId);
        return c.length >= 2 ? c : undefined;
      }, { timeoutMs: 8_000 }).catch(() => db.confirmations(matchId));
      ctx.eq("db:confirmations-athletes-only", [...m.athletes].sort(), conf.map((c) => c.athlete_id).sort());
      await bothRouted(ctx, "bot:athletes-on-the-verdict", "summary", sides);
      const [winner, loser] = edited ? [green.me.id, red.me.id] : [red.me.id, green.me.id];
      await checkTkDone(ctx, m, tk, side, { winner, loser, code: "armbar", finish });
    });
  },
};
export default scenario;
