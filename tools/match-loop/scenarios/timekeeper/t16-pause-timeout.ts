import type { Scenario } from "../context";
import { tkDb } from "../../oracle/tk-db";
import { checkNoContest, C, expectChipCountsDown, expectExitToast, pickAndSeat, sweepUntil, tkFaceoffToLive, tkRedChallengesBlue, tkScenario, TK, waitPast, watchToasts } from "./tk-flows";

/** From `paused_at`: above the TK-D9 wait (up to TK.step) that precedes the sweep. */
const PAUSE_S = 60;

/**
 * T16 (TEST-PLAN 4.2, A26), Blue the opponent: the timekeeper pauses and
 * never resumes. With the pause window shortened to 60 s
 * (`tk_pause_window`; production 10 minutes from `paused_at`) the sweep
 * makes it a no contest `pause_timeout`: not a drop-out while the
 * timekeeper stays online (heartbeats keep running), TK-N11 to all three,
 * TK-D9 counted down on Blue while paused, then TK-NC7.
 */
const scenario: Scenario = {
  id: "T16",
  tier: "timekeeper",
  title: "Pause timeout: the timekeeper pauses and never resumes, TK-D9 while paused, no contest pause_timeout, TK-NC7",
  needs: ["M3", "M4", "M8"],
  async run(ctx) {
    await tkScenario(ctx, { tab: "Home", windows: { tk_pause_window: PAUSE_S } }, async (cast) => {
      const m = await tkRedChallengesBlue(ctx, cast);
      const side = await pickAndSeat(ctx, cast, m, cast.green, "red");
      await tkFaceoffToLive(ctx, cast, m, cast.green, side);
      const pausedAt = await ctx.step("Green pauses and walks away (still online)", () => side.pause());
      const row = await tkDb.waitMatch(m.matchId, "paused", (x) => !!x.paused_at, TK.db).catch(() => tkDb.match(m.matchId));
      ctx.eq("db:paused", true, !!row?.paused_at);
      await expectChipCountsDown(ctx, cast, "ui:pause-timeout-chip-tk-d9");
      const watch = watchToasts(ctx);
      await ctx.step("the pause window passes", () => waitPast(pausedAt, PAUSE_S));
      await ctx.step("the sweep times the pause out", () => sweepUntil(ctx, m, "cancelled pause_timeout", (r) => r.status === "cancelled"));
      await expectExitToast(ctx, watch, "exit-toast-tk-nc7", C["TK-NC7"]);
      await checkNoContest(
        ctx,
        m,
        {
          reason: "pause_timeout",
          timekeeperId: cast.green.me.id,
          historyReason: "pause_timeout",
          dropOut: false,
          notified: [{ kind: "match_timed_out", recipients: [...m.athletes, cast.green.me.id] }],
        },
        cast.red,
      );
    });
  },
};
export default scenario;
