import type { Scenario } from "../context";
import { lit, psql } from "../../lib/psql";
import { blueChallengesRed, finishWithDraw, prepare, readyToLive, T } from "../flows";

/**
 * Blue's OWN timer must end the match. The duration is shortened in SQL after
 * the match row exists, so Blue is cold-relaunched into the match to make its
 * wizard re-read `duration_seconds` (otherwise it would still run a 10-minute
 * clock). The bot never auto-ends here: the only way it can leave the live
 * step is Blue's `match_ended`, which proves Blue's auto-end fired.
 */
const scenario: Scenario = {
  id: "E11",
  tier: "extended",
  title: "Timer auto-end: Blue's own 20s timer ends the match and tells Red",
  async run(ctx) {
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const h = await blueChallengesRed(ctx, red);
    await psql(`update public.matches set duration_seconds = 20 where id = ${lit(h.matchId)}`);
    const side = await ctx.matchSide(red, h.matchId);
    await ctx.step("cold-relaunch Blue into the match so it re-reads the duration", async () => {
      await ctx.simctl.terminate();
      await ctx.simctl.launch();
      await ctx.idb.waitFor({ label: "Home", type: "Button" }, 30_000).catch(() => undefined);
      await ctx.simctl.openUrl(`elorated://match/${h.matchId}`);
      await ctx.ui.waitStep("weight", T.step);
    });
    const started = await readyToLive(ctx, side);
    if (started.kind !== "started") throw new Error("match did not start");
    await ctx.expect("bot:blue-auto-ended-and-told-red", "received", async () => {
      // 20s clock + AUTO_END_DELAY_MS (1s) + slack. No bot-side auto-end.
      await side.waitForEnd(20_000 + 15_000);
      return "received";
    });
    await ctx.expect("ui:blue-auto-ends-to-result", true, async () => {
      await ctx.ui.waitStep("result", T.step);
      return true;
    });
    await finishWithDraw(ctx, side);
  },
};
export default scenario;
