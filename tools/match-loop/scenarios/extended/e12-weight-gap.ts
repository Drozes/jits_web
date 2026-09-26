import type { Scenario } from "../context";
import { db } from "../../oracle/db";
import { blueEnds, blueRecordsSubmission, bothConfirm, checkSummary, exitToArena, openToLive, prepare, stakesFor } from "../flows";

const scenario: Scenario = {
  id: "E12",
  tier: "extended",
  title: "Weight gap (Red 200 lbs): phantom ELO applied, gap stamped and shown",
  async run(ctx) {
    await prepare(ctx, { weights: { red: 200 } });
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(red, 1000, 1000, 170, 200);
    ctx.oracle("stakes:gap-positive", stakes.weight_division_gap > 0, ">0", stakes.weight_division_gap);
    const { h, side } = await openToLive(ctx, red);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue);
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU WON", stakes.challenger_win);
    const parts = await db.participants(h.matchId);
    ctx.eq(
      "db:gap-and-deltas",
      { gap: stakes.weight_division_gap, blue: stakes.challenger_win, red: stakes.opponent_loss },
      {
        gap: parts[0]?.weight_division_gap,
        blue: parts.find((p) => p.athlete_id === ctx.ids.blue)?.elo_delta,
        red: parts.find((p) => p.athlete_id === ctx.ids.red)?.elo_delta,
      },
    );
    const gapText = await ctx.idb.find({ label: /weight class(es)? apart/i });
    ctx.eq("ui:summary-gap-note", true, !!gapText);
    await exitToArena(ctx);
  },
};
export default scenario;
