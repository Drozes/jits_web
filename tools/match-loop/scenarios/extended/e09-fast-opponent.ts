import type { Scenario } from "../context";
import { blueEnds, blueRecordsSubmission, bothConfirm, checkSummary, exitToArena, openToLive, prepare, stakesFor } from "../flows";

const scenario: Scenario = {
  id: "E9",
  tier: "extended",
  title: "Fast opponent (<100ms reactions): Blue's confirm step must still see Red's confirmation (H8)",
  async run(ctx) {
    ctx.opts.timing = "fast";
    await prepare(ctx);
    const red = await ctx.bot("red");
    await red.goLive();
    const stakes = await stakesFor(red);
    const { side } = await openToLive(ctx, red);
    await blueEnds(ctx, side);
    await blueRecordsSubmission(ctx, side, ctx.ids.blue);
    await bothConfirm(ctx, side);
    await checkSummary(ctx, "YOU WON", stakes.challenger_win);
    await exitToArena(ctx);
  },
};
export default scenario;
