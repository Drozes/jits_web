import type { Scenario, ScenarioCtx } from "../context";
import { queryJson } from "../../lib/psql";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { PLATFORM_ROLE_COLUMNS, runTimekeeperTick, withAthleteColumns } from "../../fixtures/timekeeper";
import { TK_UI } from "../../sim/timekeeper-screens";
import { EnvError, HarnessError, pollUntil } from "../../lib/util";
import {
  finishWithin,
  pickAndSeat,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkRedChallengesBlue,
  tkScenario,
  TK,
  waitPast,
  type TkCast,
} from "./tk-flows";

const STALL_S = 20;

/** Every athlete TK-N12 must reach: platform_role admin or founder (the `is_admin()` set, A27). */
async function adminsAndFounders(): Promise<string[]> {
  const rows = await queryJson<{ id: string }>(`select id from public.athletes where platform_role in ('admin', 'founder')`);
  return rows.map((a) => a.id).sort();
}

/**
 * T8 (TEST-PLAN 4.2), Blue the opponent: the timekeeper ends the clock and
 * does not record. With the stall window shortened to 20 s
 * (`tk_stall_window`; production 10 minutes) the sweep writes ONE
 * `result_stall` flag and never cancels: the match is still `in_progress`,
 * the athletes get TK-N10 and every admin and founder TK-N12, and Blue sees
 * TK-D8. The timekeeper can still record until an admin acts: the late
 * record resolves the flag, and both athletes confirm.
 *
 * The seeded stack has no admin or founder, so TK-N12 would have no
 * recipient and its oracle would compare two empty lists. The fourth
 * account (Demo Gold: neither an athlete nor the timekeeper here) is made an
 * admin for the scenario only (`withAthleteColumns`: the original role is
 * recorded first, put back afterwards and repaired after a killed run). A
 * stack where that admin cannot be read back is an `env_error`, never a
 * pass.
 */
const scenario: Scenario = {
  id: "T8",
  tier: "timekeeper",
  title: "Result stall: the timekeeper ends and does not record, TK-D8, flag written, still in progress; a late record resolves it",
  needs: ["M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { windows: { tk_stall_window: STALL_S } }, async (cast) => {
      const gold = ctx.fourthId;
      if (!gold) throw new HarnessError("T8 needs the fourth account (tkScenario provisions it)");
      await withAthleteColumns([gold], PLATFORM_ROLE_COLUMNS, () => stall(ctx, cast, gold), { platform_role: "admin" });
    });
  },
};

async function stall(ctx: ScenarioCtx, cast: TkCast, gold: string): Promise<void> {
  const before = await adminsAndFounders();
  ctx.trace.note("harness", "admins_and_founders", before);
  if (!before.includes(gold)) {
    throw new EnvError(`T8 made Demo Gold (${gold}) an admin, but the admins and founders read back are ${JSON.stringify(before)}: TK-N12 cannot be checked`);
  }
  const m = await tkRedChallengesBlue(ctx, cast);
  const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
  await tkFaceoffToLive(ctx, cast, m, cast.green, side);
  const { finalElapsedS } = await tkEnd(ctx, m, side);
  const ended = await tkDb.match(m.matchId);
  await ctx.step("the stall window passes", () => waitPast(ended?.ended_at ?? null, STALL_S));
  const flags = await ctx.step("the sweep flags the stall", () =>
    pollUntil("a result_stall flag", async () => {
      await runTimekeeperTick();
      const f = await tkDb.flags(m.matchId);
      return f.some((x) => x.kind === "result_stall") ? f : undefined;
    }, { timeoutMs: TK.sweep, intervalMs: 2_000 }),
  );
  await runTimekeeperTick(); // a second tick must not flag again (once)
  ctx.eq("db:one-stall-flag-open", [{ kind: "result_stall", resolved_at: null }], (await tkDb.flags(m.matchId)).filter((f) => f.kind === "result_stall"));
  ctx.trace.note("harness", "stall_flags", flags);
  const row = await tkDb.match(m.matchId);
  ctx.eq("db:stall-never-cancels", { status: "in_progress", ended: true }, { status: row?.status, ended: !!row?.ended_at });
  // The set the server notified (it reads it at the flag): Gold at least.
  const admins = await adminsAndFounders();
  if (admins.length === 0) throw new EnvError("no admin or founder on the stack when the stall was flagged: TK-N12 cannot be checked");
  const n = await pollUntil("TK-N10 and TK-N12", async () => {
    const rows = await tkDb.notifications(m.matchId);
    const told = recipientsOf(rows, "timekeeper_result_review").length >= 2 && recipientsOf(rows, "admin_result_review").length >= admins.length;
    return told ? rows : undefined;
  }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
  ctx.eq("db:athletes-told-review", [...m.athletes].sort(), recipientsOf(n, "timekeeper_result_review"), "TK-N10");
  ctx.eq("db:admins-told-review", admins, recipientsOf(n, "admin_result_review"), "TK-N12 to every admin and founder (Demo Gold made an admin for T8)");
  ctx.eq("db:admin-review-about-the-timekeeper", admins, recipientsOf(n, "admin_result_review", cast.green.me.id), "TK-N12's subject is the timekeeper");
  await ctx.expect("ui:result-review-tk-d8", true, async () => {
    await cast.ui.waitLabel(TK_UI.resultReview(cast.green.me.displayName), TK.step);
    return true;
  });
  // Recording late resolves the flag.
  await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finishWithin(finalElapsedS) });
  const resolved = await tkDb.flags(m.matchId);
  ctx.eq("db:late-record-resolves-the-flag", true, resolved.some((f) => f.kind === "result_stall" && !!f.resolved_at));
  await tkBothConfirm(ctx, m);
}

export default scenario;
