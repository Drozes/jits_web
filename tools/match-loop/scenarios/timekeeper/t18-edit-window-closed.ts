import type { Scenario } from "../context";
import { tkDb } from "../../oracle/tk-db";
import { TK_UI } from "../../sim/timekeeper-screens";
import { pace } from "../../lib/util";
import {
  finishWithin,
  pickAndSeat,
  tkBlueChallengesRed,
  tkBothConfirm,
  tkEnd,
  tkFaceoffToLive,
  tkRecord,
  tkScenario,
  TK,
  waitPast,
} from "./tk-flows";

const EDIT_S = 20;

/**
 * T18 (TEST-PLAN 4.2, A24), Blue the challenger: the timekeeper tries to
 * edit after the window. With the edit window shortened to 20 s
 * (`tk_edit_window`; production 30 minutes from `completed_at`) the edit is
 * refused `edit_window_closed`, nothing changes (`result_edit_count` 0, the
 * winner as recorded), the timekeeper's state reads the window closed, and
 * Blue stays on confirm with no TK-RC1. Both then confirm.
 */
const scenario: Scenario = {
  id: "T18",
  tier: "timekeeper",
  title: "Edit window closed: the timekeeper's late edit is refused edit_window_closed, Blue stays on confirm",
  needs: ["M3", "M4", "M5", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { windows: { tk_edit_window: EDIT_S } }, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      const { finalElapsedS } = await tkEnd(ctx, m, side);
      const finish = finishWithin(finalElapsedS);
      await tkRecord(ctx, cast, m, cast.green, side, { result: "submission", winnerId: ctx.ids.blue, submissionCode: "armbar", finishTimeSeconds: finish });
      const done = await tkDb.match(m.matchId);
      await ctx.step("the edit window passes", () => waitPast(done?.completed_at ?? null, EDIT_S));
      const st = await side.state();
      ctx.eq("bot:edit-window-closed-in-state", false, st?.editOpen ?? null);
      const edit = await ctx.step("Green tries to edit after the window", () =>
        side.edit({ result: "submission", winnerId: ctx.ids.red, submissionCode: "armbar", finishTimeSeconds: finish }),
      );
      ctx.eq("bot:edit-refused", "EDIT_WINDOW_CLOSED", edit.ok ? "edited" : edit.error.code);
      const row = await tkDb.match(m.matchId);
      ctx.eq("db:result-unchanged", { result_edit_count: 0, edited: false }, { result_edit_count: row?.result_edit_count, edited: !!row?.result_edited_at });
      await pace(3_000);
      ctx.eq("ui:still-on-confirm", "confirm", await ctx.ui.currentStep());
      ctx.eq("ui:no-tk-rc1", false, await cast.ui.hasLabel(TK_UI.changedResult(cast.green.me.displayName)));
      await tkBothConfirm(ctx, m);
    });
  },
};
export default scenario;
