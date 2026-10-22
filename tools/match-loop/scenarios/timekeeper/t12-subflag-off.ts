import type { Scenario, ScenarioCtx } from "../context";
import { checkSummary, exitToArena } from "../flows";
import { tkDb } from "../../oracle/tk-db";
import { summarise, type AXElement } from "../../sim/idb";
import { TK_UI } from "../../sim/timekeeper-screens";
import { ExpectationTimeout, pollUntil } from "../../lib/util";
import {
  checkTkDone,
  finishWithin,
  pickAndSeat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkScenario,
  TK,
  type TkCast,
} from "./tk-flows";

/**
 * Blue's face-off shows the timekeeper row (TK-F1, naming this timekeeper)
 * and no timekeeper verdict state (TK-F2, TK-F3) in that same screen read.
 * The row is the positive anchor: without it, "no state" could pass on a
 * face-off whose timekeeper row has not rendered yet.
 */
async function checkNoVerdictState(ctx: ScenarioCtx, cast: TkCast, when: string): Promise<void> {
  const row = TK_UI.timekeeperRow(cast.green.me.displayName);
  const anchor = `ui:timekeeper-row-drawn-${when}`;
  let read: AXElement[];
  try {
    read = await pollUntil("the timekeeper row (TK-F1) on Blue's face-off", async () => {
      const els = await ctx.idb.describe();
      return els.some((e) => row.test(e.AXLabel ?? "")) ? els : undefined;
    }, { timeoutMs: TK.step, intervalMs: 400 });
  } catch (e) {
    if (!(e instanceof ExpectationTimeout)) throw e;
    ctx.oracle(anchor, false, true, { timeout: e.what, lastSeen: e.lastSeen });
    ctx.skip(`ui:no-timekeeper-verdict-state-${when}`, "the timekeeper row never showed, so its state cannot be read (see the failed anchor)");
    return;
  }
  ctx.oracle(anchor, true, true, true);
  // The same screen read that showed the row: the state is read beside it.
  const state = read.filter((e) => TK_UI.verdictState.test(e.AXLabel ?? "")).map((e) => e.AXLabel);
  ctx.eq(`ui:no-timekeeper-verdict-state-${when}`, [], state, "A19: TK-F2 / TK-F3 only when the match has the timekeeper check");
  ctx.trace.note("harness", `timekeeper_row_${when}`, summarise(read.filter((e) => row.test(e.AXLabel ?? ""))));
}

/**
 * T12 (TEST-PLAN 4.2, A19), Blue the challenger: the sub-flag
 * `timekeeper_weight_check` is OFF when the match is created (it is
 * snapshotted with the mode). The match has no timekeeper weight check: a
 * timekeeper verdict is refused `weight_check_not_required`, Blue's
 * face-off shows the timekeeper row with no verdict state (TK-F2, TK-F3)
 * right after the seat and again once both athletes are ready, the athletes
 * still do their own opponent check (TK-F4), and the timekeeper starts after
 * the readies alone. T1 to T10 run with the sub-flag ON, so both states are
 * covered.
 */
const scenario: Scenario = {
  id: "T12",
  tier: "timekeeper",
  title: "Sub-flag timekeeper_weight_check OFF at creation: no timekeeper verdicts, athletes still check, Start after ready",
  needs: ["M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, {}, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast, false);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      const v = await ctx.step("Green tries a verdict", () => side.verdict(ctx.ids.blue, "confirm"));
      ctx.eq("bot:verdict-refused-not-required", "WEIGHT_CHECK_NOT_REQUIRED", v.ok ? "accepted" : v.error.code);
      await checkNoVerdictState(ctx, cast, "after-seat");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side, false, { onBothReady: () => checkNoVerdictState(ctx, cast, "after-ready") });
      ctx.eq("db:no-timekeeper-checks", [], await tkDb.timekeeperChecks(m.matchId));
      const { finalElapsedS } = await tkEnd(ctx, m, side);
      const finish = finishWithin(finalElapsedS);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finish });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "YOU WON", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, cast.green, side, { winner: ctx.ids.blue, loser: ctx.ids.red, code: "armbar", finish });
      await exitToArena(ctx);
    });
  },
};
export default scenario;
