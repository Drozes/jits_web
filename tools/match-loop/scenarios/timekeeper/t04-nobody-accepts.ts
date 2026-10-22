import type { Scenario } from "../context";
import { tkDb } from "../../oracle/tk-db";
import { pollUntil } from "../../lib/util";
import { checkNoContest, C, expectExitToast, sweepUntil, tkBlueChallengesRed, tkScenario, TK, waitPast, watchToasts } from "./tk-flows";

/** Above Blue's arrival on crew and the TK-W1 wait (up to TK.step each) that precede the sweep. */
const DEADLINE_S = 60;

/**
 * T4 (TEST-PLAN 4.2), Blue the challenger: nobody accepts. With the pick
 * deadline shortened to 60 s (`tk_pick_deadline`, set before the match is
 * created, since the deadline is stamped at INSERT) Blue's picker counts it
 * down (TK-W1), then the sweep cancels the match `no_timekeeper`: TK-N4 to
 * both athletes, no rating anywhere, and Blue exits to the Arena with TK-W2.
 */
const scenario: Scenario = {
  id: "T4",
  tier: "timekeeper",
  title: "Nobody accepts within the (shortened) 10 minutes: cancelled no_timekeeper, TK-W2, Arena",
  needs: ["M2", "M4", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { windows: { tk_pick_deadline: DEADLINE_S } }, async (cast) => {
      const m = await tkBlueChallengesRed(ctx, cast);
      const row = await tkDb.match(m.matchId);
      const created = Date.parse(row?.created_at ?? "");
      const deadline = Date.parse(row?.timekeeper_deadline_at ?? "");
      ctx.oracle(
        "db:deadline-from-the-window",
        Number.isFinite(created) && Number.isFinite(deadline) && Math.abs(deadline - created - DEADLINE_S * 1000) < 5_000,
        `created_at + ${DEADLINE_S}s`,
        { created_at: row?.created_at, timekeeper_deadline_at: row?.timekeeper_deadline_at },
      );
      await ctx.expect("ui:pick-deadline-chip-tk-w1", true, () =>
        pollUntil("TK-W1 on the picker", async () => ((await cast.ui.deadlineChip()) ? true : undefined), { timeoutMs: TK.step }),
      );
      const watch = watchToasts(ctx);
      await ctx.step("the pick deadline passes", () => waitPast(row?.timekeeper_deadline_at ?? null, 0));
      await ctx.step("the sweep cancels the match", () => sweepUntil(ctx, m, "cancelled no_timekeeper", (r) => r.status === "cancelled"));
      await expectExitToast(ctx, watch, "exit-toast-tk-w2", C["TK-W2"]);
      await checkNoContest(ctx, m, { reason: "no_timekeeper", timekeeperId: null, historyReason: null, dropOut: false, notified: [{ kind: "timekeeper_expired", recipients: m.athletes }] }, cast.red);
    });
  },
};
export default scenario;
