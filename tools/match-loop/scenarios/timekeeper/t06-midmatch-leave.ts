import type { Scenario } from "../context";
import { pace } from "../../lib/util";
import { checkNoContest, C, expectExitToast, pickAndSeat, short, tkFaceoffToLive, tkRedChallengesBlue, tkScenario, watchToasts } from "./tk-flows";

/**
 * T6 (TEST-PLAN 4.2), Blue the opponent: the timekeeper leaves while the
 * clock runs, a no contest at once (A4). Blue sees TK-NC1 and exits to the
 * Arena. The timekeeper's own side (TK-NC3 cannot be shown on a bot) is
 * asserted in the DB: `cancel_reason = 'timekeeper_left'`, the seat closed
 * `left_live` (a drop-out), a `match_no_contest` row for the timekeeper too
 * (TK-N6b) and for both athletes (TK-N6); no rating, not in history.
 */
const scenario: Scenario = {
  id: "T6",
  tier: "timekeeper",
  title: "The timekeeper leaves mid-match: no contest timekeeper_left, TK-NC1, no rating",
  needs: ["M3", "M4", "M8"],
  async run(ctx) {
    await tkScenario(ctx, {}, async (cast) => {
      const m = await tkRedChallengesBlue(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      await pace(ctx.opts.timing === "human" ? 3_000 : 1_000);
      const watch = watchToasts(ctx);
      const left = await ctx.step("Green leaves while the clock runs", () => side.leave());
      ctx.eq("bot:timekeeper-leave-live", { ok: true, status: "cancelled" }, left.ok ? { ok: true, status: left.data.status } : { ok: false, status: left.error.code });
      await expectExitToast(ctx, watch, "exit-toast-tk-nc1", C["TK-NC1"](short(cast.green.me.displayName)));
      await checkNoContest(
        ctx,
        m,
        {
          reason: "timekeeper_left",
          timekeeperId: cast.green.me.id,
          historyReason: "left_live",
          dropOut: true,
          notified: [{ kind: "match_no_contest", recipients: [...m.athletes, cast.green.me.id] }],
        },
        cast.red,
      );
    });
  },
};
export default scenario;
