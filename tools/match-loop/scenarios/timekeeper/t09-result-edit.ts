import type { Scenario } from "../context";
import { checkSummary, exitToArena } from "../flows";
import { db } from "../../oracle/db";
import { recipientsOf, tkDb } from "../../oracle/tk-db";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pollUntil } from "../../lib/util";
import {
  blueAsks,
  blueConfirmsOnce,
  checkTkDone,
  finishWithin,
  seat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkScenario,
  TK,
} from "./tk-flows";

/**
 * T9 (TEST-PLAN 4.2), Blue the challenger: the timekeeper records the WRONG
 * winner (Red), Blue confirms it, then the timekeeper edits it within the
 * 30-minute window (A8, A24). Blue's early confirmation is deleted, the
 * result is Blue's win, the rating is replayed once (two `elo_history` rows
 * for the match, never four), TK-N9 goes to both athletes, and Blue is back
 * on confirm with TK-RC1. Both confirm the corrected result.
 */
const scenario: Scenario = {
  id: "T9",
  tier: "timekeeper",
  title: "Result edit then re-confirm: wrong winner, Blue confirms, the timekeeper edits, TK-RC1, both confirm again",
  needs: ["M2", "M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, {}, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const req = await blueAsks(ctx, cast, cast.green, m);
      const side = await seat(ctx, cast.green, req, m);
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      const { finalElapsedS } = await tkEnd(ctx, m, side);
      const finish = finishWithin(finalElapsedS);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.red, submissionCode: "armbar", finishTimeSeconds: finish });
      await blueConfirmsOnce(ctx, "Blue confirms the (wrong) result");
      await ctx.step("Blue reaches the verdict", () => ctx.ui.waitStep("summary", TK.handshake));
      await ctx.expect("db:blue-confirmed-early", [ctx.ids.blue], () =>
        pollUntil("Blue's confirmation", async () => {
          const c = await db.confirmations(m.matchId);
          return c.length ? c.map((r) => r.athlete_id) : undefined;
        }, { timeoutMs: TK.db }),
      );
      const edit = await ctx.step("the timekeeper corrects the winner", () =>
        side.edit({ result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finish }, 0),
      );
      ctx.eq("bot:edit-ok", { ok: true, resultEditCount: 1 }, edit.ok ? { ok: true, resultEditCount: edit.data.resultEditCount } : { ok: false, resultEditCount: edit.error.code });
      const row = await tkDb.match(m.matchId);
      ctx.eq("db:edited", { result_edit_count: 1, edited: true, status: "completed" }, { result_edit_count: row?.result_edit_count, edited: !!row?.result_edited_at, status: row?.status });
      ctx.eq("db:early-confirmation-gone", [], (await db.confirmations(m.matchId)).map((c) => c.athlete_id));
      ctx.eq("db:corrected-winner", { winner_id: ctx.ids.blue, loser_id: ctx.ids.red }, await db.submission(m.matchId).then((s) => s && { winner_id: s.winner_id, loser_id: s.loser_id }));
      ctx.eq("db:rating-replayed-once", 2, (await db.eloHistory(m.matchId)).length, "replay rewrites the match's two rows, never adds two more");
      const n = await pollUntil("TK-N9", async () => {
        const rows = await tkDb.notifications(m.matchId);
        return recipientsOf(rows, "timekeeper_result_edited").length >= 2 ? rows : undefined;
      }, { timeoutMs: 5_000 }).catch(() => tkDb.notifications(m.matchId));
      ctx.eq("db:athletes-told-edited", [...m.athletes].sort(), recipientsOf(n, "timekeeper_result_edited"), "TK-N9");
      await ctx.step("Blue is back on confirm", () => ctx.ui.waitStep("confirm", TK.step));
      await ctx.expect("ui:changed-the-result-tk-rc1", true, async () => {
        await cast.ui.waitLabel(TK_UI.changedResult(cast.green.me.displayName), TK.step);
        return true;
      });
      await tkBothConfirm(ctx, m);
      await checkSummary(ctx, "YOU WON", { matchId: m.matchId, stake: null });
      await checkTkDone(ctx, m, cast.green, side, { winner: ctx.ids.blue, loser: ctx.ids.red, code: "armbar", finish });
      await exitToArena(ctx);
    });
  },
};
export default scenario;
